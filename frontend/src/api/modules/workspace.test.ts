import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    delete: mocks.del,
  },
}))

import { createWorkspace, deleteWorkspace, getWorkspace, listWorkspaces, updateWorkspace } from './workspace'

describe('workspace module', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue({})
    mocks.post.mockReset().mockResolvedValue({})
    mocks.put.mockReset().mockResolvedValue({})
    mocks.del.mockReset().mockResolvedValue(undefined)
  })

  it('exposes workspace CRUD through the workflow gateway', async () => {
    await listWorkspaces('lab')
    await createWorkspace({ name: 'AetherFlow Lab' })
    await getWorkspace('5')
    await updateWorkspace('5', { name: 'Updated Lab' })
    await deleteWorkspace('5')

    expect(mocks.get).toHaveBeenNthCalledWith(1, '/workspaces', {
      params: { query: 'lab', page: 1, size: 100 },
      source: 'workflow',
    })
    expect(mocks.post).toHaveBeenCalledWith('/workspaces', { name: 'AetherFlow Lab' }, { source: 'workflow' })
    expect(mocks.get).toHaveBeenNthCalledWith(2, '/workspaces/5', { source: 'workflow' })
    expect(mocks.put).toHaveBeenCalledWith('/workspaces/5', { name: 'Updated Lab' }, { source: 'workflow' })
    expect(mocks.del).toHaveBeenCalledWith('/workspaces/5', { source: 'workflow' })
  })
})
