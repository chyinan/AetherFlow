// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { conversationSessionKey, writeConversationSelection } from '@/services/copilot/copilotConversationSession'
import type { CopilotMessage } from '@/types/copilot'
import AICopilotPanel from './AICopilotPanel.vue'

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  stream: vi.fn(),
  editCanvas: vi.fn(),
  planWorkflow: vi.fn(),
  refreshSnapshot: vi.fn(),
}))
vi.mock('@/services/api/copilotApi', () => ({ copilotApi: api }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: api }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const context = {
  workflowId: 'workflow-history-focus', workflowName: 'History focus',
  backendDefinitionId: null, backendVersion: null, editRevision: 1,
  projectId: null, selectedNodeId: null, nodes: [], edges: [], templates: [],
}
const conversationId = 'conv-remembered'
const summary = { id: conversationId, workflowId: context.workflowId }
const restored: CopilotMessage = {
  id: 'old-reply', conversationId, createdAt: '', content: '已恢复上次的回复', role: 'assistant',
}
const retrySelector = '[data-testid="copilot-history-retry"]'
const draft = '尚未发送的多行草稿\n再补一行'

describe('已记住的 Copilot 会话历史重试焦点', () => {
  let wrapper: ReturnType<typeof mount> | undefined
  let outside: HTMLButtonElement

  beforeEach(() => {
    window.sessionStorage.clear()
    writeConversationSelection(conversationSessionKey(context), conversationId)
    api.listConversations.mockReset().mockResolvedValue([summary])
    api.listMessages.mockReset().mockRejectedValueOnce({ status: 503, message: '历史暂不可用' })
    api.stream.mockReset()
    api.editCanvas.mockReset()
    api.planWorkflow.mockReset()
    api.refreshSnapshot.mockReset().mockResolvedValue({ models: [], providers: [] })
    outside = document.createElement('button')
    outside.textContent = '面板外的下一项操作'
    document.body.append(outside)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    outside.remove()
    for (const method of [api.stream, api.editCanvas, api.planWorkflow]) expect(method).not.toHaveBeenCalled()
  })

  async function open() {
    const panel = mount(AICopilotPanel, {
      attachTo: document.body,
      props: { context, applyCanvasEdit: vi.fn() },
      global: { plugins: [i18n] },
    })
    wrapper = panel
    await flushPromises()
    const input = panel.get<HTMLTextAreaElement>('form textarea')
    await input.setValue(draft)
    const retry = panel.get<HTMLButtonElement>(retrySelector)
    const region = retry.element.parentElement!
    return { panel, input, retry, region }
  }

  async function retryWithFocus() {
    const state = await open()
    const receipt = deferred<CopilotMessage[]>()
    api.listMessages.mockReturnValueOnce(receipt.promise)
    state.retry.element.focus()
    state.retry.element.click()
    state.retry.element.click()
    await flushPromises()
    return { ...state, receipt }
  }

  it('等待同一会话的读取时，焦点留在历史区且只读一次', async () => {
    const { panel, input, region, receipt } = await retryWithFocus()
    expect(api.listConversations).toHaveBeenCalledTimes(2)
    expect(api.listMessages.mock.calls).toEqual([[conversationId], [conversationId]])
    expect(document.activeElement).toBe(region)
    expect(region.getAttribute('aria-busy')).toBe('true')
    expect(panel.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(input.element.value).toBe(draft)
    receipt.resolve([restored])
    await flushPromises()
  })

  it('再次失败后让重试按钮接回拥有的焦点', async () => {
    const { panel, input, receipt } = await retryWithFocus()
    receipt.reject({ status: 503, message: '历史仍不可用' })
    await flushPromises()
    expect(document.activeElement).toBe(panel.get(retrySelector).element)
    expect(input.element.value).toBe(draft)
  })

  it('成功后回到输入框，保留未发送的草稿及恢复的历史', async () => {
    const { panel, input, receipt } = await retryWithFocus()
    receipt.resolve([restored])
    await flushPromises()
    expect(panel.text()).toContain(restored.content)
    expect(panel.find(retrySelector).exists()).toBe(false)
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe(draft)
  })

  it('确认会话已失效后，保留原来的提示和草稿并回到输入框', async () => {
    const { panel, input, receipt } = await retryWithFocus()
    receipt.reject({ status: 404, message: '会话不存在' })
    await flushPromises()
    expect(panel.text()).toContain(i18n.global.t('copilot.historyUnavailable'))
    expect(panel.find(retrySelector).exists()).toBe(false)
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe(draft)
  })

  it('用户主动移到其他控件后，再次失败不抢回焦点', async () => {
    const { panel, receipt } = await retryWithFocus()
    outside.focus()
    receipt.reject({ status: 503, message: '历史仍不可用' })
    await flushPromises()
    expect(panel.find(retrySelector).exists()).toBe(true)
    expect(document.activeElement).toBe(outside)
  })

  it('焦点不在重试按钮上时，触发读取不改变输入焦点', async () => {
    const { input, retry } = await open()
    const receipt = deferred<CopilotMessage[]>()
    api.listMessages.mockReturnValueOnce(receipt.promise)
    input.element.focus()
    retry.element.click()
    await flushPromises()
    expect(document.activeElement).toBe(input.element)
    await input.setValue('等待时继续输入')
    receipt.resolve([restored])
    await flushPromises()
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe('等待时继续输入')
  })

  it('离开当前工作流后，旧重试回执不改变新会话焦点', async () => {
    const { panel, receipt } = await retryWithFocus()
    const next = { ...context, workflowId: 'workflow-history-next' }
    writeConversationSelection(conversationSessionKey(next), 'new')
    outside.focus()
    await panel.setProps({ context: next })
    receipt.resolve([restored])
    await flushPromises()
    expect(panel.text()).not.toContain(restored.content)
    expect(panel.find(retrySelector).exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})
