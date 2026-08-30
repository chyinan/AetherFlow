import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    post,
  },
}))

import { approveHumanNode, buildRuntimeWebSocketUrl, issueRuntimeStreamToken } from './runtime'

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

  it('issues a workflow-scoped stream token and builds a resumable websocket URL', async () => {
    post.mockResolvedValueOnce({ token: 'scoped-token', workflowId: '1001', queryParam: 'streamToken' })

    await issueRuntimeStreamToken('1001')
    const url = buildRuntimeWebSocketUrl('1001', 'scoped-token', 'streamToken', 'event-9')

    expect(post).toHaveBeenLastCalledWith(
      '/workflow/runtime/stream-token/1001',
      undefined,
      { source: 'runtime' },
    )
    expect(url).toContain('/workflow/runtime/ws/1001?')
    expect(url).toContain('streamToken=scoped-token')
    expect(url).toContain('cursor=event-9')
  })
})
