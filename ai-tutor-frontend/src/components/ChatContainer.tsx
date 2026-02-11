/**
 * Main chat container component - Supports stacked and split layouts
 */
import { lazy, Suspense } from 'react'
import { useChat } from '../hooks/useChat'
import { useChatStore } from '../store/chatStore'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

// Lazy load CodeEditor (includes Monaco Editor and Pyodide)
const CodeEditor = lazy(() => import('./CodeEditor').then(module => ({ default: module.CodeEditor })))

// Loading fallback for CodeEditor
const CodeEditorLoader = () => (
  <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
    <div className="flex flex-col items-center space-y-3">
      <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <p className="text-white text-sm">Loading code editor...</p>
    </div>
  </div>
)

export const ChatContainer = () => {
  const { messages, isLoading, error, sendMessage } = useChat()
  const { codeEditor } = useChatStore()

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 px-6 py-4 animate-fade-in">
          <div className="flex items-start space-x-3">
            <span className="text-red-500 text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Error occurred</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Always Split on Desktop, Hide Editor on Mobile */}
      <div className="flex-1 overflow-hidden bg-white flex flex-col">
        <div className="flex-1 overflow-hidden flex">
          {codeEditor.isOpen && window.innerWidth >= 1024 ? (
            /* Split View: Chat + Editor Side-by-Side (Desktop Only) */
            <>
              {/* Chat Section */}
              <div className="flex-1 overflow-hidden border-r border-gray-200 flex justify-center">
                <div className="w-full max-w-4xl">
                  <MessageList messages={messages} isLoading={isLoading} onSendMessage={sendMessage} hideSplitEditor />
                </div>
              </div>

              {/* Editor Section */}
              <div className="w-[45%] overflow-hidden bg-white flex flex-col px-3 py-3">
                <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200 h-full">
                  <Suspense fallback={<CodeEditorLoader />}>
                    <CodeEditor onSendMessage={sendMessage} />
                  </Suspense>
                </div>
              </div>
            </>
          ) : (
            /* Stacked View: Original Layout */
            <div className="flex-1 overflow-hidden w-full">
              <MessageList messages={messages} isLoading={isLoading} onSendMessage={sendMessage} />
            </div>
          )}
        </div>
        
        {/* Chat Input - Spans full width in both modes */}
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  )
}
