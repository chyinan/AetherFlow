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
