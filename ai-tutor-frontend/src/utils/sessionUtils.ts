/**
 * Session utility functions
 */
import type { Message, SessionInfo } from '../types'
import { SESSION_CONFIG } from '../config/theme'

/**
 * Extract a title from session messages (first user message)
 */
export const getSessionTitle = (messages: Message[]): string => {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (firstUserMessage) {
    const content = firstUserMessage.content.trim()
    return content.length > SESSION_CONFIG.MAX_TITLE_LENGTH 
      ? content.slice(0, SESSION_CONFIG.MAX_TITLE_LENGTH - 3) + '...' 
      : content
  }
  return SESSION_CONFIG.DEFAULT_TITLE
}

/**
 * Get a title for a session from session info
 * Falls back to timestamp-based title if no title is set
 */
export const getSessionTitleFromInfo = (session: SessionInfo): string => {
  // Use the AI-generated title if available
  if (session.title) {
    return session.title
  }
  
  // Fallback to time-based title
  const date = new Date(session.created_at)
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  })
  
  return `Chat at ${timeStr}`
}

/**
 * Group sessions by time period
 */
export const groupSessionsByTime = (sessions: SessionInfo[]): Record<string, SessionInfo[]> => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const lastWeek = new Date(today)
  lastWeek.setDate(lastWeek.getDate() - 7)
  const lastMonth = new Date(today)
  lastMonth.setMonth(lastMonth.getMonth() - 1)

  const groups: Record<string, SessionInfo[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 days': [],
    'Last 30 days': [],
    Older: [],
  }

  sessions.forEach((session) => {
    const sessionDate = new Date(session.last_accessed)
    
    if (sessionDate >= today) {
      groups.Today.push(session)
    } else if (sessionDate >= yesterday) {
      groups.Yesterday.push(session)
    } else if (sessionDate >= lastWeek) {
      groups['Last 7 days'].push(session)
    } else if (sessionDate >= lastMonth) {
      groups['Last 30 days'].push(session)
    } else {
      groups.Older.push(session)
    }
  })

  // Remove empty groups
  Object.keys(groups).forEach((key) => {
    if (groups[key].length === 0) {
      delete groups[key]
    }
  })

  return groups
}
