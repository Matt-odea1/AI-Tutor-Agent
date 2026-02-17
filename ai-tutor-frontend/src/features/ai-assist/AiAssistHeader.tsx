import type { AssistantThreadResponse } from '../../api/history'

interface AiAssistHeaderProps {
  threads: AssistantThreadResponse[]
  threadId: string | null
  isLoadingThreads: boolean
  onNewChat: () => void
  onSelectThread: (threadId: string) => void
}

export const AiAssistHeader = ({
  threads,
  threadId,
  isLoadingThreads,
  onNewChat,
  onSelectThread,
}: AiAssistHeaderProps) => {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        AI Assistant
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onNewChat}
          className="px-2 py-1 text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-md hover:bg-primary-100 transition-colors"
        >
          New
        </button>
        <select
          value={threadId || ''}
          onChange={(event) => onSelectThread(event.target.value)}
          className="h-6 min-w-[140px] text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-primary-500"
          disabled={isLoadingThreads || threads.length === 0}
          aria-label="Assistant threads"
        >
          <option value="" disabled>
            {isLoadingThreads ? 'Loading…' : threads.length === 0 ? 'No threads' : 'Threads'}
          </option>
          {threads.map((thread) => (
            <option key={thread.thread_id} value={thread.thread_id}>
              {thread.title || 'Assistant Thread'}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
