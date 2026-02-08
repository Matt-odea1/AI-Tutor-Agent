/**
 * Sidebar component for session management - ChatGPT style
 */
import { useChatStore } from '../store/chatStore'
import { useState, useEffect } from 'react'
import { useSessions } from '../hooks/useSessions'
import { getSessionTitleFromInfo } from '../utils/sessionUtils'
import { formatRelativeTime } from '../utils/formatTime'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import { SessionSkeletonList } from './SessionSkeleton'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { trackSessionCreated } from '../utils/analytics'
import edLogo from '../assets/edLogo.png'

export const Sidebar = () => {
  const { sessionId, clearSession } = useChatStore()
  const {
    sessions,
    isLoadingSessions,
    fetchSessions,
    loadSessionHistory,
    handleDeleteSession,
  } = useSessions()
  
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    sessionId: string
    title: string
  } | null>(null)
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)

  const handleNewChat = () => {
    clearSession()
    // Refresh sessions list to show the new empty state
    fetchSessions()
    // Scroll to top if needed
    window.scrollTo(0, 0)
    // Track session creation
    trackSessionCreated()
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      action: handleNewChat,
      description: 'New chat',
    },
    {
      key: 'b',
      ctrl: true,
      action: () => setIsCollapsed(!isCollapsed),
      description: 'Toggle sidebar',
    },
  ]);

  // Load sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Auto-collapse sidebar on mobile devices
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) {
        setIsCollapsed(true)
      }
    }
    
    // Check on mount
    checkMobile()
    
    // Check on resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleLoadSession = async (sid: string) => {
    if (sid === sessionId) return // Already loaded
    
    setLoadingSessionId(sid)
    try {
      await loadSessionHistory(sid)
      // Scroll chat to top
      window.scrollTo(0, 0)
    } catch (error) {
      console.error('Error loading session:', error)
    } finally {
      setLoadingSessionId(null)
    }
  }

  const handleDeleteClick = (sid: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirm({ sessionId: sid, title })
  }

  const executeDelete = async () => {
    if (!deleteConfirm) return
    
    try {
      await handleDeleteSession(deleteConfirm.sessionId)
      // Refresh sessions list
      fetchSessions()
    } catch (error) {
      console.error('Error deleting session:', error)
    } finally {
      setDeleteConfirm(null)
    }
  }

  if (isCollapsed) {
    return (
      <div className="w-16 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4 pb-5">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          title="Expand sidebar"
        >
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full pb-3">
      {/* Header with Logo, New Chat, and Collapse */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          {/* Logo */}
          <a
            href="https://edstem.org/au/courses/28065/discussion"
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-lg overflow-hidden shadow-lg flex-shrink-0 bg-white"
            title="Open Ed discussion"
          >
            <img
              src={edLogo}
              alt="Ed discussion"
              className="w-full h-full object-contain scale-110"
            />
          </a>
          
          {/* New Chat Button - fills available space */}
          <button
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md transition-colors duration-150 border border-gray-700 hover:border-gray-600"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium">New Chat</span>
          </button>
          
          {/* Collapse Button */}
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
        {isLoadingSessions ? (
          <SessionSkeletonList count={5} />
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <svg
              className="w-12 h-12 mx-auto text-gray-600 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-sm text-gray-500">No previous sessions</p>
            <p className="text-xs text-gray-600 mt-1">Start a new chat to begin</p>
          </div>
        ) : (
          sessions.map((session) => {
            const title = getSessionTitleFromInfo(session)
            const isActive = sessionId === session.session_id
            const isLoading = loadingSessionId === session.session_id

            return (
              <button
                key={session.session_id}
                onClick={() => handleLoadSession(session.session_id)}
                disabled={isLoading}
                className={`w-full text-left px-2.5 py-2 rounded-md transition-colors group relative ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                } ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{title}</p>
                      {isLoading && (
                        <div className="animate-spin h-2.5 w-2.5 border border-primary-500 border-t-transparent rounded-full" />
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {formatRelativeTime(session.last_accessed)}
                    </p>
                  </div>
                  <div
                    onClick={(e) => handleDeleteClick(session.session_id, title, e as any)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-opacity flex-shrink-0 cursor-pointer"
                    title="Delete session"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleDeleteClick(session.session_id, title, e as any)
                      }
                    }}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteConfirm !== null}
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirm(null)}
        sessionTitle={deleteConfirm?.title}
      />

      {/* Sidebar Footer */}
      <div className="px-6 py-2 pt-5 border-t border-gray-800">
        <div className="flex items-center space-x-3 h-[40px]">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-black text-sm font-bold">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium text-white truncate">User</p>
              <div className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-green-400">Online</span>
              </div>
            </div>
            <a 
              href="/data-usage" 
              className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
            >
              How is my data used?
            </a>
          </div>
        </div>
      </div>
    </aside>
  )
}
