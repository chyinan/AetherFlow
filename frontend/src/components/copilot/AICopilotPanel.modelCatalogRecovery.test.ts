// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axiosInstance } from '@/api/client/apiClient'
import type { ProviderCatalogResponse } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import type { WorkflowCopilotSnapshot } from '@/services/copilot/workflowCopilotActions'
import AICopilotPanel from './AICopilotPanel.vue'

const copilot = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  stream: vi.fn(),
  editCanvas: vi.fn(),
  planWorkflow: vi.fn(),
}))
vi.mock('@/services/api/copilotApi', () => ({ copilotApi: copilot }))
vi.mock('@/services/copilot/copilotConversationSession', () => ({
  UNCONFIRMED_CONVERSATION: 'pending',
  conversationSessionKey: () => 'catalog-recovery-fixture',
  readConversationSelection: () => null,
  writeConversationSelection: vi.fn(),
}))

const localeCopy = {
  'zh-CN': { loading: '正在加载模型', failure: '无法加载模型列表', retry: '重试加载模型', empty: '暂无可用模型' },
  'en-US': { loading: 'Loading models', failure: 'Could not load the model list', retry: 'Retry loading models', empty: 'No model available' },
  'ja-JP': { loading: 'モデルを読み込み中', failure: 'モデル一覧を読み込めませんでした', retry: 'モデルの読み込みを再試行', empty: '利用可能なモデルがありません' },
} as const
const context: WorkflowCopilotSnapshot = {
  workflowId: '101', workflowName: 'Catalog recovery fixture', projectId: 11, editRevision: 0, nodes: [], edges: [], templates: [],
}
const empty: ProviderCatalogResponse = { providers: [], models: [] }
const catalog: ProviderCatalogResponse = {
  providers: [{ provider: 'OLLAMA', name: 'Fixture provider' }],
  models: [
    { provider: 'OLLAMA', name: 'restricted-fixture', kind: 'chat', status: 'disabled' },
    { provider: 'OLLAMA', name: 'working-fixture', kind: 'chat', status: 'ready' },
  ],
}

let wrapper: ReturnType<typeof mount> | undefined
let read: ReturnType<typeof vi.fn<(config: InternalAxiosRequestConfig) => Promise<AxiosResponse>>>
let catalogReply: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>
const originalAdapter = axiosInstance.defaults.adapter
const denied = vi.fn(() => { throw new Error('live transport is not allowed in the picker test') })

function respond(config: InternalAxiosRequestConfig, data: ProviderCatalogResponse, status = 200): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config }
}

function rejectUnavailable(config: InternalAxiosRequestConfig): never {
  throw new AxiosError('catalog temporarily unavailable', 'ERR_BAD_RESPONSE', config, undefined, respond(config, empty, 503))
}

function deferCatalog() {
  let finish!: (value: ProviderCatalogResponse) => void
  const promise = new Promise<ProviderCatalogResponse>((resolve) => { finish = resolve })
  catalogReply = async config => respond(config, await promise)
  return finish
}

function modelPicker() { return wrapper!.get<HTMLSelectElement>('form select') }
function prompt() { return wrapper!.get<HTMLTextAreaElement>('form textarea') }
function retry() { return wrapper!.get<HTMLButtonElement>('[data-testid="copilot-model-retry"]') }
function submit() { return wrapper!.get<HTMLButtonElement>('form button[type="submit"]') }
function selectChat() { return wrapper!.get('button[aria-pressed="false"]') }

function mountPanel() {
  wrapper = mount(AICopilotPanel, {
    attachTo: document.body,
    props: { applyCanvasEdit: vi.fn(), context },
    global: { plugins: [i18n] },
  })
}

async function waitForCatalogFailure(numberOfAttempts = 3) {
  // Real client performs two GET retries before the catalog read fails.
  await vi.waitFor(() => {
    expect(read).toHaveBeenCalledTimes(numberOfAttempts)
    expect(modelPicker().element.options[0]?.text).not.toBe(localeCopy[i18n.global.locale.value].loading)
  }, { timeout: 3000 })
}

beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh-CN'
  catalogReply = async config => respond(config, empty)
  read = vi.fn(async config => {
    expect(config.method).toBe('get')
    expect(config.url).toBe('/ai/provider/catalog')
    return catalogReply(config)
  })
  axiosInstance.defaults.adapter = read
  copilot.listConversations.mockResolvedValue([{ id: 'same-conversation', workflowId: '101', projectId: '11' }])
  copilot.listMessages.mockResolvedValue([{ id: 'fixture-message', role: 'assistant', content: 'Earlier reply', createdAt: '09:15' }])
  copilot.stream.mockResolvedValue({ id: 'fixture-answer', role: 'assistant', content: 'Fixture answer', createdAt: '09:16', conversationId: 'same-conversation' })
  vi.stubGlobal('fetch', denied)
  vi.stubGlobal('XMLHttpRequest', class { constructor() { denied() } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
  vi.unstubAllGlobals()
  i18n.global.locale.value = 'zh-CN'
  expect(denied).not.toHaveBeenCalled()
})

