import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    get: mocks.get,
  },
}))

import { getGovernanceSnapshot } from './governance'

describe('governance module', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue({})
  })

  it('loads workflow, queue, file, auth and gateway diagnostics', async () => {
    const snapshot = await getGovernanceSnapshot()

    expect(mocks.get).toHaveBeenCalledWith('/workflow/node/metrics', { source: 'workflow' })
    expect(mocks.get).toHaveBeenCalledWith('/workflow/embedding/metrics', { source: 'workflow' })
    expect(mocks.get).toHaveBeenCalledWith('/workflow/ocr/metrics', { source: 'workflow' })
    expect(mocks.get).toHaveBeenCalledWith('/task/metrics', { source: 'task' })
    expect(mocks.get).toHaveBeenCalledWith('/file/status', { source: 'file' })
    expect(mocks.get).toHaveBeenCalledWith('/file/metrics', { source: 'file' })
    expect(mocks.get).toHaveBeenCalledWith('/auth/status', { source: 'auth' })
    expect(mocks.get).toHaveBeenCalledWith('/auth/metrics', { source: 'auth' })
    expect(mocks.get).toHaveBeenCalledWith('/gateway/status', { source: 'gateway' })
    expect(snapshot).toHaveProperty('gateway')
  })
})

describe('治理来源可用性', () => {
  it('保留成功、无权限、不可用状态，不伪装正常零值', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path === '/auth/metrics') return Promise.reject({ status: 403, message: 'Synthetic forbidden' })
      if (path === '/task/metrics') return Promise.reject({ status: 503, message: 'Synthetic unavailable' })
      return Promise.resolve({ count: 1 })
    })
    const snapshot = await getGovernanceSnapshot()
    expect(snapshot.resources.authMetrics).toBe('forbidden'); expect(snapshot.resources.queue).toBe('unavailable')
    expect(snapshot.resources.gateway).toBe('available'); expect(snapshot.authMetrics).toBeNull(); expect(snapshot.queue).toBeNull()
  })
  it('单项重试只请求对应来源', async () => {
    mocks.get.mockReset().mockResolvedValue({ totalMessages: 2 })
    const snapshot = await getGovernanceSnapshot(['queue'])
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith('/task/metrics', { source: 'task' })
    expect(snapshot.queue).toEqual({ totalMessages: 2 }); expect(snapshot.resources).toEqual({ queue: 'available' })
  })
})
