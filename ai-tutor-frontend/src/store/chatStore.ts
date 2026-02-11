/**
 * Zustand store for chat state management
 */
import { create } from 'zustand'
import type { Message } from '../types/chat'
import type { PedagogyMode } from '../types/pedagogy'
import type { CodeEditorState } from '../types/code'
import type { SessionInfo } from '../types/session'
import type { AppMode } from '../types/appMode'
import { DEFAULT_PEDAGOGY_MODE, STORAGE_KEYS } from '../config/constants'

interface ChatStore {
  // State
  messages: Message[]
  sessionId: string | null
  appMode: AppMode | null
  pedagogyMode: PedagogyMode
  isLoading: boolean
  error: string | null
  layoutMode: 'stacked' | 'split'
  
  // Session Management State
  sessions: SessionInfo[]
  isLoadingSessions: boolean
  
  // Code Editor State
  codeEditor: CodeEditorState

  // Actions
  addMessage: (message: Message) => void
  setMessages: (messages: Message[]) => void
  setSessionId: (id: string | null) => void
  setAppMode: (mode: AppMode | null) => void
  setPedagogyMode: (mode: PedagogyMode) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setLayoutMode: (mode: 'stacked' | 'split') => void
  clearMessages: () => void
  clearSession: () => void
  
  // Session Management Actions
  setSessions: (sessions: SessionInfo[]) => void
  loadSession: (sessionId: string, messages: Message[]) => void
  deleteSessionFromStore: (sessionId: string) => void
  setLoadingSessions: (loading: boolean) => void
  
  // Code Editor Actions
  setEditorCode: (code: string) => void
  setEditorOpen: (isOpen: boolean) => void
  setEditorMinimized: (isMinimized: boolean) => void
  setEditorOutput: (output: string | null, error: string | null) => void
  setEditorExecuting: (isExecuting: boolean) => void
  setEditorSelection: (selection: string | null) => void
  clearEditor: () => void
  insertCodeIntoEditor: (code: string) => void
  addToHistory: (code: string, output: string | null, error: string | null) => void
  loadFromHistory: (index: number) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  // Initial state - always start with a new session
  messages: [],
  sessionId: null,
  appMode: (localStorage.getItem(STORAGE_KEYS.APP_MODE) as AppMode) || null,
  pedagogyMode: (localStorage.getItem(STORAGE_KEYS.PEDAGOGY_MODE) as PedagogyMode) || DEFAULT_PEDAGOGY_MODE,
  isLoading: false,
  error: null,
  layoutMode: 'split',
  
  // Session Management Initial State
  sessions: [],
  isLoadingSessions: false,
  
  // Code Editor Initial State
  codeEditor: {
    code: '# Write your Python code here\nprint("Hello, COMP9021!")\n',
    isOpen: false,
    isMinimized: false,
    lastOutput: null,
    lastError: null,
    isExecuting: false,
    selection: null,
    history: [],
  },

  // Actions
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setMessages: (messages) => set({ messages }),

  setSessionId: (id) => {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.SESSION_ID, id)
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION_ID)
    }
    set({ sessionId: id })
  },

  setAppMode: (mode) => {
    if (mode) {
      localStorage.setItem(STORAGE_KEYS.APP_MODE, mode)
    } else {
      localStorage.removeItem(STORAGE_KEYS.APP_MODE)
    }
    set({ appMode: mode })
  },

  setPedagogyMode: (mode) => {
    localStorage.setItem(STORAGE_KEYS.PEDAGOGY_MODE, mode)
    set({ pedagogyMode: mode })
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setLayoutMode: (mode) => set({ layoutMode: mode }),

  clearMessages: () => set({ messages: [] }),

  clearSession: () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_ID)
    set({ messages: [], sessionId: null, error: null })
  },
  
  // Session Management Actions
  setSessions: (sessions) => set({ sessions }),
  
  loadSession: (sessionId, messages) => {
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId)
    set({ sessionId, messages, error: null })
  },
  
  deleteSessionFromStore: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.session_id !== sessionId),
    })),
  
  setLoadingSessions: (loading) => set({ isLoadingSessions: loading }),
  
  // Code Editor Actions
  setEditorCode: (code) =>
    set((state) => ({
      codeEditor: { ...state.codeEditor, code },
    })),

  setEditorOpen: (isOpen) =>
    set((state) => ({
      codeEditor: { ...state.codeEditor, isOpen },
    })),

  setEditorMinimized: (isMinimized) =>
    set((state) => ({
      codeEditor: { ...state.codeEditor, isMinimized },
    })),

  setEditorOutput: (output, error) =>
    set((state) => ({
      codeEditor: { ...state.codeEditor, lastOutput: output, lastError: error },
    })),

  setEditorExecuting: (isExecuting) =>
    set((state) => ({
      codeEditor: { ...state.codeEditor, isExecuting },
    })),

  setEditorSelection: (selection) =>
    set((state) => ({
      codeEditor: { ...state.codeEditor, selection },
    })),

  clearEditor: () =>
    set((state) => ({
      codeEditor: {
        ...state.codeEditor,
        code: '# Write your Python code here\nprint("Hello, COMP9021!")\n',
        lastOutput: null,
        lastError: null,
        selection: null,
      },
    })),

  insertCodeIntoEditor: (code) =>
    set((state) => ({
      codeEditor: { 
        ...state.codeEditor, 
        code,
        isOpen: true,
        isMinimized: false,
        selection: null,
      },
    })),

  addToHistory: (code, output, error) =>
    set((state) => ({
      codeEditor: {
        ...state.codeEditor,
        history: [
          { code, output, error, timestamp: Date.now() },
          ...state.codeEditor.history.slice(0, 4), // Keep last 5
        ],
      },
    })),

  loadFromHistory: (index) =>
    set((state) => {
      const entry = state.codeEditor.history[index]
      if (!entry) return state
      
      return {
        codeEditor: {
          ...state.codeEditor,
          code: entry.code,
          lastOutput: entry.output,
          lastError: entry.error,
          selection: null,
        },
      }
    }),
}))
