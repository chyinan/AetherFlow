import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: mocks,
}))

import { getWorkflowCapabilities } from './ai'

describe('AI capability module', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue({ executableNodeTypes: [] })
  })

  it('loads workflow capabilities from the authenticated public endpoint', async () => {
    await getWorkflowCapabilities()

    expect(mocks.get).toHaveBeenCalledWith('/ai/workflow/capabilities', { source: 'ai' })
  })
})
