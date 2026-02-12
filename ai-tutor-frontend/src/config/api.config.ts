/**
 * API configuration
 */

export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
} as const

export const API_ENDPOINTS = {
  CHAT: '/internal/chat',
  CHAT_HISTORY: (sessionId: string) => `/internal/chat/history/${sessionId}`,
  SESSIONS: '/internal/chat/sessions',
  DELETE_SESSION: (sessionId: string) => `/internal/chat/history/${sessionId}`,
  HISTORY_V2_WORKSPACES: '/internal/history-v2/workspaces',
  HISTORY_V2_VIEWS: '/internal/history-v2/views',
  HISTORY_V2_VIEW_HISTORY: (viewSessionId: string) => `/internal/history-v2/views/${viewSessionId}/history`,
  HISTORY_V2_CODEMEMORY: '/internal/history-v2/codememory',
  HISTORY_V2_CODEMEMORY_ID: (codeMemoryId: string) => `/internal/history-v2/codememory/${codeMemoryId}`,
  HISTORY_V2_PROGRAMS: '/internal/history-v2/programs',
  HISTORY_V2_PROGRAMS_BY_WORKSPACE: (workspaceId: string) => `/internal/history-v2/workspaces/${workspaceId}/programs`,
  HISTORY_V2_PROGRAM_ID: (programId: string) => `/internal/history-v2/programs/${programId}`,
  HISTORY_V2_EDIT_PROPOSAL: '/internal/history-v2/edit-proposal',
  HISTORY_V2_THREADS: (codeMemoryId: string) => `/internal/history-v2/codememory/${codeMemoryId}/threads`,
  HISTORY_V2_THREAD_HISTORY: (threadId: string) => `/internal/history-v2/threads/${threadId}/history`,
  HISTORY_V2_THREAD_MESSAGE: (threadId: string) => `/internal/history-v2/threads/${threadId}/message`,
  HEALTH: '/health',
} as const
