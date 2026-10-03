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

  it('sends a non-streaming structured planner request and returns persisted plan metadata', async () => {
    const plan = {
      status: 'NEEDS_CLARIFICATION',
      requirements: {
        goal: 'Summarize content', inputKind: 'UNKNOWN', inputDescription: 'Source not specified',
        outputFormat: '', language: '', audience: '', instruction: '', constraints: [],
      },
      recipe: null,
      steps: [],
      explanation: 'I need one detail.',
      clarifyingQuestion: 'Will it be a file or URL?',
      assumptions: [],
    }
    const signal = new AbortController().signal
    post.mockResolvedValueOnce({
      id: 'msg-plan-1', conversationId: 'conv-11', role: 'assistant', content: plan.explanation,
      createdAt: '19:36', plan, planBaseRevision: 4, planBaseVersion: 2, planBaseFingerprint: '7a1b2c3d',
    })

    await expect(copilotApi.planWorkflow('summarize a webpage', {
      conversationId: 'conv-11', workflowId: 'wf-1001',
      context: { editRevision: 4, graphFingerprint: '7a1b2c3d' }, signal,
    })).resolves.toMatchObject({
      id: 'msg-plan-1', plan, planBaseRevision: 4, planBaseVersion: 2, planBaseFingerprint: '7a1b2c3d',
    })
    expect(post).toHaveBeenCalledWith('/copilot/workflow-plan', expect.objectContaining({
      prompt: 'summarize a webpage', conversationId: 'conv-11', workflowId: 'wf-1001',
    }), expect.objectContaining({ source: 'ai', signal }))
  })

  it('restores structured requirements and base guards from conversation history', async () => {
    const plan = {
      status: 'UNSUPPORTED',
      requirements: {
        goal: 'Generate video', inputKind: 'UNKNOWN', inputDescription: 'Requested generated video',
        outputFormat: '', language: '', audience: '', instruction: '', constraints: [],
      },
      recipe: null, steps: [], explanation: 'That task is outside the supported recipes.',
      clarifyingQuestion: null, assumptions: [],
    }
    get.mockResolvedValueOnce([{
      id: 'msg-plan-2', role: 'assistant', content: plan.explanation, createdAt: '19:36',
      plan, planBaseRevision: 10, planBaseVersion: 3, planBaseFingerprint: '01abcdea',
    }])
    await expect(copilotApi.listMessages('conv-12')).resolves.toMatchObject([{
      id: 'msg-plan-2', plan, planBaseRevision: 10, planBaseVersion: 3, planBaseFingerprint: '01abcdea',
    }])
  })
})
