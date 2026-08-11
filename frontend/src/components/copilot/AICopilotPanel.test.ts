// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const { listConversations, listMessages, refreshSnapshot, stream } = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  refreshSnapshot: vi.fn(),
  stream: vi.fn(),
}))

vi.mock('@/services/api/copilotApi', () => ({
  copilotApi: { listConversations, listMessages, stream },
}))

vi.mock('@/services/api/modelApi', () => ({
  modelApi: { refreshSnapshot },
}))

import { i18n } from '@/i18n'
import AICopilotPanel from './AICopilotPanel.vue'

describe('AICopilotPanel', () => {
  beforeEach(() => {
    listConversations.mockReset().mockResolvedValue([])
    listMessages.mockReset()
    refreshSnapshot.mockReset().mockResolvedValue({ providers: [], models: [] })
    stream.mockReset()
  })

  it('renders a streamed assistant delta before the response completes', async () => {
    let releaseBeforeSecondDelta: () => void = () => undefined
    const beforeSecondDelta = new Promise<void>((resolve) => {
      releaseBeforeSecondDelta = resolve
    })
    let secondDeltaDeliveredResolve: () => void = () => undefined
    const secondDeltaDelivered = new Promise<void>((resolve) => {
      secondDeltaDeliveredResolve = resolve
    })
    stream.mockImplementation(async (_prompt: string, options: { onDelta?: (content: string) => void }) => {
      options.onDelta?.('第一段')
      await beforeSecondDelta
      options.onDelta?.('第二段')
      secondDeltaDeliveredResolve()
      return {
        id: 'assistant-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: '第一段第二段',
        createdAt: '22:30',
      }
    })

    const wrapper = mount(AICopilotPanel, {
      global: { plugins: [i18n] },
    })
    const input = wrapper.find('form input')
    await input.setValue('请解释错误')
    const submitPromise = wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(stream).toHaveBeenCalled())
    await nextTick()

    expect(wrapper.text()).toContain('第一段')

    releaseBeforeSecondDelta()
    await secondDeltaDelivered
    await nextTick()
    expect(wrapper.text()).toContain('第一段第二段')

    await submitPromise
    await flushPromises()
    wrapper.unmount()
  })

  it('does not load a conversation from another workflow', async () => {
    listConversations.mockResolvedValue([
      { id: 'conv-other', title: 'Other', workflowId: 'workflow-other', messageCount: 2, updatedAt: '' },
    ])

    const wrapper = mount(AICopilotPanel, {
      props: {
        context: {
          workflowId: 'workflow-current',
          workflowName: 'Current workflow',
          nodes: [],
          edges: [],
          templates: [],
        },
      },
      global: { plugins: [i18n] },
    })

    await flushPromises()

    expect(listMessages).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
