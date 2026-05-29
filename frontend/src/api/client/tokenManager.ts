const SESSION_STORAGE_KEY = 'af_auth_session'
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
  refreshToken?: string
  expiresAt?: number
  refreshExpiresAt?: number
  tokenType?: string
  user?: AuthSessionUserSnapshot | null
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }
    return window.localStorage
  } catch {
    return null
  }
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function safeGetItem(storage: Storage, key: string) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value)
  } catch {
    // Storage can be disabled or quota-restricted; auth state should degrade to memoryless.
  }
}

function safeRemoveItem(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
  } catch {
    // Ignore storage cleanup failures in restricted browser contexts.
  }
}

function readLegacySession(storage: Storage): AuthSession | null {
  const accessToken = safeGetItem(storage, LEGACY_TOKEN_KEY)
  if (!accessToken) {
    return null
  }

  return {
    accessToken,
    tokenType: 'Bearer',
    user: parseJson<AuthSessionUserSnapshot>(safeGetItem(storage, LEGACY_USER_KEY)),
  }
}

function normalizeSession(session: AuthSession): AuthSession {
  return {
    ...session,
    tokenType: session.tokenType?.trim() || 'Bearer',
  }
}

export function readSession(): AuthSession | null {
  const storage = getStorage()
  if (!storage) {
    return memorySession ? normalizeSession(memorySession) : null
  }

  const current = parseJson<AuthSession>(safeGetItem(storage, SESSION_STORAGE_KEY))
  if (current?.accessToken) {
    memorySession = normalizeSession(current)
    return normalizeSession(current)
  }

  const legacySession = readLegacySession(storage)
  memorySession = legacySession ? normalizeSession(legacySession) : memorySession
  return legacySession ? normalizeSession(legacySession) : memorySession
}

export function getAccessToken() {
  return readSession()?.accessToken ?? null
}

export function getRefreshToken() {
  return readSession()?.refreshToken ?? null
}

export function setSession(session: AuthSession) {
  memorySession = normalizeSession(session)
  const storage = getStorage()
  if (!storage) {
    return
  }

  safeSetItem(storage, SESSION_STORAGE_KEY, JSON.stringify(memorySession))
}

export function clearSession() {
  memorySession = null
  const storage = getStorage()
  if (!storage) {
    return
  }

  safeRemoveItem(storage, SESSION_STORAGE_KEY)
  safeRemoveItem(storage, LEGACY_TOKEN_KEY)
  safeRemoveItem(storage, LEGACY_USER_KEY)
}

export function isAccessTokenExpiringSoon(windowMs = DEFAULT_EXPIRING_SOON_WINDOW_MS) {
  const expiresAt = readSession()?.expiresAt
  if (!expiresAt) {
    return false
  }

  return expiresAt - Date.now() <= windowMs
}

export const tokenManager = {
  getAccessToken,
  getRefreshToken,
  setSession,
  clearSession,
  isAccessTokenExpiringSoon,
  readSession,
}