describe('Copilot model list recovery', () => {
  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s distinguishes unavailable reads from confirmed empty', async locale => {
    i18n.global.locale.value = locale
    catalogReply = async config => rejectUnavailable(config)
    mountPanel()
    await nextTick()
    expect(modelPicker().element.options[0]?.text).toBe(localeCopy[locale].loading)
    expect(modelPicker().element.disabled).toBe(true)
    expect(wrapper!.find('[data-testid="copilot-model-retry"]').exists()).toBe(false)
    await waitForCatalogFailure()
    expect(modelPicker().element.options[0]?.text).toBe(localeCopy[locale].failure)
    expect(modelPicker().element.disabled).toBe(true)
    expect(retry().text()).toBe(localeCopy[locale].retry)
    expect(submit().element.disabled).toBe(false)
  })

  it('retries only the catalog in place, coalesces repeat clicks, and keeps draft, mode, and history', async () => {
    catalogReply = async config => rejectUnavailable(config)
    mountPanel()
    await waitForCatalogFailure()
    await selectChat().trigger('click')
    await prompt().setValue('Give three points\nthen a short summary')
    const draft = prompt().element.value
    expect(wrapper!.text()).toContain('Earlier reply')
    expect(read).toHaveBeenCalledTimes(3)
    expect(copilot.stream).not.toHaveBeenCalled()
    const finish = deferCatalog()
    const button = retry().element
    button.focus()
    button.click()
    button.click()
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(4)
    expect(modelPicker().element.options[0]?.text).toBe(localeCopy['zh-CN'].loading)
    expect(retry().element).toBe(button)
    expect(retry().attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button)
    expect(submit().element.disabled).toBe(false)
    finish(catalog)
    await flushPromises()
    expect(modelPicker().element.disabled).toBe(false)
    expect([...modelPicker().element.options].map(option => option.text)).toEqual(['Fixture provider / working-fixture'])
    expect(document.activeElement).toBe(modelPicker().element)
    expect(wrapper!.find('[data-testid="copilot-model-retry"]').exists()).toBe(false)
    expect(prompt().element.value).toBe(draft)
    expect(wrapper!.find('button[aria-pressed="true"]').text()).toBe(i18n.global.t('copilot.editor.chatMode'))
    expect(copilot.listConversations).toHaveBeenCalledTimes(1)
    expect(copilot.listMessages).toHaveBeenCalledExactlyOnceWith('same-conversation')
    expect(copilot.stream).not.toHaveBeenCalled()
    expect(copilot.editCanvas).not.toHaveBeenCalled()
    expect(copilot.planWorkflow).not.toHaveBeenCalled()
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(copilot.stream).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(draft), expect.objectContaining({ conversationId: 'same-conversation', model: 'working-fixture', provider: 'OLLAMA' }))
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('a confirmed empty catalog is not an error, and Chat still sends with the existing default route', async () => {
    mountPanel()
    await flushPromises()
    expect(modelPicker().element.options[0]?.text).toBe(localeCopy['zh-CN'].empty)
    expect(modelPicker().element.disabled).toBe(true)
    expect(wrapper!.find('[data-testid="copilot-model-retry"]').exists()).toBe(false)
    await selectChat().trigger('click')
    await prompt().setValue('Keep the default')
    expect(submit().element.disabled).toBe(false)
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(copilot.stream).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Keep the default'), expect.objectContaining({ model: undefined, provider: undefined, conversationId: 'same-conversation' }))
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('allows default routing on read failure without implicitly retrying the catalog', async () => {
    catalogReply = async config => rejectUnavailable(config)
    mountPanel()
    await waitForCatalogFailure()
    await selectChat().trigger('click')
    await prompt().setValue('Use the existing default')
    await submit().trigger('click')
    await flushPromises()
    expect(copilot.stream).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Use the existing default'), expect.objectContaining({ model: undefined, provider: undefined, conversationId: 'same-conversation' }))
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('returns to the composer when a focused Retry confirms that the list is empty', async () => {
    catalogReply = async config => rejectUnavailable(config)
    mountPanel()
    await waitForCatalogFailure()
    await prompt().setValue('Still editing')
    catalogReply = async config => respond(config, empty)
    retry().element.focus()
    await retry().trigger('click')
    await flushPromises()
    expect(modelPicker().element.options[0]?.text).toBe(localeCopy['zh-CN'].empty)
    expect(modelPicker().element.disabled).toBe(true)
    expect(wrapper!.find('[data-testid="copilot-model-retry"]').exists()).toBe(false)
    expect(document.activeElement).toBe(prompt().element)
    expect(prompt().element.value).toBe('Still editing')
    expect(copilot.stream).not.toHaveBeenCalled()
  })

  it('a repeated failure leaves Retry available; later success does not steal focus when the user moved', async () => {
    catalogReply = async config => rejectUnavailable(config)
    mountPanel()
    await waitForCatalogFailure()
    retry().element.focus()
    await retry().trigger('click')
    await waitForCatalogFailure(6)
    expect(retry().attributes('aria-disabled')).toBeUndefined()
    expect(document.activeElement).toBe(retry().element)
    const finish = deferCatalog()
    await retry().trigger('click')
    prompt().element.focus()
    finish(catalog)
    await flushPromises()
    expect(document.activeElement).toBe(prompt().element)
    expect(modelPicker().element.disabled).toBe(false)
    expect(read).toHaveBeenCalledTimes(7)
  })
})
