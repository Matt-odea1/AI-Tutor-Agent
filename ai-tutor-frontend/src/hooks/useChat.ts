/**
 * Custom hook for managing chat interactions with the AI tutor
 * 
 * Provides functionality for sending messages, managing chat state,
 * clearing history, and handling session management.
 * 
 * @returns Object containing:
 *   - messages: Array of chat messages
 *   - sessionId: Current session ID (null for new sessions)
 *   - pedagogyMode: Active pedagogy mode
 *   - isLoading: Loading state during API calls
 *   - error: Error message (if any)
 *   - sendMessage: Function to send a user message
 *   - clearChat: Function to clear chat history
 * 
 * @example
 * ```tsx
 * const { messages, sendMessage, isLoading } = useChat();
 * 
 * const handleSubmit = async (text: string) => {
 *   await sendMessage(text);
 * };
 * ```
 */
import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { sendChatMessage } from '../api/chat'
import type { Message, ChatEditorContext } from '../types/chat'

export const useChat = () => {
  const {
    messages,
    sessionId,
    pedagogyMode,
    isLoading,
    error,
    addMessage,
    setSessionId,
    setLoading,
    setError,
  } = useChatStore()

  const sendMessage = useCallback(
    async (content: string, editorContext?: ChatEditorContext) => {
      if (!content.trim() || isLoading) return

      // Add user message immediately
      const userMessage: Message = {
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      }
      addMessage(userMessage)
      setError(null)
      setLoading(true)

      try {
        // Send to backend
        const response = await sendChatMessage({
          query: content.trim(),
          session_id: sessionId,
          include_history: true,
          pedagogy_mode: pedagogyMode,
          top_k: 5,
          ...editorContext,
        })

        // Update session ID if new session
        if (response.is_new_session && response.session_id) {
          setSessionId(response.session_id)
        }

        // Add assistant response
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.answer,
          timestamp: new Date().toISOString(),
          tokens: response.tokens_output || undefined,
          context_ids: response.context_ids,
        }
        addMessage(assistantMessage)
      } catch (err) {
        console.error('Failed to send message:', err)
        
        // Check if it's a model/server error
        let userFriendlyMessage = "I'm sorry, I can't handle that right now. Please try again in a moment."
        
        if (err instanceof Error) {
          // Check for specific error types
          if (err.message.includes('Network Error') || err.message.includes('fetch')) {
            userFriendlyMessage = "I'm having trouble connecting right now. Please check your connection and try again."
          } else if (err.message.includes('timeout')) {
            userFriendlyMessage = "The request took too long. Please try again with a shorter message."
          } else if (err.message.includes('500') || err.message.includes('503')) {
            userFriendlyMessage = "I'm experiencing technical difficulties right now. Please try again in a moment."
          } else if (err.message.includes('ValidationException') || err.message.includes('model')) {
            userFriendlyMessage = "I'm having trouble processing your request right now. Our team has been notified."
          }
        }
        
        setError(userFriendlyMessage)
        
        // Add friendly error message to chat
        const errorMsg: Message = {
          role: 'assistant',
          content: userFriendlyMessage,
          timestamp: new Date().toISOString(),
          isError: true,
        }
        addMessage(errorMsg)
      } finally {
        setLoading(false)
      }
    },
    [sessionId, pedagogyMode, isLoading, addMessage, setSessionId, setLoading, setError]
  )

  return {
    messages,
    sessionId,
    pedagogyMode,
    isLoading,
    error,
    sendMessage,
  }
}
