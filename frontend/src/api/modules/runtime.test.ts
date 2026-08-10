import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    post,
  },
}))

import { approveHumanNode } from './runtime'

describe('runtime approval API', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValueOnce({ runtimeState: 'RUNNING' })
  })

  it('posts an approval decision for the waiting node', async () => {
    const request = {
      approved: true,
      comment: 'looks good',
      reviewer: 'ops',
      method: 'webapp',
    }

    await approveHumanNode(101, 'node-human', request)

    expect(post).toHaveBeenCalledWith(
      '/workflow/runtime/instances/101/nodes/node-human/approval',
      request,
      { source: 'runtime' },
    )
  })
})
