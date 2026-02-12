/**
 * Custom hook for managing chat sessions
 */
import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { listSessions, getSessionHistory, deleteSession } from '../api/sessions'
import { createWorkspace } from '../api/historyV2'
import type { Message } from '../types/chat'

export const useSessions = () => {
  const {
    sessions,
    sessionId: currentSessionId,
    isLoadingSessions,
    workspaceId,
    setWorkspaceId,
    setSessions,
    loadSession,
    deleteSessionFromStore,
    setLoadingSessions,
    clearSession,
  } = useChatStore()

  /**
   * Fetch all sessions from the API
   */
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      let resolvedWorkspaceId = workspaceId
      if (!resolvedWorkspaceId) {
        const workspace = await createWorkspace('AI Assistant')
        resolvedWorkspaceId = workspace.workspace_id
        setWorkspaceId(resolvedWorkspaceId)
      }
      const data = await listSessions(resolvedWorkspaceId)
      setSessions(data.sessions)
    } catch (error) {
      console.error('Failed to load sessions:', error)
      // Optionally set an error state here
    } finally {
      setLoadingSessions(false)
    }
  }, [setSessions, setLoadingSessions, workspaceId])

  /**
   * Load a specific session's history
   */
  const loadSessionHistory = useCallback(
    async (sessionId: string) => {
      try {
        const data = await getSessionHistory(sessionId)
        
        // Convert API messages to frontend Message format
        const messages: Message[] = data.messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.timestamp,
          tokens: msg.tokens,
          context_ids: msg.context_ids,
        }))

        // Load session into store
        loadSession(sessionId, messages)
      } catch (error) {
        console.error('Failed to load session history:', error)
        throw error
      }
    },
    [loadSession]
  )

  /**
   * Delete a session
   */
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await deleteSession(sessionId)
        deleteSessionFromStore(sessionId)

        // If deleting the current session, clear it
        if (sessionId === currentSessionId) {
          clearSession()
        }
      } catch (error) {
        console.error('Failed to delete session:', error)
        throw error
      }
    },
    [currentSessionId, deleteSessionFromStore, clearSession]
  )

  /**
   * Create a new general chat session and load it
   */
  const createNewChatSession = useCallback(async () => {
    let resolvedWorkspaceId = workspaceId
    if (!resolvedWorkspaceId) {
      const workspace = await createWorkspace('AI Assistant')
      resolvedWorkspaceId = workspace.workspace_id
      setWorkspaceId(resolvedWorkspaceId)
    }
    // Create a new general chat session (view)
    const newSession = await import('../api/historyV2').then(m => m.createViewSession(resolvedWorkspaceId, 'chat'))
    // Fetch sessions and load the new session
    await fetchSessions()
    await loadSessionHistory(newSession.view_session_id)
  }, [workspaceId, setWorkspaceId, fetchSessions, loadSessionHistory])

  return {
    sessions,
    isLoadingSessions,
    fetchSessions,
    loadSessionHistory,
    handleDeleteSession,
    createNewChatSession,
  }
}
