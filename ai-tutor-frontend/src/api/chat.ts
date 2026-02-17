/**
 * Chat API methods
 */
import { apiClient } from './client'
import { API_ENDPOINTS } from '../config/api.config'
import type { ChatRequest, ChatResponse, ChatHistoryResponse } from '../types'

/**
 * Send a chat message to the AI tutor
 */
export const sendChatMessage = async (request: ChatRequest): Promise<ChatResponse> => {
  const response = await apiClient.post<ChatResponse>(API_ENDPOINTS.CHAT, request)
  return response.data
}

/**
 * Get conversation history for a session
 */
export const getChatHistory = async (sessionId: string): Promise<ChatHistoryResponse> => {
  const response = await apiClient.get<ChatHistoryResponse>(
    API_ENDPOINTS.CHAT_HISTORY(sessionId)
  )
  return response.data
}

/**
 * Delete a chat session
 */
export const deleteSession = async (sessionId: string): Promise<void> => {
  await apiClient.delete(API_ENDPOINTS.DELETE_SESSION(sessionId))
}
