import { defineStore } from 'pinia'

import { setUnauthorizedSessionRefresher } from '@/api/client/apiClient'
import { tokenManager, type AuthSession, type AuthSessionUserSnapshot } from '@/api/client/tokenManager'
import { authApi, type AuthUser } from '@/services/api/authApi'

interface AuthState {
  token: string | null
  user: AuthUser | null
  session: AuthSession | null
  loading: boolean
  refreshing: boolean
}

let refreshInFlight: Promise<boolean> | null = null

function isFrontendRole(role: string): role is AuthUser['role'] {
  return role === 'owner' || role === 'operator'
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function toAuthUser(user: AuthSessionUserSnapshot | null | undefined): AuthUser | null {
  if (!user) {
    return null
  }

  const role = user.role === 'owner' ? 'owner' : 'operator'
  const roles = readStringArray(user.roles).filter(isFrontendRole)
  const userRecord = user as AuthSessionUserSnapshot & { rawRoles?: unknown; userId?: unknown }

  return {
    id: typeof user.id === 'string' && user.id ? user.id : 'user-cyan',
    name:
      (typeof user.name === 'string' && user.name) ||
      (typeof user.username === 'string' && user.username) ||
      'aether.operator',
    role,
    workspace:
      typeof user.workspace === 'string' && user.workspace ? user.workspace : 'AetherFlow Lab',
    username: typeof user.username === 'string' ? user.username : undefined,
    roles,
    rawRoles: readStringArray(userRecord.rawRoles),
    userId:
      typeof userRecord.userId === 'number' && Number.isFinite(userRecord.userId)
        ? userRecord.userId
        : undefined,
  }
}

function sessionFromLoginResult(result: Awaited<ReturnType<typeof authApi.login>>): AuthSession {
  return (
    result.session ?? {
      accessToken: result.token,
      tokenType: 'Bearer',
      user: result.user,
    }
  )
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => {
    const session = tokenManager.readSession()

    return {
      token: session?.accessToken ?? null,
      user: toAuthUser(session?.user),
      session,
      loading: false,
      refreshing: false,
    }
  },
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    workspace: (state) => state.user?.workspace ?? 'AetherFlow Lab',
    roles: (state) => {
      return state.user?.roles ?? []
    },
  },
  actions: {
    setActiveSession(session: AuthSession | null) {
      this.session = session
      this.token = session?.accessToken ?? null
      this.user = toAuthUser(session?.user)
    },
    clearLocalSession() {
      tokenManager.clearSession()
      this.setActiveSession(null)
    },
    hasAnyRole(allowedRoles: AuthUser['role'][]) {
      if (allowedRoles.length === 0) {
        return true
      }

      const currentRoles = this.roles
      return allowedRoles.some((role) => currentRoles.includes(role))
    },
    async login(username: string, password: string) {
      this.loading = true
      try {
        const result = await authApi.login({ username, password })
        const session = sessionFromLoginResult(result)

        tokenManager.setSession(session)
        this.setActiveSession(session)
      } finally {
        this.loading = false
      }
    },
    async register(username: string, email: string, password: string) {
      this.loading = true
      try {
        const result = await authApi.register({ username, email, password })
        const session = sessionFromLoginResult(result)

        tokenManager.setSession(session)
        this.setActiveSession(session)
      } finally {
        this.loading = false
      }
    },
    async refreshSession() {
      if (refreshInFlight) {
        return refreshInFlight
      }

      refreshInFlight = this.runRefreshSession()

      try {
        return await refreshInFlight
      } finally {
        refreshInFlight = null
      }
    },
    async runRefreshSession() {
      const refreshToken = tokenManager.getRefreshToken()
      const currentSession = tokenManager.readSession()

      if (
        !refreshToken ||
        (currentSession?.refreshExpiresAt && currentSession.refreshExpiresAt <= Date.now())
      ) {
        this.clearLocalSession()
        return false
      }

      this.refreshing = true
      try {
        const result = await authApi.refresh(refreshToken)
        const session = sessionFromLoginResult(result)

        tokenManager.setSession(session)
        this.setActiveSession(session)
        return true
      } catch {
        this.clearLocalSession()
        return false
      } finally {
        this.refreshing = false
      }
    },
    async ensureFreshSession() {
      const session = tokenManager.readSession()

      if (!session) {
        this.clearLocalSession()
        return false
      }

      // The access token lives only in memory (see tokenManager). After a tab
      // reload memory is wiped, so `session.accessToken` will be empty even
      // though we still have a valid refresh token in sessionStorage. In that
      // case silently refresh to recover an access token instead of logging
      // the user out.
      if (!session.accessToken) {
        if (!session.refreshToken) {
          this.clearLocalSession()
          return false
        }
        return this.refreshSession()
      }

      this.setActiveSession(session)

      if (!tokenManager.isAccessTokenExpiringSoon()) {
        return true
      }

      if (!session.refreshToken) {
        this.clearLocalSession()
        return false
      }

      return this.refreshSession()
    },
    async logout() {
      const session = this.session ?? tokenManager.readSession()

      try {
        await authApi.logout(session)
      } catch {
        // Remote logout failures must not block local token cleanup.
      } finally {
        this.clearLocalSession()
      }
    },
  },
})

setUnauthorizedSessionRefresher(async () => {
  const authStore = useAuthStore()
  return authStore.refreshSession()
})
