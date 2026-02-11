import { useEffect, useState } from 'react'
import { useChat } from '../hooks/useChat'
import { useSessions } from '../hooks/useSessions'
import { useChatStore } from '../store/chatStore'
import type { PedagogyMode } from '../types/pedagogy'
import { AiAssistHeader, AiAssistInput, AiAssistMessageList } from './ai-assist'

export const AiAssistPanel = () => {
  const { messages, isLoading, error, sendMessage } = useChat()
  const { sessionId, clearSession, codeEditor } = useChatStore()
  const { sessions, isLoadingSessions, fetchSessions, loadSessionHistory } = useSessions()
  const [input, setInput] = useState('')
  const assistantMode: PedagogyMode = 'concise'

  const handleSend = () => {
    if (!input.trim() || isLoading) return
    sendMessage(input, {
      pedagogy_mode: assistantMode,
      editor_code: codeEditor.code,
      editor_selection: codeEditor.selection,
      last_stdout: codeEditor.lastOutput,
      last_error: codeEditor.lastError,
      language: 'python',
    })
    setInput('')
  }

  const handleNewChat = () => {
    clearSession()
    fetchSessions()
  }

  const handleSelectSession = async (selectedSessionId: string) => {
    if (!selectedSessionId || selectedSessionId === sessionId) return
    await loadSessionHistory(selectedSessionId)
  }

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])


  return (
    <aside className="w-full bg-slate-100 flex flex-col h-full">
      <AiAssistHeader
        sessions={sessions}
        sessionId={sessionId}
        isLoadingSessions={isLoadingSessions}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
      />

      {error && (
        <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <AiAssistMessageList messages={messages} isLoading={isLoading} />

      <AiAssistInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isLoading}
      />
    </aside>
  )
}
