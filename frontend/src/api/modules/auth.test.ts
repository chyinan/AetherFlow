import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    get,
  },
}))

import { oauthProviders } from './auth'

describe('auth oauth providers', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('loads provider availability without exposing provider credentials', async () => {
    get.mockResolvedValueOnce({ githubConfigured: true, googleConfigured: false })

    await expect(oauthProviders()).resolves.toEqual({
      githubConfigured: true,
      googleConfigured: false,
    })
    expect(get).toHaveBeenCalledWith('/auth/oauth/providers', { source: 'auth' })
  })
})
