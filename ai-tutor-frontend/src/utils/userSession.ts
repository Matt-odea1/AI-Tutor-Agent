import { STORAGE_KEYS } from '../config/constants'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type UserSession = {
  user_id: string
  email: string
  expires_at: number
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const sha256Hex = async (value: string) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const toUuid = (hex: string) => {
  const clean = hex.replace(/[^a-f0-9]/gi, '').slice(0, 32).padEnd(32, '0')
  const part1 = clean.slice(0, 8)
  const part2 = clean.slice(8, 12)
  const part3 = `4${clean.slice(13, 16)}`
  const variantNibble = ((parseInt(clean.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
  const part4 = `${variantNibble}${clean.slice(17, 20)}`
  const part5 = clean.slice(20, 32)
  return `${part1}-${part2}-${part3}-${part4}-${part5}`
}

export const generateUserIdFromEmail = async (email: string) => {
  const normalized = normalizeEmail(email)
  const hash = await sha256Hex(normalized)
  return toUuid(hash)
}

export const getUserSession = (): UserSession | null => {
  const raw = localStorage.getItem(STORAGE_KEYS.USER_SESSION)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as UserSession
    if (!parsed?.user_id || !parsed?.email || !parsed?.expires_at) return null
    if (Date.now() > parsed.expires_at) {
      localStorage.removeItem(STORAGE_KEYS.USER_SESSION)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const setUserSession = async (email: string): Promise<UserSession> => {
  const user_id = await generateUserIdFromEmail(email)
  const session: UserSession = {
    user_id,
    email: normalizeEmail(email),
    expires_at: Date.now() + WEEK_MS,
  }
  localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(session))
  return session
}

export const clearUserSession = () => {
  localStorage.removeItem(STORAGE_KEYS.USER_SESSION)
}
