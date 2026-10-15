// @vitest-environment jsdom
import { computed } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { workflowApi } from '@/services/api/workflowApi'
import { useAuthStore } from '@/stores/authStore'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { buildWorkflowPreflight } from '@/utils/workflowPreflight'
import NodeInspector from './NodeInspector.vue'

const api = vi.hoisted(() => ({ catalog: vi.fn(), capabilities: vi.fn() }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: api.catalog }))
vi.mock('@/api/modules/ai', async (original) => ({ ...await original<object>(), getWorkflowCapabilities: api.capabilities }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const wrappers: VueWrapper[] = []
const privateError = '后端错误 http://private-host:9000?key=sk-secret 用户输入正文'
function capabilities(available: boolean, reason = privateError): AiWorkflowCapabilities {
  return { runtimeReachable: true, llmExecutable: available, whisperExecutable: false, llmProviders: ['OLLAMA'], imageProviders: [], supportedNodeTypes: ['LLM'], executableNodeTypes: available ? ['LLM'] : [], unavailableReasons: available ? {} : { LLM: reason } }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (cause: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
async function render() {
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow(); store.workflowId = '42'
  const template = nodeTemplates.find((item) => item.kind === 'llm')!
  const node = store.addNodeFromTemplate(template, { x: 50, y: 80 })!
  const other = store.addNodeFromTemplate(template, { x: 350, y: 80 })!
  store.updateNodeConfigValues(node.id, { prompt: '用户输入正文', contextVariable: 'draftContext', model: 'custom-model' })
  store.updateNodeConfigValues(other.id, { prompt: '另一节点正文' })
  useUiStore().setSelectedNode(node.id)
  await store.loadNodeTemplates()
  const issues = computed(() => buildWorkflowPreflight({ id: store.workflowId, name: store.workflowName, nodes: store.nodes, edges: store.edges }, store.templates, { catalogLoaded: store.nodeCatalogLoaded, capabilitiesLoaded: store.capabilitiesLoaded }))
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n] } })
  wrappers.push(wrapper); await flushPromises()
  return { wrapper, store, node, other, issues }
}
function availability(store: ReturnType<typeof useWorkflowStore>) { return store.templates.find((item) => item.kind === 'llm')?.availability }
async function check(wrapper: VueWrapper) { await wrapper.get('[data-action="recheck-node-capabilities"]').trigger('click'); await flushPromises() }
function graphState(store: ReturnType<typeof useWorkflowStore>) {
  return JSON.stringify({ nodes: store.nodes, edges: store.edges, workflowId: store.workflowId, dirty: store.dirty, editRevision: store.editRevision, historyPast: store.historyPast, historyFuture: store.historyFuture, selected: useUiStore().selectedNodeId })
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); i18n.global.locale.value = 'zh-CN'
  api.catalog.mockResolvedValue([{ type: 'LLM', configSchema: [{ name: 'prompt', type: 'STRING', required: true }] }])
  api.capabilities.mockResolvedValue(capabilities(false))
})
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('节点就地能力重查', () => {
  it('更新当前能力和响应式预检，完整保留未保存图、选择、历史且不保存或执行', async () => {
    const { wrapper, store, node, issues } = await render()
    const before = graphState(store)
    const save = vi.spyOn(store, 'saveCurrentWorkflow')
    const start = vi.spyOn(workflowApi, 'startRun')
    expect(issues.value).toContainEqual(expect.objectContaining({ code: 'capabilityUnavailable', nodeId: node.id }))
    api.capabilities.mockResolvedValueOnce(capabilities(true))
    await check(wrapper)
    expect(availability(store)?.available).toBe(true)
    expect(issues.value.some((issue) => issue.code === 'capabilityUnavailable')).toBe(false)
    expect(issues.value).toContainEqual(expect.objectContaining({ code: 'serverRequired' }))
    expect(graphState(store)).toBe(before)
    expect(wrapper.get('[data-testid="node-capability-check-status"]').text()).toContain('预检已重新计算')
    expect(save).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled()
    expect(wrapper.find('[data-action="open-capability-support"]').exists()).toBe(false)
  })
  it('能力仍不可用时保留求助，刷新成功不假定任务可执行', async () => {
    const { wrapper, store, issues } = await render()
    api.capabilities.mockResolvedValueOnce(capabilities(false, '仍需管理员配置'))
    await check(wrapper)
    expect(availability(store)?.available).toBe(false)
    expect(issues.value.some((issue) => issue.code === 'capabilityUnavailable')).toBe(true)
    expect(wrapper.text()).toContain('仍需管理员配置')
    expect(wrapper.find('[data-action="open-capability-support"]').exists()).toBe(true)
  })
  it('不可用但没有原因时仍显示安全提示和求助入口', async () => {
    const { wrapper, store } = await render()
    store.templates = store.templates.map((template) => template.kind === 'llm' ? { ...template, availability: { available: false, reason: null } } : template)
    await flushPromises()
    expect(wrapper.text()).toContain('能力当前不可用')
    expect(wrapper.find('[data-action="open-capability-support"]').exists()).toBe(true)
  })
  it('失败 fail-closed 后能重试恢复，错误摘要不包含后端错误或节点输入', async () => {
    const { wrapper, store } = await render()
    api.capabilities.mockRejectedValueOnce(new Error(privateError))
    await check(wrapper)
    expect(store.capabilitiesLoaded).toBe(false)
    expect(availability(store)?.available).toBe(false)
    expect(wrapper.get('[data-testid="node-capability-check-status"]').attributes('role')).toBe('alert')
    await wrapper.get('[data-action="open-capability-support"]').trigger('click'); await flushPromises()
    const preview = document.querySelector<HTMLTextAreaElement>('[data-testid="capability-support-preview"]')!.value
    expect(JSON.parse(preview)).toMatchObject({ capability: 'LLM', errorCategory: 'CHECK_FAILED' })
    expect(preview).not.toMatch(/private-host|sk-secret|用户输入正文|draftContext|custom-model|workflowId|nodeId/)
    document.querySelector<HTMLButtonElement>('[data-action="close-capability-support"]')!.click(); await flushPromises()
    api.capabilities.mockResolvedValueOnce(capabilities(true)); await check(wrapper)
    expect(availability(store)?.available).toBe(true)
  })
  it('节点目录失败独立提示待确认，能力成功不伪报完整预检成功', async () => {
    const { wrapper, store, issues } = await render()
    api.catalog.mockRejectedValueOnce(new Error('目录内部错误'))
    api.capabilities.mockResolvedValueOnce(capabilities(true))
    await check(wrapper)
    expect(store.capabilitiesLoaded).toBe(true); expect(store.nodeCatalogLoaded).toBe(false)
    expect(issues.value).toContainEqual(expect.objectContaining({ code: 'catalogUnknown' }))
    expect(wrapper.get('[data-testid="node-capability-check-status"]').text()).toContain('节点目录未能刷新')
    expect(wrapper.get('[data-testid="node-capability-check-status"]').text()).not.toContain('目录内部错误')
  })
  it('损坏的成功响应按检查失败处理，不沿用上次能力', async () => {
    const { wrapper, store } = await render()
    api.capabilities.mockResolvedValueOnce({ llmExecutable: true })
    await check(wrapper)
    expect(store.capabilitiesLoaded).toBe(false)
    expect(wrapper.get('[data-testid="node-capability-check-status"]').text()).toContain('未能确认')
    expect(availability(store)?.available).toBe(false)
  })
  it('重复点击只发起一次能力及目录检查', async () => {
    const { wrapper } = await render()
    const pending = deferred<AiWorkflowCapabilities>(); api.capabilities.mockReturnValueOnce(pending.promise)
    const count = api.capabilities.mock.calls.length; const catalogs = api.catalog.mock.calls.length
    const button = wrapper.get('[data-action="recheck-node-capabilities"]').element as HTMLButtonElement
    button.click(); button.click(); await flushPromises()
    expect(api.capabilities).toHaveBeenCalledTimes(count + 1)
    expect(api.catalog).toHaveBeenCalledTimes(catalogs + 1)
    expect(button.disabled).toBe(true)
    pending.resolve(capabilities(true)); await flushPromises()
    expect(button.disabled).toBe(false)
  })
  it.each(['cancel', 'close', 'switch', 'workflow', 'identity', 'unmount'] as const)('%s 后迟到能力不能更新模板或重新打开 UI', async (action) => {
    const { wrapper, store, other } = await render()
    const pending = deferred<AiWorkflowCapabilities>(); api.capabilities.mockReturnValueOnce(pending.promise)
    await check(wrapper)
    if (action === 'cancel') await wrapper.get('[data-action="cancel-node-capabilities"]').trigger('click')
    if (action === 'close') await wrapper.get(`[aria-label="${i18n.global.t('common.close')}"]`).trigger('click')
    if (action === 'switch') useUiStore().setSelectedNode(other.id)
    if (action === 'workflow') store.workflowId = '43'
    if (action === 'identity') useAuthStore().token = 'other-test-session'
    if (action === 'unmount') { wrapper.unmount(); wrappers.splice(wrappers.indexOf(wrapper), 1) }
    pending.resolve(capabilities(true)); await flushPromises()
    expect(availability(store)?.available).toBe(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    if (action === 'cancel') expect(wrapper.get('[data-testid="node-capability-check-status"]').text()).toContain('已取消')
    if (action === 'switch') expect(useUiStore().selectedNodeId).toBe(other.id)
  })
  it.each(['resolve', 'reject'] as const)('取消后再次检查，旧请求 %s 不覆盖新结果也不提前结束加载', async (result) => {
    const { wrapper, store } = await render()
    const old = deferred<AiWorkflowCapabilities>(); const current = deferred<AiWorkflowCapabilities>()
    api.capabilities.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await check(wrapper); await wrapper.get('[data-action="cancel-node-capabilities"]').trigger('click'); await check(wrapper)
    if (result === 'resolve') old.resolve(capabilities(true)); else old.reject(new Error('旧秘密错误'))
    await flushPromises()
    expect(wrapper.get('[data-action="recheck-node-capabilities"]').attributes('disabled')).toBeDefined()
    expect(availability(store)?.available).toBe(false)
    current.resolve(capabilities(false, '当前权威阻断')); await flushPromises()
    expect(wrapper.get('[data-action="recheck-node-capabilities"]').attributes('disabled')).toBeUndefined()
    expect(availability(store)?.reason).toBe('当前权威阻断')
    expect(wrapper.text()).not.toContain('旧秘密错误')
  })
  it('其他入口较新检查覆盖本次请求时只提示被取代，不能显示旧成功', async () => {
    const { wrapper, store } = await render()
    const old = deferred<AiWorkflowCapabilities>(); api.capabilities.mockReturnValueOnce(old.promise)
    await check(wrapper)
    api.capabilities.mockResolvedValueOnce(capabilities(false, '来自更新检查'))
    await store.loadNodeTemplates()
    old.resolve(capabilities(true)); await flushPromises()
    expect(availability(store)?.reason).toBe('来自更新检查')
    expect(wrapper.get('[data-testid="node-capability-check-status"]').text()).toContain('更新的检查取代')
  })
})
