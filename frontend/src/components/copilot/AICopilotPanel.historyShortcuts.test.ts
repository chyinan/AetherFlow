// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { conversationSessionKey, writeConversationSelection } from '@/services/copilot/copilotConversationSession'
import type { WorkflowCopilotSnapshot } from '@/services/copilot/workflowCopilotActions'
import AICopilotPanel from './AICopilotPanel.vue'

vi.mock('@/services/api/modelApi', () => ({
  modelApi: { refreshSnapshot: async () => ({ providers: [], models: [] }) },
}))

const context: WorkflowCopilotSnapshot = {
  workflowId: '42', workflowName: '工作流排查', projectId: null, editRevision: 3,
  selectedNodeId: null, nodes: [], edges: [], templates: [],
}
const conversationId = 'conv-7'
const messagesUrl = '/copilot/conversations/7/messages'
const shortcutKeys = ['quickSuggestNextNode', 'quickExplainLatestError', 'quickDraftWorkflow'] as const
let wrapper: ReturnType<typeof mount> | undefined
let historyStatus: number
let historyReads: number
let conversationList: string[]
let httpRequests: string[]
let requests: Array<{ url: string; conversationId?: string; displayPrompt?: string }>
const originalAdapter = axiosInstance.defaults.adapter

function reply(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config }
}
function textButton(key: string) {
  const button = wrapper!.findAll<HTMLButtonElement>('button').find(item => item.text() === i18n.global.t(key))
  if (!button) throw new Error(`Missing button: ${key}`)
  return button
}
function shortcuts() { return shortcutKeys.map(key => textButton(`copilot.${key}`)) }
function composer() { return wrapper!.get<HTMLTextAreaElement>('form textarea') }
function retryHistory() { return wrapper!.get<HTMLButtonElement>('[data-testid="copilot-history-retry"]') }
function mounted(edit = true, snapshot = context) {
  wrapper = mount(AICopilotPanel, {
    attachTo: document.body,
    props: { context: snapshot, ...(edit ? { applyCanvasEdit: vi.fn() } : {}) },
    global: { plugins: [i18n] },
  })
}
async function failureSettled() {
  await vi.waitFor(() => expect(wrapper!.text()).toContain(i18n.global.t('copilot.historyLoadFailed')), { timeout: 2000 })
}

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  sessionStorage.clear()
  historyStatus = 503
  historyReads = 0
  conversationList = [conversationId]
  requests = []
  httpRequests = []
  axiosInstance.defaults.adapter = async config => {
    if (config.url === '/copilot/conversations') {
      return reply(config, conversationList.map(id => ({ id, workflowId: context.workflowId, title: '原会话' })))
    }
    if (config.url === messagesUrl) {
      historyReads += 1
      if (historyStatus !== 200) {
        throw new AxiosError('history unavailable in test', 'ERR_BAD_RESPONSE', config, undefined, reply(config, {}, historyStatus))
      }
      return reply(config, [{ id: 'a1', role: 'assistant', content: '成功恢复的排查上下文', createdAt: '01:00' }])
    }
    httpRequests.push(String(config.url))
    throw new Error(`Unexpected request: ${config.method} ${config.url}`)
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toMatch(/\/copilot\/chat\/stream$/)
    const input = JSON.parse(String(init.body))
    requests.push({ url, conversationId: input.conversationId, displayPrompt: input.displayPrompt })
    const response = { id: 'assistant-2', conversationId: input.conversationId ?? 'conv-8', role: 'assistant', content: '排查结果', createdAt: '01:01' }
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: complete\ndata: ${JSON.stringify(response)}\n\n`))
        controller.close()
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
  vi.unstubAllGlobals()
})

it.each(['已选', '自动发现'])('%s会话的历史失败后，快捷入口与发送一起暂停，原会话重试成功才恢复', async (entry) => {
  if (entry === '已选') writeConversationSelection(conversationSessionKey(context), conversationId)
  mounted()
  await failureSettled()
  await composer().setValue('草稿：继续检查开始节点')
  const buttons = shortcuts()
  for (const button of buttons) button.element.click()
  await flushPromises()

  expect(requests).toEqual([])
  expect(httpRequests).toEqual([])
  expect(retryHistory().element.disabled).toBe(false)
  expect(textButton('copilot.editor.chatMode').element.disabled).toBe(false)
  expect(wrapper!.get<HTMLButtonElement>('button[type="submit"]').element.disabled).toBe(true)
  expect(composer().element.value).toBe('草稿：继续检查开始节点')
  expect(buttons.map(button => button.element.disabled)).toEqual([true, true, true])
  const reason = composer().attributes('aria-describedby')
  expect(reason).toBeTruthy()
  expect(buttons.map(button => button.attributes('aria-describedby'))).toEqual([reason, reason, reason])
  expect(document.getElementById(reason!)?.textContent).toContain(i18n.global.t('copilot.historyLoadFailed'))

  historyStatus = 200
  await retryHistory().trigger('click')
  await flushPromises()

  expect(historyReads).toBe(4) // 初次 HTTP 503 包含两次现有读重试，点击后再读一次。
  expect(wrapper!.text()).toContain('成功恢复的排查上下文')
  expect(composer().attributes('aria-describedby')).toBeUndefined()
  expect(shortcuts().every(button => !button.element.disabled)).toBe(true)
  await textButton('copilot.quickExplainLatestError').trigger('click')
  await flushPromises()
  expect(requests).toEqual([
    expect.objectContaining({ conversationId, displayPrompt: i18n.global.t('copilot.quickExplainLatestError') }),
  ])
  expect(composer().element.value).toBe('草稿：继续检查开始节点')
})

it('原会话已不可用时同样暂停快捷发送，明确选择对话后才从新会话排查', async () => {
  historyStatus = 404
  writeConversationSelection(conversationSessionKey(context), conversationId)
  mounted()
  await flushPromises()
  expect(wrapper!.text()).toContain(i18n.global.t('copilot.historyUnavailable'))
  expect(shortcuts().map(button => button.element.disabled)).toEqual([true, true, true])
  expect(wrapper!.find('[data-testid="copilot-history-retry"]').exists()).toBe(false)
  expect(requests).toEqual([])
  expect(httpRequests).toEqual([])

  await composer().setValue('保留我的问题')
  await textButton('copilot.editor.chatMode').trigger('click')
  expect(shortcuts().every(button => !button.element.disabled)).toBe(true)
  await textButton('copilot.quickExplainLatestError').trigger('click')
  await flushPromises()

  expect(requests).toEqual([expect.objectContaining({ conversationId: undefined })])
  expect(composer().element.value).toBe('保留我的问题')
})

it('已不存在的会话按回车不应改成建议重试的通用错误', async () => {
  historyStatus = 404
  writeConversationSelection(conversationSessionKey(context), conversationId)
  mounted()
  await flushPromises()
  expect(wrapper!.text()).toContain(i18n.global.t('copilot.historyUnavailable'))

  await composer().setValue('继续排查')
  await composer().trigger('keydown', { key: 'Enter' })
  await flushPromises()

  expect(wrapper!.text()).toContain(i18n.global.t('copilot.historyUnavailable'))
  expect(wrapper!.text()).not.toContain(i18n.global.t('copilot.historyLoadFailed'))
  expect(wrapper!.find('[data-testid="copilot-history-retry"]').exists()).toBe(false)
  expect(composer().element.value).toBe('继续排查')
  expect(requests).toEqual([])
  expect(httpRequests).toEqual([])
})

it('没有画布编辑模式的对话保留既有快捷发送行为', async () => {
  historyStatus = 422
  writeConversationSelection(conversationSessionKey(context), conversationId)
  mounted(false)
  await failureSettled()
  expect(shortcuts().every(button => !button.element.disabled)).toBe(true)
  await textButton('copilot.quickExplainLatestError').trigger('click')
  await flushPromises()
  expect(requests).toEqual([expect.objectContaining({ conversationId })])
})

it('同时有画布容量和历史限制时，输入与设计入口都指向两项独立说明', async () => {
  historyStatus = 422
  writeConversationSelection(conversationSessionKey(context), conversationId)
  mounted(true, {
    ...context,
    nodes: Array.from({ length: 101 }, (_, index) => ({
      id: `existing-${index}`, type: 'workflow', position: { x: index * 200, y: 0 },
      data: { kind: 'llm', label: `模型 ${index}`, description: '', config: {}, inputs: [], outputs: [], status: 'idle' },
    })),
  })
  await failureSettled()
  const reasons = composer().attributes('aria-describedby')!.split(' ')
  expect(reasons).toHaveLength(2)
  expect(document.getElementById(reasons[0])?.textContent).toContain(i18n.global.t('copilot.historyLoadFailed'))
  expect(document.getElementById(reasons[1])?.textContent).toContain('101')
  expect(textButton('copilot.quickDraftWorkflow').attributes('aria-describedby')).toBe(reasons.join(' '))
  expect(textButton('copilot.quickExplainLatestError').attributes('aria-describedby')).toBe(reasons[0])

  await textButton('copilot.editor.chatMode').trigger('click')
  expect(composer().attributes('aria-describedby')).toBeUndefined()
  expect(shortcuts().every(button => !button.element.disabled)).toBe(true)
})
