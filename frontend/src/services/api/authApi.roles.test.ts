import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ status: vi.fn(), readSession: vi.fn() }))
vi.mock('@/api/client/tokenManager', () => ({ tokenManager: { readSession: mocks.readSession } }))
vi.mock('@/api/modules/auth', () => ({ login: vi.fn(), logout: vi.fn(), me: vi.fn(), profile: vi.fn(), updateProfile: vi.fn(), oauthProviders: vi.fn(), completeOAuthSession: vi.fn(), refresh: vi.fn(), register: vi.fn(), status: mocks.status }))
import { authApi } from './authApi'
describe('账号服务运维状态的请求边界', () => {
  beforeEach(() => { mocks.status.mockReset().mockResolvedValue({ onlineUserCount: 1, tokenCount: 1, loginFailureCount: 0 }) })
  it.each([['USER'], [], undefined])('普通或未知身份不请求账号运维统计：%j', async (rawRoles) => {
    mocks.readSession.mockReturnValue({ user: { rawRoles } })
    expect(await authApi.getServiceStatuses()).toEqual([])
    expect(mocks.status).not.toHaveBeenCalled()
  })
  it('管理员仍可读取真实统计', async () => {
    mocks.readSession.mockReturnValue({ user: { rawRoles: ['ADMIN'] } })
    expect(await authApi.getServiceStatuses()).toHaveLength(3)
    expect(mocks.status).toHaveBeenCalledTimes(1)
  })
})
