import { defineStore } from 'pinia'

import { authApi, type AuthUser } from '@/services/api/authApi'

function readToken() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('af_token')
}

function readUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem('af_user')
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: readToken(),
    user: readUser(),
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    workspace: (state) => state.user?.workspace ?? 'AetherFlow Lab',
  },
  actions: {
    async login(username: string, password: string) {
      this.loading = true
      try {
        const result = await authApi.login({ username, password })
        this.token = result.token
        this.user = result.user
        window.localStorage.setItem('af_token', result.token)
        window.localStorage.setItem('af_user', JSON.stringify(result.user))
      } finally {
        this.loading = false
      }
    },
    async logout() {
      await authApi.logout()
      this.token = null
      this.user = null
      window.localStorage.removeItem('af_token')
      window.localStorage.removeItem('af_user')
    },
  },
})
