// pattern: Imperative Shell
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    get,
    post,
  },
}))

import { oauthProviders } from './auth'

describe('auth oauth providers', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('loads provider availability without exposing provider credentials', async () => {
    get.mockResolvedValueOnce({ githubConfigured: true, googleConfigured: false })

    await expect(oauthProviders()).resolves.toEqual({
      githubConfigured: true,
      googleConfigured: false,
    })
    expect(get).toHaveBeenCalledWith('/auth/oauth/providers', { source: 'auth' })
  })

  it('completes oauth session through the browser-bound backend exchange', async () => {
    post.mockResolvedValueOnce({
      userId: 7,
      username: 'alice',
      roles: ['USER'],
      tokenType: 'Bearer',
      accessToken: 'access-token',
      expiresIn: 7200,
      refreshExpiresIn: 604800,
    })

    const { completeOAuthSession } = await import('./auth')

    await expect(completeOAuthSession({
      provider: 'github',
      state: 'state-1',
      accessToken: 'access-token',
    })).resolves.toMatchObject({
      accessToken: 'access-token',
      user: { userId: 7, username: 'alice', roles: ['operator'] },
    })
    expect(post).toHaveBeenCalledWith('/auth/oauth/complete', {
      provider: 'github',
      state: 'state-1',
      accessToken: 'access-token',
    }, { source: 'auth' })
  })
})
