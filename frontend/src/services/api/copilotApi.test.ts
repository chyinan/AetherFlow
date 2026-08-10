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

import { copilotApi } from './copilotApi'

describe('copilotApi', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('loads conversation history and strips the display prefix from message URLs', async () => {
    get.mockResolvedValueOnce([
      {
        id: 'conv-11',
        title: 'Which node should I add next?',
        workflowId: 'wf-1001',
        projectId: 'project-1',
        messageCount: 2,
        updatedAt: '2026-05-29T19:36:00',
      },
    ])
    get.mockResolvedValueOnce([
      { id: 'msg-21', role: 'user', content: 'Which node should I add next?', createdAt: '19:36' },
      { id: 'msg-22', role: 'assistant', content: 'Add Summary.', createdAt: '19:36' },
    ])

    await expect(copilotApi.listConversations()).resolves.toHaveLength(1)
    await expect(copilotApi.listMessages('conv-11')).resolves.toEqual([
      { id: 'msg-21', role: 'user', content: 'Which node should I add next?', createdAt: '19:36' },
      { id: 'msg-22', role: 'assistant', content: 'Add Summary.', createdAt: '19:36' },
    ])
    expect(get).toHaveBeenNthCalledWith(1, '/copilot/conversations', { source: 'ai' })
    expect(get).toHaveBeenNthCalledWith(2, '/copilot/conversations/11/messages', { source: 'ai' })
  })

  it('consumes copilot SSE deltas and returns the completed assistant message', async () => {
    const encoder = new TextEncoder()
    const read = vi.fn()
      .mockResolvedValueOnce({
        done: false,
        value: encoder.encode('event: delta\ndata: {"content":"第一段"}\n\n'),
      })
      .mockResolvedValueOnce({
        done: false,
        value: encoder.encode('event: complete\ndata: {"id":"msg-22","conversationId":"conv-11","role":"assistant","content":"第一段第二段","createdAt":"19:36"}\n\n'),
      })
      .mockResolvedValueOnce({ done: true, value: undefined })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read }) },
    })
    vi.stubGlobal('fetch', fetchMock)

    const deltas: string[] = []
    await expect(copilotApi.stream('请解释错误', {
      workflowId: 'wf-1001',
      onDelta: (delta) => deltas.push(delta),
    })).resolves.toEqual({
      id: 'msg-22',
      conversationId: 'conv-11',
      role: 'assistant',
      content: '第一段第二段',
      createdAt: '19:36',
    })

    expect(deltas).toEqual(['第一段'])
    expect(fetchMock).toHaveBeenCalledWith('/api/copilot/chat/stream', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('请解释错误'),
    }))
    vi.unstubAllGlobals()
  })
})
