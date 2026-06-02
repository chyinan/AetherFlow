import { toApiError } from '@/api/client/apiError'
import { tokenManager, type AuthSession, type AuthSessionUserSnapshot } from '@/api/client/tokenManager'
import {
  login as authLogin,
  logout as authLogout,
  me as authMe,
  refresh as authRefresh,
  register as authRegister,
  status as authStatus,
  type FrontendRole,
} from '@/api/modules/auth'
import { runtimeEnv } from '@/config/runtimeEnv'
import type { ServiceStatus } from '@/types/api'

import { delay } from '../mock/timing'

const DEFAULT_WORKSPACE = 'AetherFlow Lab'
const MOCK_LOGIN_USERNAME = 'aether.operator'
const MOCK_LOGIN_PASSWORD = 'mock-password'
const AUTH_FALLBACK_SOURCES = new Set(['auth', 'gateway'])
const AUTH_FALLBACK_UNAVAILABLE_STATUSES = new Set([0, 404, 500, 502, 503, 504])

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload extends LoginPayload {
  email: string
}

export interface AuthUser {
  id: string
  name: string
  role: FrontendRole
  workspace: string
  username?: string
  roles?: FrontendRole[]
  rawRoles?: string[]
  userId?: number
  [key: string]: unknown
}

export interface LoginResult {
  token: string
  user: AuthUser
  session?: AuthSession
}

function isFrontendRole(role: string): role is FrontendRole {
  return role === 'owner' || role === 'operator'
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toAuthUser(user: AuthSessionUserSnapshot | null | undefined): AuthUser {
  const userRecord = user as (AuthSessionUserSnapshot & { rawRoles?: unknown; userId?: unknown }) | null | undefined
  const role = user?.role === 'owner' ? 'owner' : 'operator'
  const roles = readStringArray(user?.roles).filter(isFrontendRole)

  return {
    id: typeof user?.id === 'string' && user.id ? user.id : 'user-cyan',
    name:
      (typeof user?.name === 'string' && user.name) ||
      (typeof user?.username === 'string' && user.username) ||
      'aether.operator',
    role,
    workspace:
      typeof user?.workspace === 'string' && user.workspace ? user.workspace : DEFAULT_WORKSPACE,
    username: typeof user?.username === 'string' ? user.username : undefined,
    roles,
    rawRoles: readStringArray(userRecord?.rawRoles),
    userId: readNumber(userRecord?.userId),
  }
}

function toLoginResult(session: AuthSession): LoginResult {
  return {
    token: session.accessToken,
    user: toAuthUser(session.user),
    session,
  }
}

function createMockSession(username = MOCK_LOGIN_USERNAME): AuthSession {
  const now = Date.now()
  const user: AuthUser = {
    id: 'user-cyan',
    name: username || 'aether.operator',
    role: 'operator',
    workspace: DEFAULT_WORKSPACE,
    username: username || 'aether.operator',
    roles: ['operator'],
    rawRoles: ['USER'],
  }

  return {
    accessToken: `mock-token-${username || 'demo'}`,
    refreshToken: `mock-refresh-${username || 'demo'}`,
    expiresAt: now + 60 * 60 * 1000,
    refreshExpiresAt: now + 8 * 60 * 60 * 1000,
    tokenType: 'Bearer',
    user,
  }
}

function shouldUseMockFallback(error: unknown) {
  if (!runtimeEnv.mockFallback) {
    return false
  }

  const apiError = toApiError(error, 'auth')

  if (apiError.source === 'network') {
    return true
  }

  const status = typeof apiError.status === 'number' ? apiError.status : Number(apiError.code)

  return (
    AUTH_FALLBACK_SOURCES.has(apiError.source) &&
    Number.isFinite(status) &&
    AUTH_FALLBACK_UNAVAILABLE_STATUSES.has(status)
  )
}

function isDefaultMockLogin(payload: LoginPayload) {
  return payload.username.trim() === MOCK_LOGIN_USERNAME && payload.password === MOCK_LOGIN_PASSWORD
}

function isMockSession(
  session: AuthSession | null,
): session is AuthSession & { accessToken: string; refreshToken: string } {
  return (
    typeof session?.accessToken === 'string' &&
    session.accessToken.startsWith('mock-token-') &&
    typeof session.refreshToken === 'string' &&
    session.refreshToken.startsWith('mock-refresh-')
  )
}

function mockLogin(payload: LoginPayload) {
  return delay<LoginResult>(toLoginResult(createMockSession(payload.username.trim())))
}

function mockStatuses() {
  return delay<ServiceStatus[]>([
    { name: 'Gateway', state: 'online', detail: 'mock gateway ready' },
    { name: 'Realtime', state: 'online', detail: 'mock stream connected' },
    { name: 'AI Runtime', state: 'degraded', detail: 'mock provider only' },
  ])
}

function mapAuthStatusToServiceStatuses(status: {
  onlineUserCount: number
  tokenCount: number
  loginFailureCount: number
}): ServiceStatus[] {
  return [
    {
      name: 'Auth',
      state: 'online',
      detail: `${status.onlineUserCount} online users`,
    },
    {
      name: 'Token Lifecycle',
      state: 'online',
      detail: `${status.tokenCount} active tokens`,
    },
    {
      name: 'Login Guard',
      state: status.loginFailureCount > 0 ? 'degraded' : 'online',
      detail: `${status.loginFailureCount} recent login failures`,
    },
  ]
}

export const authApi = {
  async login(payload: LoginPayload) {
    try {
      return toLoginResult(await authLogin(payload))
    } catch (error) {
      if (shouldUseMockFallback(error) && isDefaultMockLogin(payload)) {
        return mockLogin(payload)
      }
      throw error
    }
  },
  async register(payload: RegisterPayload) {
    return toLoginResult(await authRegister(payload))
  },
  async refresh(refreshToken = tokenManager.getRefreshToken()) {
    if (!refreshToken) {
      throw new Error('Refresh token is missing')
    }

    try {
      return toLoginResult(await authRefresh({ refreshToken }))
    } catch (error) {
      const currentSession = tokenManager.readSession()
      if (shouldUseMockFallback(error) && isMockSession(currentSession)) {
        const currentUser = currentSession.user
        return toLoginResult(createMockSession(currentUser?.username ?? currentUser?.name))
      }
      throw error
    }
  },
  async me() {
    try {
      return toAuthUser(await authMe())
    } catch (error) {
      if (shouldUseMockFallback(error)) {
        return toAuthUser(tokenManager.readSession()?.user)
      }
      throw error
    }
  },
  async logout(session = tokenManager.readSession()) {
    if (!session?.accessToken || !session.refreshToken) {
      return delay(true, 80)
    }

    try {
      await authLogout({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      })
      return true
    } catch (error) {
      if (shouldUseMockFallback(error)) {
        return delay(true, 80)
      }
      throw error
    }
  },
  async getServiceStatuses() {
    try {
      return mapAuthStatusToServiceStatuses(await authStatus())
    } catch (error) {
      if (shouldUseMockFallback(error)) {
        return mockStatuses()
      }
      throw error
    }
  },
}
