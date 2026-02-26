"""
dynamodb_memory.py
DynamoDB-backed conversation memory for persistent chat history across sessions.
Implements single-table design with PK/SK pattern for efficient queries.
"""
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
import os
import json

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class DynamoDBConversationMemory:
    """
    DynamoDB-backed conversation memory using single-table design.
    
    Schema:
    - PK: SESSION#<session_id>
    - SK: METADATA | MESSAGE#<timestamp>
    
    METADATA item stores session info:
    {
        "PK": "SESSION#abc123",
        "SK": "METADATA",
        "created_at": "2025-11-20T10:00:00Z",
        "last_accessed": "2025-11-20T10:05:00Z",
        "total_tokens": 500,
        "pedagogy_mode": "explanatory",
        "message_count": 10,
        "ttl": 1234567890  # Unix timestamp for auto-deletion
    }
    
    MESSAGE items store individual messages:
    {
        "PK": "SESSION#abc123",
        "SK": "MESSAGE#2025-11-20T10:00:00.123456Z",
        "role": "user",
        "content": "Hello",
        "timestamp": "2025-11-20T10:00:00.123456Z",
        "tokens": 5,
        "context_ids": ["doc1", "doc2"]  # Optional
    }
    """
    
    def __init__(
        self, 
        table_name: Optional[str] = None,
        region: Optional[str] = None,
        ttl_days: int = 30
    ):
        """
        Initialize DynamoDB conversation memory.
        
        Args:
            table_name: DynamoDB table name (defaults to DYNAMODB_TABLE_NAME env var)
            region: AWS region (defaults to DYNAMODB_REGION env var)
            ttl_days: Number of days before sessions auto-expire (default: 30)
        """
        self.table_name = table_name or os.getenv('DYNAMODB_TABLE_NAME', 'chat_sessions')
        self.region = region or os.getenv('DYNAMODB_REGION', 'us-east-1')
        self.ttl_days = ttl_days
        
        # Initialize DynamoDB client
        self.dynamodb = boto3.resource('dynamodb', region_name=self.region)
        self.table = self.dynamodb.Table(self.table_name)
        
        logger.info(
            f"DynamoDBConversationMemory initialized: "
            f"table={self.table_name}, region={self.region}, ttl_days={ttl_days}"
        )
    
    def add_message(
        self, 
        session_id: str, 
        role: str, 
        content: str,
        tokens: Optional[int] = None,
        context_ids: Optional[List[str]] = None
    ) -> None:
        """
        Add a message to a session's conversation history.
        
        Args:
            session_id: Unique session identifier
            role: Message role ("user" or "assistant")
            content: Message content
            tokens: Optional token count for this message
            context_ids: Optional list of document IDs used (for assistant messages)
        """
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Create or update metadata
        try:
            metadata = self._get_metadata(session_id)
            if metadata is None:
                self._create_session(session_id)
                metadata = self._get_metadata(session_id)
            
            # Add message item
            message_item = {
                'PK': f'SESSION#{session_id}',
                'SK': f'MESSAGE#{timestamp}',
                'role': role,
                'content': content,
                'timestamp': timestamp
            }
            
            if tokens is not None:
                message_item['tokens'] = tokens
            
            if context_ids is not None:
                message_item['context_ids'] = context_ids
            
            self.table.put_item(Item=message_item)
            
            # Update metadata
            update_expr = 'SET last_accessed = :la, message_count = message_count + :inc'
            expr_values = {
                ':la': timestamp,
                ':inc': 1
            }
            
            if tokens is not None:
                update_expr += ', total_tokens = total_tokens + :tokens'
                expr_values[':tokens'] = tokens
            
            self.table.update_item(
                Key={
                    'PK': f'SESSION#{session_id}',
                    'SK': 'METADATA'
                },
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values
            )
            
            logger.debug(
                f"Added {role} message to session {session_id[:8]}... "
                f"(tokens: {tokens or 0})"
            )
            
        except ClientError as e:
            logger.error(f"Failed to add message to DynamoDB: {e}")
            raise
    
    def get_history(
        self, 
        session_id: str, 
        max_messages: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve conversation history for a session.
        
        Args:
            session_id: Unique session identifier
            max_messages: Maximum number of recent messages to return (None = all)
        
        Returns:
            List of message dictionaries, most recent last
        """
        try:
            # Query all messages for this session
            response = self.table.query(
                KeyConditionExpression='PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues={
                    ':pk': f'SESSION#{session_id}',
                    ':sk': 'MESSAGE#'
                },
                ScanIndexForward=True  # Sort ascending (oldest first)
            )
            
            messages = []
            for item in response.get('Items', []):
                message = {
                    'role': item['role'],
                    'content': item['content'],
                    'timestamp': item['timestamp']
                }
                
                if 'tokens' in item:
                    message['tokens'] = int(item['tokens'])
                
                if 'context_ids' in item:
                    message['context_ids'] = item['context_ids']
                
                messages.append(message)
            
            # Update last_accessed
            if messages:
                self._update_last_accessed(session_id)
            
            # Apply max_messages limit if specified
            if max_messages is not None and max_messages > 0 and len(messages) > max_messages:
                messages = messages[-max_messages:]
            
            logger.debug(f"Retrieved {len(messages)} messages from session {session_id[:8]}...")
            return messages
            
        except ClientError as e:
            logger.error(f"Failed to get history from DynamoDB: {e}")
            return []
    
    def get_formatted_history(
        self, 
        session_id: str, 
        max_messages: Optional[int] = None
    ) -> str:
        """
        Get conversation history formatted as a string for LLM context.
        
        Args:
            session_id: Unique session identifier
            max_messages: Maximum number of recent messages to include
        
        Returns:
            Formatted conversation history string
        """
        history = self.get_history(session_id, max_messages)
        
        if not history:
            return ""
        
        formatted_lines = ["Previous conversation:"]
        for msg in history:
            role_label = "Student" if msg["role"] == "user" else "Tutor"
            formatted_lines.append(f"{role_label}: {msg['content']}")
        
        return "\n".join(formatted_lines)
    
    def session_exists(self, session_id: str) -> bool:
        """Check if a session exists."""
        return self._get_metadata(session_id) is not None
    
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata about a session.
        
        Returns:
            Dict with session metadata or None if session doesn't exist
        """
        metadata = self._get_metadata(session_id)
        if metadata is None:
            return None
        
        return {
            'session_id': session_id,
            'message_count': int(metadata.get('message_count', 0)),
            'created_at': metadata.get('created_at'),
            'last_accessed': metadata.get('last_accessed'),
            'total_tokens': int(metadata.get('total_tokens', 0)),
            'pedagogy_mode': metadata.get('pedagogy_mode', 'explanatory'),
            'title': metadata.get('title', 'New Chat')
        }
    
    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """
        Alias for get_session_info for backward compatibility.
        
        Returns:
            Dict with session metadata (empty dict if session doesn't exist)
        """
        info = self.get_session_info(session_id)
        return info if info is not None else {}
    
    def list_sessions(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        List recent sessions with metadata.
        
        Args:
            limit: Maximum number of sessions to return
        
        Returns:
            List of session info dictionaries, sorted by last_accessed (most recent first)
        """
        try:
            # Scan for all METADATA items (for small datasets)
            # For production with many sessions, consider using GSI on last_accessed
            response = self.table.scan(
                FilterExpression='SK = :sk',
                ExpressionAttributeValues={
                    ':sk': 'METADATA'
                },
                Limit=limit
            )
            
            sessions = []
            for item in response.get('Items', []):
                session_id = item['PK'].replace('SESSION#', '')
                sessions.append({
                    'session_id': session_id,
                    'message_count': int(item.get('message_count', 0)),
                    'created_at': item.get('created_at'),
                    'last_accessed': item.get('last_accessed'),
                    'total_tokens': int(item.get('total_tokens', 0)),
                    'pedagogy_mode': item.get('pedagogy_mode', 'explanatory'),
                    'title': item.get('title', 'New Chat')
                })
            
            # Sort by last_accessed (most recent first)
            sessions.sort(key=lambda x: x['last_accessed'], reverse=True)
            
            logger.debug(f"Listed {len(sessions)} sessions")
            return sessions
            
        except ClientError as e:
            logger.error(f"Failed to list sessions from DynamoDB: {e}")
            return []
    
    def clear_session(self, session_id: str) -> bool:
        """
        Clear/delete a specific session and all its messages.
        
        Returns:
            True if session was deleted, False if it didn't exist
        """
        try:
            # Query all items for this session
            response = self.table.query(
                KeyConditionExpression='PK = :pk',
                ExpressionAttributeValues={
                    ':pk': f'SESSION#{session_id}'
                }
            )
            
            items = response.get('Items', [])
            if not items:
                return False
            
            # Batch delete all items
            with self.table.batch_writer() as batch:
                for item in items:
                    batch.delete_item(
                        Key={
                            'PK': item['PK'],
                            'SK': item['SK']
                        }
                    )
            
            logger.info(f"Cleared session {session_id[:8]}... ({len(items)} items deleted)")
            return True
            
        except ClientError as e:
            logger.error(f"Failed to clear session from DynamoDB: {e}")
            return False
    
    def set_pedagogy_mode(self, session_id: str, mode: str) -> None:
        """
        Set the pedagogy mode for a session.
        
        Args:
            session_id: Session identifier
            mode: Pedagogy mode (explanatory or concise)
        """
        try:
            # Create session if it doesn't exist
            if not self.session_exists(session_id):
                self._create_session(session_id)
            
            # Update pedagogy mode
            self.table.update_item(
                Key={
                    'PK': f'SESSION#{session_id}',
                    'SK': 'METADATA'
                },
                UpdateExpression='SET pedagogy_mode = :mode',
                ExpressionAttributeValues={
                    ':mode': mode
                }
            )
            
            logger.debug(f"Set pedagogy mode for session {session_id[:8]}... to '{mode}'")
            
        except ClientError as e:
            logger.error(f"Failed to set pedagogy mode in DynamoDB: {e}")
            raise
    
    def get_pedagogy_mode(self, session_id: str) -> str:
        """
        Get the pedagogy mode for a session.
        
        Args:
            session_id: Session identifier
        
        Returns:
            Pedagogy mode string (defaults to 'explanatory' if not set)
        """
        metadata = self._get_metadata(session_id)
        if metadata is None:
            return 'explanatory'
        
        return metadata.get('pedagogy_mode', 'explanatory')
    
    def truncate_session_history(
        self, 
        session_id: str, 
        max_messages: int
    ) -> int:
        """
        Keep only the most recent max_messages in a session.
        
        Args:
            session_id: Session to truncate
            max_messages: Maximum messages to keep
        
        Returns:
            Number of messages removed
        """
        try:
            # Get all messages
            response = self.table.query(
                KeyConditionExpression='PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues={
                    ':pk': f'SESSION#{session_id}',
                    ':sk': 'MESSAGE#'
                },
                ScanIndexForward=True  # Oldest first
            )
            
            items = response.get('Items', [])
            if len(items) <= max_messages:
                return 0
            
            # Delete oldest messages
            messages_to_delete = items[:-max_messages]
            removed_tokens = sum(int(item.get('tokens', 0)) for item in messages_to_delete)
            
            with self.table.batch_writer() as batch:
                for item in messages_to_delete:
                    batch.delete_item(
                        Key={
                            'PK': item['PK'],
                            'SK': item['SK']
                        }
                    )
            
            # Update metadata
            self.table.update_item(
                Key={
                    'PK': f'SESSION#{session_id}',
                    'SK': 'METADATA'
                },
                UpdateExpression='SET message_count = :count, total_tokens = total_tokens - :tokens',
                ExpressionAttributeValues={
                    ':count': max_messages,
                    ':tokens': removed_tokens
                }
            )
            
            removed_count = len(messages_to_delete)
            logger.info(
                f"Truncated session {session_id[:8]}... "
                f"removed {removed_count} old messages ({removed_tokens} tokens)"
            )
            return removed_count
            
        except ClientError as e:
            logger.error(f"Failed to truncate session in DynamoDB: {e}")
            return 0
    
    # Internal helper methods
    
    def _get_metadata(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get metadata item for a session."""
        try:
            response = self.table.get_item(
                Key={
                    'PK': f'SESSION#{session_id}',
                    'SK': 'METADATA'
                }
            )
            return response.get('Item')
        except ClientError as e:
            logger.error(f"Failed to get metadata from DynamoDB: {e}")
            return None
    
    def _create_session(self, session_id: str, title: Optional[str] = None) -> None:
        """Create a new session metadata item."""
        now = datetime.now(timezone.utc).isoformat()
        ttl = int((datetime.now(timezone.utc) + timedelta(days=self.ttl_days)).timestamp())
        
        try:
            self.table.put_item(
                Item={
                    'PK': f'SESSION#{session_id}',
                    'SK': 'METADATA',
                    'created_at': now,
                    'last_accessed': now,
                    'total_tokens': 0,
                    'message_count': 0,
                    'pedagogy_mode': 'explanatory',
                    'title': title or 'New Chat',
                    'ttl': ttl  # Auto-delete after ttl_days
                }
            )
            logger.info(f"Created new session {session_id[:8]}... (TTL: {self.ttl_days} days)")
        except ClientError as e:
            logger.error(f"Failed to create session in DynamoDB: {e}")
            raise
    
    def _update_last_accessed(self, session_id: str) -> None:
        """Update the last_accessed timestamp for a session."""
        try:
            self.table.update_item(
                Key={
                    'PK': f'SESSION#{session_id}',
                    'SK': 'METADATA'
                },
                UpdateExpression='SET last_accessed = :la',
                ExpressionAttributeValues={
                    ':la': datetime.now(timezone.utc).isoformat()
                }
            )
        except ClientError as e:
            logger.debug(f"Failed to update last_accessed (non-critical): {e}")
    
    def update_session_title(self, session_id: str, title: str) -> None:
        """Update the title for a session."""
        try:
            self.table.update_item(
                Key={
                    'PK': f'SESSION#{session_id}',
                    'SK': 'METADATA'
                },
                UpdateExpression='SET title = :t',
                ExpressionAttributeValues={
                    ':t': title
                }
            )
            logger.info(f"Updated title for session {session_id[:8]}... to '{title}'")
        except ClientError as e:
            logger.error(f"Failed to update session title: {e}")
    
    # Legacy compatibility methods
    
    def get_state(self, session_id: str) -> Dict[str, Any]:
        """Legacy method for backward compatibility."""
        return self.get_session_info(session_id) or {}
    
    def set_state(self, session_id: str, state: Dict[str, Any]):
        """Legacy method for backward compatibility."""
        if not self.session_exists(session_id):
            self._create_session(session_id)
    
    def clear_state(self, session_id: str):
        """Legacy method for backward compatibility."""
        self.clear_session(session_id)
