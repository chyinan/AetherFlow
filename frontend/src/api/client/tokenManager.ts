const LEGACY_REFRESH_KEY = 'af_auth_refresh'
const LEGACY_SESSION_KEY = 'af_auth_session'
const LEGACY_TOKEN_KEY = 'af_token'
const LEGACY_USER_KEY = 'af_user'
const DEFAULT_EXPIRING_SOON_WINDOW_MS = 60_000

let memorySession: AuthSession | null = null

export interface AuthSessionUserSnapshot {
  id?: string
  name?: string
  username?: string
  role?: string
  roles?: string[]
  workspace?: string
  [key: string]: unknown
}

export interface AuthSession {
  accessToken: string
  // Present only for explicit demo sessions. Production refresh credentials
  // live in an HttpOnly SameSite cookie and are not JavaScript-readable.
  refreshToken?: string
  expiresAt?: number
  refreshExpiresAt?: number
  tokenType?: string
  user?: AuthSessionUserSnapshot | null
}

function storage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null
    }
    return window[kind]
  } catch {
    return null
  }
}

function remove(storageValue: Storage | null, key: string) {
  try {
    storageValue?.removeItem(key)
  } catch {
    // Restricted browser storage must not prevent authentication cleanup.
  }
}

function clearLegacyCredentials() {
  const sessionStorage = storage('sessionStorage')
  const localStorage = storage('localStorage')

  remove(sessionStorage, LEGACY_REFRESH_KEY)
  remove(localStorage, LEGACY_SESSION_KEY)
  remove(localStorage, LEGACY_TOKEN_KEY)
  remove(localStorage, LEGACY_USER_KEY)
}

function normalizeSession(session: AuthSession): AuthSession {
  return {
    ...session,
    tokenType: session.tokenType?.trim() || 'Bearer',
  }
}

export function readSession(): AuthSession | null {
  clearLegacyCredentials()
  return memorySession ? normalizeSession(memorySession) : null
}

export function getAccessToken() {
  return readSession()?.accessToken || null
}

export function getRefreshToken() {
  return readSession()?.refreshToken ?? null
}

export function setSession(session: AuthSession) {
  clearLegacyCredentials()
  memorySession = normalizeSession(session)
}

export function clearSession() {
  memorySession = null
  clearLegacyCredentials()
}

export function isAccessTokenExpiringSoon(windowMs = DEFAULT_EXPIRING_SOON_WINDOW_MS) {
  const expiresAt = readSession()?.expiresAt
  return expiresAt ? expiresAt - Date.now() <= windowMs : false
}

export const tokenManager = {
  getAccessToken,
  getRefreshToken,
  setSession,
  clearSession,
  isAccessTokenExpiringSoon,
  readSession,
}
