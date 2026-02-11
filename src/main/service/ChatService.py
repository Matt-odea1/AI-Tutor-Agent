# src/main/service/ChatService.py
"""
ChatService: Handles chat workflow for /chat endpoint.
- Manages conversation history per session
- Searches vector store for relevant context
- Builds prompt with history and context
- Applies pedagogy mode-specific prompts
- Calls agent client
- Returns answer and metadata
"""
from typing import Optional, List
import uuid
import logging
from src.main.dtos.PedagogyMode import PedagogyMode
from src.main.service.PromptService import get_prompt_service

logger = logging.getLogger(__name__)


class ChatServiceError(Exception):
    pass

DEFAULT_SYSTEM = (
    "You are a helpful AI tutor for programming students. Use the provided context to answer accurately and clearly. "
    "If the context is insufficient, use your knowledge to be helpful while noting any uncertainty. "
    "If asking clarifying questions would be more helpful, do so. "
    "Provide explanations that promote understanding, not just answers. "
    "When referencing previous conversation, be natural and helpful."
)

class ChatService:
    def __init__(
        self,
        vector_service,
        agent_client,
        memory,  # ConversationMemory instance
        *,
        max_context_chars: int = 8000,
        max_history_messages: int = 10,
        system_preamble: Optional[str] = None,
        prompt_service=None,  # PromptService for pedagogy modes
    ):
        self.vector_service = vector_service
        self.agent_client = agent_client
        self.memory = memory
        self.max_context_chars = max_context_chars
        self.max_history_messages = max_history_messages
        self.system_preamble = system_preamble or DEFAULT_SYSTEM
        self.prompt_service = prompt_service or get_prompt_service()
        logger.info(f"ChatService initialized with max_context_chars={max_context_chars}, max_history_messages={max_history_messages}")

    def chat(
        self, 
        query: str, 
        top_k: int = 5, 
        session_id: Optional[str] = None,
        include_history: bool = True,
        pedagogy_mode: Optional[str] = None,
        editor_code: Optional[str] = None,
        editor_selection: Optional[str] = None,
        last_stdout: Optional[str] = None,
        last_error: Optional[str] = None,
        language: Optional[str] = None,
    ) -> dict:
        """
        Process a chat query with conversation history and context retrieval.
        
        Args:
            query: User's question
            top_k: Number of context chunks to retrieve
            session_id: Optional session ID (auto-generated if None)
            include_history: Whether to include conversation history
            pedagogy_mode: Teaching mode (explanatory, debugging, practice)
        
        Returns:
            dict with keys: answer, session_id, is_new_session, history_length, 
                           pedagogy_mode, context_ids, tokens_input, tokens_output, model_id
        """
        # Step 1: Handle session ID (hybrid approach)
        if session_id is None:
            session_id = str(uuid.uuid4())
            is_new_session = True
            logger.info(f"Generated new session ID: {session_id[:8]}...")
        else:
            is_new_session = not self.memory.session_exists(session_id)
            if is_new_session:
                logger.info(f"First message for session: {session_id[:8]}...")
            else:
                logger.debug(f"Continuing session: {session_id[:8]}...")
        
        # Step 1.5: Determine and set pedagogy mode
        if pedagogy_mode is None:
            # Use session's existing mode or default
            pedagogy_mode = self.memory.get_pedagogy_mode(session_id)
            # Migrate old mode values to new 3-mode system
            pedagogy_mode = self._migrate_old_mode(pedagogy_mode)
            logger.debug(f"Using session pedagogy mode: {pedagogy_mode}")
        else:
            # Validate and set new mode for session
            try:
                mode_enum = self.prompt_service.validate_mode(pedagogy_mode)
                pedagogy_mode = mode_enum.value
                self.memory.set_pedagogy_mode(session_id, pedagogy_mode)
                logger.info(f"Set pedagogy mode for session {session_id[:8]}... to '{pedagogy_mode}'")
            except ValueError as e:
                logger.warning(f"Invalid pedagogy mode '{pedagogy_mode}', using default: {e}")
                pedagogy_mode = "explanatory"
                self.memory.set_pedagogy_mode(session_id, pedagogy_mode)
        
        # Step 2: Retrieve conversation history
        history = []
        if include_history and not is_new_session:
            history = self.memory.get_history(session_id, max_messages=self.max_history_messages)
            logger.debug(f"Retrieved {len(history)} previous messages for session {session_id[:8]}...")
        
        # Step 3: Perform vector search for relevant context
        try:
            results = self.vector_service.semantic_search(query=query, top_k=top_k)
            logger.debug(f"Vector search returned {len(results)} results")
        except Exception as e:
            raise ChatServiceError(f"Vector search failed: {e}")
        
        context_chunks = [r["text"] for r in results]
        context_ids = [r["id"] for r in results]
        context_str = "\n---\n".join(context_chunks)
        
        if len(context_str) > self.max_context_chars:
            context_str = context_str[:self.max_context_chars]
            logger.debug(f"Truncated context to {self.max_context_chars} chars")
        
        # Step 4: Build messages with system prompt (including pedagogy mode), history, context, and query
        messages = self._build_messages(
            query,
            context_str,
            history,
            pedagogy_mode,
            editor_code=editor_code,
            editor_selection=editor_selection,
            last_stdout=last_stdout,
            last_error=last_error,
            language=language,
        )
        
        # Step 5: Call LLM
        logger.info(f"[ChatService] query='{query[:50]}...', top_k={top_k}, mode={pedagogy_mode}, context_len={len(context_str)}, history_len={len(history)}")
        
        try:
            result = self.agent_client.chat(messages)
        except Exception as e:
            raise ChatServiceError(f"Agent call failed: {e}")
        
        # Step 6: Extract answer and metadata
        if isinstance(result, str):
            answer = result
            tokens_input = None
            tokens_output = None
            model_id = None
        elif isinstance(result, dict):
            answer = result.get("content") or result.get("answer") or ""
            tokens_input = result.get("tokens_input")
            tokens_output = result.get("tokens_output")
            model_id = result.get("model_id")
        else:
            answer = str(result)
            tokens_input = None
            tokens_output = None
            model_id = None
        
        # Step 6.5: Clean reasoning tags from model output
        answer = self._strip_reasoning_tags(answer)
        
        # Step 7: Store this conversation exchange in memory
        self.memory.add_message(
            session_id=session_id,
            role="user",
            content=query,
            tokens=tokens_input
        )
        self.memory.add_message(
            session_id=session_id,
            role="assistant",
            content=answer,
            tokens=tokens_output,
            context_ids=context_ids
        )
        
        logger.info(f"Stored conversation exchange in session {session_id[:8]}...")
        
        # Step 7.5: Generate session title if this is the first message
        if is_new_session:
            try:
                title = self._generate_session_title(query)
                self.memory.update_session_title(session_id, title)
                logger.info(f"Generated title for session {session_id[:8]}...: '{title}'")
            except Exception as e:
                logger.warning(f"Failed to generate session title: {e}")
        
        # Step 8: Return enhanced response
        return {
            "answer": answer,
            "session_id": session_id,
            "is_new_session": is_new_session,
            "history_length": len(history),
            "pedagogy_mode": pedagogy_mode,
            "context_ids": context_ids,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
            "model_id": model_id,
        }
    
    def _build_messages(
        self, 
        query: str, 
        context_str: str, 
        history: List[dict],
        pedagogy_mode: str,
        *,
        editor_code: Optional[str] = None,
        editor_selection: Optional[str] = None,
        last_stdout: Optional[str] = None,
        last_error: Optional[str] = None,
        language: Optional[str] = None,
    ) -> List[dict]:
        """
        Build the messages array for the LLM with proper formatting.
        
        Format:
        - Base system preamble
        - Pedagogy mode-specific prompt
        - Conversation history (if any)
        - Document context
        - Current question
        """
        content_parts = []
        
        # 1. System preamble with pedagogy mode instructions
        try:
            mode_enum = PedagogyMode.from_string(pedagogy_mode)
            mode_prompt = self.prompt_service.get_mode_prompt(mode_enum)
            
            # Combine base system prompt with mode-specific instructions
            combined_system = f"{self.system_preamble}\n\n---\n\n{mode_prompt}"
            content_parts.append(combined_system)
            logger.debug(f"Applied {pedagogy_mode} mode prompt ({len(mode_prompt)} chars)")
        except Exception as e:
            # Fallback to default system prompt if mode loading fails
            logger.error(f"Error loading pedagogy mode prompt: {e}, using default")
            content_parts.append(self.system_preamble)
        
        # 2. Add conversation history if present
        if history:
            history_text = self._format_history(history)
            content_parts.append(history_text)
        
        # 3. Add retrieved document context
        if context_str:
            content_parts.append(f"Relevant course materials:\n{context_str}")

        # 3.5 Add editor context (code, selection, output, error)
        editor_context = self._format_editor_context(
            editor_code=editor_code,
            editor_selection=editor_selection,
            last_stdout=last_stdout,
            last_error=last_error,
            language=language,
        )
        if editor_context:
            content_parts.append(editor_context)
        
        # 4. Add current question
        content_parts.append(f"Current question:\n{query}")
        
        # Flatten content parts into a single string for GPT-OSS and standard models
        # Models expect: {"role": "user", "content": "string"}
        # NOT: {"role": "user", "content": [{"text": "..."}, ...]}
        content_string = "\n\n".join(content_parts)
        
        return [
            {"role": "user", "content": content_string}
        ]

    def _format_editor_context(
        self,
        *,
        editor_code: Optional[str] = None,
        editor_selection: Optional[str] = None,
        last_stdout: Optional[str] = None,
        last_error: Optional[str] = None,
        language: Optional[str] = None,
    ) -> str:
        """Format editor-related context for inclusion in the prompt."""
        if not any([editor_code, editor_selection, last_stdout, last_error, language]):
            return ""

        lang = (language or "").strip() or "text"
        parts = ["Editor context:"]

        if language:
            parts.append(f"Language: {language}")

        if editor_selection:
            parts.append("Selection:\n```{lang}\n{selection}\n```".format(
                lang=lang,
                selection=editor_selection,
            ))

        if editor_code:
            parts.append("Full editor code:\n```{lang}\n{code}\n```".format(
                lang=lang,
                code=editor_code,
            ))

        if last_stdout:
            parts.append("Last stdout:\n```\n{stdout}\n```".format(stdout=last_stdout))

        if last_error:
            parts.append("Last error:\n```\n{error}\n```".format(error=last_error))

        context = "\n".join(parts)
        if len(context) <= 12000:
            return context

        head = context[:7200]
        tail = context[-4800:]
        return f"{head}\n\n... [truncated] ...\n\n{tail}"
    
    def _format_history(self, history: List[dict]) -> str:
        """
        Format conversation history for inclusion in prompt.
        """
        if not history:
            return ""
        
        lines = ["Previous conversation in this session:"]
        for msg in history:
            role_label = "Student" if msg["role"] == "user" else "Tutor"
            content = msg["content"]
            # Truncate very long messages to save tokens
            if len(content) > 500:
                content = content[:500] + "..."
            lines.append(f"{role_label}: {content}")
        
        lines.append("")  # Blank line separator
        return "\n".join(lines)
    
    def _generate_session_title(self, first_message: str) -> str:
        """
        Generate a short 2-3 word title for a session based on the first user message.
        
        Args:
            first_message: The user's first message in the session
            
        Returns:
            A concise title (2-3 words)
        """
        prompt = f"""Generate a very short, concise title (2-3 words maximum) for a chat session based on this first message.

First message: "{first_message}"

Examples:
- "How do I print text in Python?" → "Print Function"
- "Explain recursion to me" → "Recursion Basics"
- "Help me debug this code" → "Debug Help"
- "What are lists?" → "Python Lists"

Provide only the title, nothing else. Keep it short and descriptive."""
        
        messages = [
            {"role": "user", "content": prompt}
        ]
        
        try:
            result = self.agent_client.chat(messages)
            
            # Extract title from result
            if isinstance(result, str):
                title = result.strip()
            elif isinstance(result, dict):
                title = result.get("content", "New Chat").strip()
            else:
                title = "New Chat"
            
            # Strip reasoning tags if present
            title = self._strip_reasoning_tags(title)
            
            # Clean up the title (remove quotes, limit length)
            title = title.strip('"\'\'').strip()
            
            # Ensure it's not too long (max 30 chars)
            if len(title) > 30:
                title = title[:27] + "..."
            
            return title if title else "New Chat"
            
        except Exception as e:
            logger.error(f"Error generating session title: {e}")
            return "New Chat"
    
    def _migrate_old_mode(self, mode: str) -> str:
        """
        Migrate old 5-mode system values to new 3-mode system.
        
        Args:
            mode: Old or new mode value
            
        Returns:
            Valid mode value from new 3-mode system
        """
        # Map old modes to new modes
        mode_migration = {
            'socratic': 'practice',      # Socratic -> Practice
            'assessment': 'practice',     # Assessment -> Practice
            'review': 'explanatory',      # Review -> Explanatory
            # New modes pass through
            'explanatory': 'explanatory',
            'debugging': 'debugging',
            'practice': 'practice'
        }
        
        migrated = mode_migration.get(mode, 'explanatory')
        if migrated != mode:
            logger.info(f"Migrated old mode '{mode}' to '{migrated}'")
        return migrated
    
    def _strip_reasoning_tags(self, text: str) -> str:
        """
        Remove <reasoning>...</reasoning> tags and their content from model output.
        The model may use these tags for internal chain-of-thought reasoning,
        but we don't want to show this to end users.
        """
        import re
        # Remove reasoning tags and their content (case-insensitive)
        cleaned = re.sub(r'<reasoning>.*?</reasoning>', '', text, flags=re.IGNORECASE | re.DOTALL)
        # Remove any leftover standalone tags
        cleaned = re.sub(r'</?reasoning>', '', cleaned, flags=re.IGNORECASE)
        # Clean up excessive whitespace
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        return cleaned.strip()
