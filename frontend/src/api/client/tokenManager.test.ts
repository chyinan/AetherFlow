// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { tokenManager } from './tokenManager'

const LEGACY_KEYS = ['af_auth_refresh', 'af_auth_session', 'af_token', 'af_user']

describe('tokenManager', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    tokenManager.clearSession()
  })

  afterEach(() => {
    tokenManager.clearSession()
  })

  it('keeps credentials in memory and never persists them to browser storage', () => {
    tokenManager.setSession({
      accessToken: 'access-secret',
      refreshToken: 'demo-refresh-secret',
    })

    expect(tokenManager.getAccessToken()).toBe('access-secret')
    expect(tokenManager.getRefreshToken()).toBe('demo-refresh-secret')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('removes credentials left by older application versions', () => {
    for (const key of LEGACY_KEYS) {
      window.localStorage.setItem(key, 'legacy-secret')
      window.sessionStorage.setItem(key, 'legacy-secret')
    }

    tokenManager.readSession()

    expect(window.localStorage.getItem('af_auth_session')).toBeNull()
    expect(window.localStorage.getItem('af_token')).toBeNull()
    expect(window.localStorage.getItem('af_user')).toBeNull()
    expect(window.sessionStorage.getItem('af_auth_refresh')).toBeNull()
  })
})
