/**
 * Tests for session utilities
 */
import { describe, it, expect } from 'vitest'
import { getSessionTitle, getSessionTitleFromInfo } from './sessionUtils'
import type { Message, SessionInfo } from '../types'

describe('sessionUtils', () => {
  describe('getSessionTitle', () => {
    it('should extract title from first user message', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello, how are you?', timestamp: '2024-01-15T12:00:00Z' },
        { role: 'assistant', content: 'I am doing well!', timestamp: '2024-01-15T12:00:05Z' },
      ]
      const result = getSessionTitle(messages)
      expect(result).toBe('Hello, how are you?')
    })

    it('should truncate long messages', () => {
      const longMessage = 'This is a very long message that should be truncated to 50 characters maximum'
      const messages: Message[] = [
        { role: 'user', content: longMessage, timestamp: '2024-01-15T12:00:00Z' },
      ]
      const result = getSessionTitle(messages)
      expect(result).toHaveLength(50) // 47 chars + '...'
      expect(result.endsWith('...')).toBe(true)
    })

    it('should return default title for empty messages', () => {
      const result = getSessionTitle([])
      expect(result).toBe('New conversation')
    })

    it('should return default title when no user messages', () => {
      const messages: Message[] = [
        { role: 'assistant', content: 'Hello!', timestamp: '2024-01-15T12:00:00Z' },
      ]
      const result = getSessionTitle(messages)
      expect(result).toBe('New conversation')
    })

    it('should trim whitespace from message', () => {
      const messages: Message[] = [
        { role: 'user', content: '  Hello  ', timestamp: '2024-01-15T12:00:00Z' },
      ]
      const result = getSessionTitle(messages)
      expect(result).toBe('Hello')
    })
  })

  describe('getSessionTitleFromInfo', () => {
    it('should use AI-generated title if available', () => {
      const session: SessionInfo = {
        session_id: 'test-123',
        created_at: '2024-01-15T12:00:00Z',
        last_accessed: '2024-01-15T12:05:00Z',
        message_count: 5,
        total_tokens: 100,
        title: 'Python Variables Discussion',
      }
      const result = getSessionTitleFromInfo(session)
      expect(result).toBe('Python Variables Discussion')
    })

    it('should fallback to time-based title when no title', () => {
      const session: SessionInfo = {
        session_id: 'test-123',
        created_at: '2024-01-15T12:00:00Z',
        last_accessed: '2024-01-15T12:05:00Z',
        message_count: 5,
        total_tokens: 100,
      }
      const result = getSessionTitleFromInfo(session)
      expect(result).toMatch(/Chat from/)
    })

    it('should handle empty title string', () => {
      const session: SessionInfo = {
        session_id: 'test-123',
        created_at: '2024-01-15T12:00:00Z',
        last_accessed: '2024-01-15T12:05:00Z',
        message_count: 5,
        total_tokens: 100,
        title: '',
      }
      const result = getSessionTitleFromInfo(session)
      expect(result).toMatch(/Chat from/)
    })
  })
})
