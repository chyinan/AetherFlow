// Token storage strategy (security hardening, High-severity XSS finding):
//
//   access token  -> memory only (`memorySession.accessToken`). It is NEVER
//                    written to localStorage or sessionStorage, so an XSS
//                    payload can only steal tokens that are currently held in
//                    memory during a live SPA session — it cannot harvest them
//                    from persistent storage on a later load.
//
//   refresh token -> sessionStorage (key `af_auth_refresh`). sessionStorage is
//                    scoped to a single tab and cleared when the tab closes,
//                    so its lifetime is much shorter than localStorage. This
//                    lets the SPA silently recover a fresh access token after
//                    a same-tab reload (memory was wiped, refresh survives).
//
// TODO(security): the long-term goal is for the backend auth refresh endpoint
// to issue the refresh token as a `Set-Cookie: refresh_token; HttpOnly; Secure;
// SameSite=Strict` cookie. Once that ships, the refresh token is no longer
// JS-readable and the sessionStorage persistence below should be removed
// entirely (the browser will attach the cookie automatically on refresh
// requests). Until then, sessionStorage is the lowest-cost mitigation that
// does not require backend changes.
//
// @see https://github.com/chyinan/AetherFlow/issues
const REFRESH_STORAGE_KEY = 'af_auth_refresh'
// Pre-fix keys kept only for one-time migration; new code never writes to
// them.
const LEGACY_SESSION_KEY = 'af_auth_session' // whole session (incl. access token) in localStorage
const LEGACY_TOKEN_KEY = 'af_token' // oldest layout: access token only
const LEGACY_USER_KEY = 'af_user' // oldest layout: user snapshot JSON
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
  // `accessToken` is always "" (empty) when the session was reconstructed only
  // from persisted refresh-token state (e.g. right after a tab reload). Callers
  // that need a real access token must trigger a refresh first.
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  refreshExpiresAt?: number
  tokenType?: string
  user?: AuthSessionUserSnapshot | null
}

/** Subset of AuthSession that is allowed to be persisted to sessionStorage. */
interface PersistedRefresh {
  refreshToken?: string
  refreshExpiresAt?: number
  tokenType?: string
  user?: AuthSessionUserSnapshot | null
}

function getRefreshStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null
    }
    return window.sessionStorage
  } catch {
    return null
  }
}

