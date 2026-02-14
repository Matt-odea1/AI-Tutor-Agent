/**
 * Main App component - Chat9021 Premium Theme with ChatGPT-style layout
 */
import { useEffect, useState } from 'react'
import './App.css'
import { ChatContainer } from './features/chat/ChatContainer'
import { Sidebar } from './features/sidebar/Sidebar'
import { ToastContainer } from './shared/ToastContainer'
import { KeyboardShortcutsModal } from './shared/KeyboardShortcutsModal'
import { ModeSelector } from './features/chat/ModeSelector'
import { IdeWorkspace } from './features/code-editor/IdeWorkspace'
import SEO from './shared/SEO'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useToastStore } from './store/toastStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useChatStore } from './store/chatStore'
import { webApplicationSchema, organizationSchema, injectStructuredData } from './utils/structuredData'
import { LoginGate } from './shared/LoginGate'
import { getUserSession, setUserSession, type UserSession } from './utils/userSession'

function App() {
  const isOnline = useOnlineStatus()
  const { addToast } = useToastStore()
  const { setEditorOpen, setLayoutMode, codeEditor, appMode } = useChatStore()
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [userSession, setUserSessionState] = useState<UserSession | null>(() => getUserSession())
  const [isReady] = useState(true)

  // Show toast when network status changes
  useEffect(() => {
    if (!isOnline) {
      addToast('You are currently offline. Some features may not work.', 'warning', 0)
    } else {
      addToast('Connection restored', 'success', 3000)
    }
  }, [isOnline, addToast])

  // Inject structured data for SEO
  useEffect(() => {
    const cleanupApp = injectStructuredData(webApplicationSchema)
    const cleanupOrg = injectStructuredData(organizationSchema)
    
    return () => {
      cleanupApp()
      cleanupOrg()
    }
  }, [])

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: '/',
      ctrl: true,
      action: () => setShowShortcuts(true),
      description: 'Show keyboard shortcuts',
    },
    {
      key: 'e',
      ctrl: true,
      action: () => setEditorOpen(!codeEditor.isOpen),
      description: 'Toggle code editor',
    },
    {
      key: 'Escape',
      action: () => setShowShortcuts(false),
      description: 'Close modal',
    },
  ]);

  useEffect(() => {
    if (appMode === 'chat') {
      setEditorOpen(false)
      setLayoutMode('stacked')
    }

    if (appMode === 'ide') {
      setLayoutMode('split')
    }
  }, [appMode, setEditorOpen, setLayoutMode])

  if (!isReady) {
    return null
  }

  if (!userSession) {
    return (
      <LoginGate
        onLogin={async (email) => {
          const session = await setUserSession(email)
          setUserSessionState(session)
        }}
      />
    )
  }

  return (
    <>
      {/* SEO Meta Tags */}
      <SEO
        title="Chat Interface"
        description="Interactive AI tutoring chat interface with code editor. Get help with programming, debug code, and learn through conversation."
        keywords="AI tutor, programming chat, code editor, Python learning, interactive coding"
      />

      {/* Skip to main content link for screen readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="app-container h-screen flex bg-white" role="application" aria-label="AI Tutor Chat Application">
        {/* Toast Notifications */}
        <ToastContainer />
        
        {/* Keyboard Shortcuts Modal */}
        {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
        
        {/* Sidebar - ChatGPT Style */}
        <Sidebar />

      {/* Main Content Area - Full Width */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main id="main-content" className="flex-1 overflow-hidden" role="main" aria-label="Main content">
          <div className="h-full">
            {!appMode && <ModeSelector />}
            {appMode === 'chat' && <ChatContainer />}
            {appMode === 'ide' && <IdeWorkspace />}
            {appMode === 'questions' && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <div className="text-3xl">📝</div>
                  <h2 className="text-xl font-semibold text-gray-900">Question Generation</h2>
                  <p className="text-sm text-gray-600">Coming soon.</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
    </>
  )
}

export default App
