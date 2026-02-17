import { API_ENDPOINTS } from '../config/api.config'
import apiClient from './client'

export type LoginApiResponse = {
  access_token: string
  token_type: string
  expires_in: number
  user_id: string
  email: string
  roles: string[]
}

export const loginWithEmailPassword = async (email: string, password: string): Promise<LoginApiResponse> => {
  const response = await apiClient.post<LoginApiResponse>(API_ENDPOINTS.AUTH_LOGIN, {
    email,
    password,
  })

  return response.data
}

export const signupWithEmailPassword = async (email: string, password: string): Promise<LoginApiResponse> => {
  const response = await apiClient.post<LoginApiResponse>(API_ENDPOINTS.AUTH_SIGNUP, {
    email,
    password,
  })

  return response.data
}
