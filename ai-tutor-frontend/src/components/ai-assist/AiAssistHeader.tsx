import type { SessionInfo } from '../../types/session'
import { getSessionTitleFromInfo } from '../../utils/sessionUtils'

interface AiAssistHeaderProps {
  sessions: SessionInfo[]
  sessionId: string | null
  isLoadingSessions: boolean
  onNewChat: () => void
  onSelectSession: (sessionId: string) => void
}

export const AiAssistHeader = ({
  sessions,
  sessionId,
  isLoadingSessions,
  onNewChat,
  onSelectSession,
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
          New chat
        </button>
        <select
          value={sessionId || ''}
          onChange={(event) => onSelectSession(event.target.value)}
          className="h-6 text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-primary-500"
          disabled={isLoadingSessions || sessions.length === 0}
          aria-label="Chat history"
        >
          <option value="" disabled>
            {isLoadingSessions ? 'Loading…' : 'History'}
          </option>
          {sessions.map((session) => (
            <option key={session.session_id} value={session.session_id}>
              {getSessionTitleFromInfo(session)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
