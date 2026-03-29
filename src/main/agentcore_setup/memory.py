"""
memory.py
Conversation memory for managing chat history across sessions.
Supports in-memory storage with extension points for Redis/persistent backends.
"""
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
import logging

logger = logging.getLogger(__name__)


class ConversationMemory:
    """
    Manages conversation history with the following structure per session:
    {
        "session_id": {
            "messages": [
                {"role": "user", "content": "...", "timestamp": "...", "tokens": 100},
                {"role": "assistant", "content": "...", "timestamp": "...", "tokens": 200, "context_ids": [...]}
            ],
            "created_at": "2025-11-13T10:00:00",
            "last_accessed": "2025-11-13T10:05:00",
            "total_tokens": 300
        }
    }
    """
    
    def __init__(self, max_sessions: int = 1000):
        """
        Initialize conversation memory.
        
        Args:
            max_sessions: Maximum number of sessions to keep in memory
        """
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.max_sessions = max_sessions
        logger.info(f"ConversationMemory initialized with max_sessions={max_sessions}")

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
        if session_id not in self.sessions:
            self._create_session(session_id)
        
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        if tokens is not None:
            message["tokens"] = tokens
            self.sessions[session_id]["total_tokens"] += tokens
        
        if context_ids is not None:
            message["context_ids"] = context_ids
        
        self.sessions[session_id]["messages"].append(message)
        self.sessions[session_id]["last_accessed"] = datetime.now(timezone.utc).isoformat()
        
        logger.debug(f"Added {role} message to session {session_id[:8]}... (total messages: {len(self.sessions[session_id]['messages'])})")

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
            List of message dictionaries, most recent last (returns a copy)
        """
        if session_id not in self.sessions:
            return []
        
        self.sessions[session_id]["last_accessed"] = datetime.now(timezone.utc).isoformat()
        messages = self.sessions[session_id]["messages"]
        
        if max_messages is not None and max_messages > 0 and len(messages) > max_messages:
            return list(messages[-max_messages:])  # Return copy of slice
        
        return list(messages)  # Return copy of all messages

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
        return session_id in self.sessions

    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata about a session.
        
        Returns:
            Dict with session metadata or None if session doesn't exist
        """
        if session_id not in self.sessions:
            return None
        
        session = self.sessions[session_id]
        return {
            "session_id": session_id,
            "message_count": len(session["messages"]),
            "created_at": session["created_at"],
            "last_accessed": session["last_accessed"],
            "total_tokens": session["total_tokens"],
            "pedagogy_mode": session.get("pedagogy_mode", "explanatory")
        }

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """
        Alias for get_session_info for backward compatibility.
        
        Returns:
            Dict with session metadata (empty dict if session doesn't exist)
        """
        info = self.get_session_info(session_id)
        return info if info is not None else {}

    def list_sessions(self) -> List[Dict[str, Any]]:
        """
        List all active sessions with metadata.
        
        Returns:
            List of session info dictionaries
        """
        return [
            self.get_session_info(session_id) 
            for session_id in self.sessions.keys()
        ]

    def clear_session(self, session_id: str) -> bool:
        """
        Clear/delete a specific session.
        
        Returns:
            True if session was deleted, False if it didn't exist
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleared session {session_id[:8]}...")
            return True
        return False

    def set_pedagogy_mode(self, session_id: str, mode: str) -> None:
        """
        Set the pedagogy mode for a session.
        
        Args:
            session_id: Session identifier
            mode: Pedagogy mode (explanatory or concise)
        """
        if session_id not in self.sessions:
            self._create_session(session_id)
        
        self.sessions[session_id]["pedagogy_mode"] = mode
        logger.debug(f"Set pedagogy mode for session {session_id[:8]}... to '{mode}'")

    def get_pedagogy_mode(self, session_id: str) -> str:
        """
        Get the pedagogy mode for a session.
        
        Args:
            session_id: Session identifier
        
        Returns:
            Pedagogy mode string (defaults to 'explanatory' if not set)
        """
        if session_id not in self.sessions:
            return "explanatory"
        
        return self.sessions[session_id].get("pedagogy_mode", "explanatory")

    def prune_old_sessions(self, max_age_hours: int = 24) -> int:
        """
        Remove sessions that haven't been accessed in max_age_hours.
        
        Args:
            max_age_hours: Maximum age in hours before pruning
        
        Returns:
            Number of sessions pruned
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        cutoff_iso = cutoff.isoformat()
        
        sessions_to_remove = [
            session_id
            for session_id, data in self.sessions.items()
            if data["last_accessed"] < cutoff_iso
        ]
        
        for session_id in sessions_to_remove:
            del self.sessions[session_id]
        
        if sessions_to_remove:
            logger.info(f"Pruned {len(sessions_to_remove)} old sessions (older than {max_age_hours}h)")
        
        return len(sessions_to_remove)

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
        if session_id not in self.sessions:
            return 0
        
        messages = self.sessions[session_id]["messages"]
        if len(messages) <= max_messages:
            return 0
        
        removed_count = len(messages) - max_messages
        self.sessions[session_id]["messages"] = messages[-max_messages:]
        
        # Recalculate total tokens
        total_tokens = sum(
            msg.get("tokens", 0) 
            for msg in self.sessions[session_id]["messages"]
        )
        self.sessions[session_id]["total_tokens"] = total_tokens
        
        logger.info(f"Truncated session {session_id[:8]}... removed {removed_count} old messages")
        return removed_count

    def _create_session(self, session_id: str) -> None:
        """
        Internal method to create a new session entry.
        """
        # Enforce max sessions limit
        if len(self.sessions) >= self.max_sessions:
            # Remove oldest session by last_accessed
            oldest_session = min(
                self.sessions.items(),
                key=lambda x: x[1]["last_accessed"]
            )[0]
            del self.sessions[oldest_session]
            logger.warning(f"Max sessions reached, removed oldest session {oldest_session[:8]}...")
        
        now = datetime.now(timezone.utc).isoformat()
        self.sessions[session_id] = {
            "messages": [],
            "created_at": now,
            "last_accessed": now,
            "total_tokens": 0,
            "pedagogy_mode": "explanatory"  # Default mode
        }
        logger.info(f"Created new session {session_id[:8]}...")

    # Legacy compatibility methods
    def get_state(self, session_id: str) -> Dict[str, Any]:
        """Legacy method for backward compatibility."""
        return self.get_session_info(session_id) or {}

    def set_state(self, session_id: str, state: Dict[str, Any]):
        """Legacy method for backward compatibility."""
        if session_id not in self.sessions:
            self._create_session(session_id)

    def clear_state(self, session_id: str):
        """Legacy method for backward compatibility."""
        self.clear_session(session_id)