function getLegacyStorage(): Storage | null {
  // Only used for the one-time migration off the pre-fix localStorage layout
  // and for defensive cleanup. New code MUST NOT write tokens here.
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

function readPersistedRefresh(): PersistedRefresh | null {
  const storage = getRefreshStorage()
  if (!storage) {
    return null
  }
  return parseJson<PersistedRefresh>(safeGetItem(storage, REFRESH_STORAGE_KEY))
}

function writePersistedRefresh(entry: PersistedRefresh | null) {
  const storage = getRefreshStorage()
  if (!storage) {
    return
  }
  if (!entry || !entry.refreshToken) {
    safeRemoveItem(storage, REFRESH_STORAGE_KEY)
    return
  }
  safeSetItem(storage, REFRESH_STORAGE_KEY, JSON.stringify(entry))
}

function readLegacyLocalStorageSession(): AuthSession | null {
  // One-time migration from the pre-fix storage layout. Older versions stored
  // the entire session (access token included) in localStorage, either under
  // LEGACY_SESSION_KEY (newer) or LEGACY_TOKEN_KEY + LEGACY_USER_KEY (oldest).
  // We read the data once and wipe the localStorage entries so no access token
  // lingers there; the caller re-stores the refresh token in sessionStorage
  // via setSession/readSession side-effects.
  const storage = getLegacyStorage()
  if (!storage) {
    return null
  }

  const aggregated = parseJson<AuthSession>(safeGetItem(storage, LEGACY_SESSION_KEY))
  if (aggregated?.accessToken || aggregated?.refreshToken) {
    safeRemoveItem(storage, LEGACY_SESSION_KEY)
    return aggregated
  }

  const legacyAccessToken = safeGetItem(storage, LEGACY_TOKEN_KEY)
  if (legacyAccessToken) {
    const user = parseJson<AuthSessionUserSnapshot>(safeGetItem(storage, LEGACY_USER_KEY))
    safeRemoveItem(storage, LEGACY_TOKEN_KEY)
    safeRemoveItem(storage, LEGACY_USER_KEY)
    return { accessToken: legacyAccessToken, tokenType: 'Bearer', user }
  }

  return null
}

function normalizeSession(session: AuthSession): AuthSession {
  return {
    ...session,
    tokenType: session.tokenType?.trim() || 'Bearer',
  }
}

export function readSession(): AuthSession | null {
  // 1) Memory-first: if we already have a session (post-login, post-refresh, or
  //    post-migration), prefer it — it is the only place the access token lives.
  if (memorySession) {
    return normalizeSession(memorySession)
  }

  // 2) Refresh-token-only persistence (typical post-reload state): rebuild a
  //    session whose access token is empty so callers know they must refresh
  //    before issuing authenticated requests.
  const persisted = readPersistedRefresh()
  if (persisted?.refreshToken) {
    memorySession = normalizeSession({
      accessToken: '',
      refreshToken: persisted.refreshToken,
      refreshExpiresAt: persisted.refreshExpiresAt,
      tokenType: persisted.tokenType,
      user: persisted.user ?? null,
    })
    return normalizeSession(memorySession)
  }

  // 3) One-time migration from a legacy localStorage entry. After migration,
  //    the access token lives only in memory and the refresh token is
  //    re-persisted to sessionStorage.
  const legacy = readLegacyLocalStorageSession()
  if (legacy) {
    memorySession = normalizeSession(legacy)
    if (legacy.refreshToken) {
      writePersistedRefresh({
        refreshToken: legacy.refreshToken,
        refreshExpiresAt: legacy.refreshExpiresAt,
        tokenType: legacy.tokenType,
        user: legacy.user,
      })
    }
    return normalizeSession(memorySession)
  }

  return null
}

export function getAccessToken() {
  const token = readSession()?.accessToken
  // Empty string (reconstructed-from-refresh state) is treated as "no token".
  return token || null
}

export function getRefreshToken() {
  return readSession()?.refreshToken ?? null
}

export function setSession(session: AuthSession) {
  memorySession = normalizeSession(session)

  // Persist ONLY the refresh token (and the user snapshot, which is needed for
  // UI display across reloads). The access token MUST NOT be written to any
  // Storage — it lives in memory only.
  if (session.refreshToken) {
    writePersistedRefresh({
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      tokenType: session.tokenType,
      user: session.user,
    })
  } else {
    writePersistedRefresh(null)
  }

  // Defensive cleanup: ensure no legacy localStorage entry lingers. New code
  // never writes here, but old entries may exist from previous deployments.
  const legacyStorage = getLegacyStorage()
  if (legacyStorage) {
    safeRemoveItem(legacyStorage, LEGACY_SESSION_KEY)
    safeRemoveItem(legacyStorage, LEGACY_TOKEN_KEY)
    safeRemoveItem(legacyStorage, LEGACY_USER_KEY)
  }
}

export function clearSession() {
  memorySession = null
  const refreshStorage = getRefreshStorage()
  if (refreshStorage) {
    safeRemoveItem(refreshStorage, REFRESH_STORAGE_KEY)
  }
  const legacyStorage = getLegacyStorage()
  if (legacyStorage) {
    safeRemoveItem(legacyStorage, LEGACY_SESSION_KEY)
    safeRemoveItem(legacyStorage, LEGACY_TOKEN_KEY)
    safeRemoveItem(legacyStorage, LEGACY_USER_KEY)
  }
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
