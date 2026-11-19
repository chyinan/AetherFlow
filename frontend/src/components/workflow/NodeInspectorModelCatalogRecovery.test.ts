// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { getNodeCatalog } from '@/api/modules/node'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { modelApi, type ModelApiSnapshot } from '@/services/api/modelApi'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ModelCatalogItem, ModelProvider } from '@/types/model'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn() }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: { refreshSnapshot: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const wrappers: VueWrapper[] = []

function provider(): ModelProvider {
  return {
    id: 'provider-ollama', providerType: 'OLLAMA', name: 'Ollama', runtime: 'python-ai-runtime',
    status: 'online', endpoint: '', defaultModel: '', latencyMs: 0, quotaUsed: 0,
    capabilities: ['chat'], lastCheckedAt: '',
  }
}

function model(id: string, name: string): ModelCatalogItem {
  return { id, providerId: 'provider-ollama', name, kind: 'chat', contextWindow: '', priceHint: '', status: 'ready', tags: [] }
}

function snapshot(models: ModelCatalogItem[] = [model('catalog-model', 'catalog-model')]): ModelApiSnapshot {
  return { source: 'real', providers: [provider()], models, policies: [], logs: [] }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function render(kind: 'llm' | 'translate', config: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const workflow = useWorkflowStore()
  workflow.resetToEmptyWorkflow()
  const node = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === kind)!, { x: 0, y: 0 })!
  node.data.config = { ...node.data.config, ...config }
  workflow.historyPast = []
  workflow.historyFuture = []
  workflow.dirty = false
  useUiStore().setSelectedNode(node.id)
  const modelStore = useModelStore()
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, workflow, node, modelStore }
}

beforeEach(() => {
  vi.mocked(getNodeCatalog).mockResolvedValue([])
  vi.mocked(modelApi.refreshSnapshot).mockReset()
  i18n.global.locale.value = 'zh-CN'
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function modelSelect(wrapper: VueWrapper) {
  return wrapper.get<HTMLSelectElement>('[data-config-field="model"]')
}

function selectedOption(wrapper: VueWrapper) {
  return modelSelect(wrapper).element.selectedOptions[0]!
}

describe('NodeInspector model catalog recovery', () => {
  it.each(['llm', 'translate'] as const)('shows the actual catalog failure beside the %s selector and keeps its saved config', async (kind) => {
    vi.mocked(modelApi.refreshSnapshot).mockRejectedValueOnce(new Error('HTTP 503: catalog unavailable'))
    const config = { provider: 'ollama', model: 'existing-model' }
    const { wrapper, node, modelStore } = await render(kind, config)

    expect(modelStore.error).toBe('HTTP 503: catalog unavailable')
    expect(wrapper.find('[data-testid="node-model-catalog-status"] [role="alert"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="node-model-catalog-status"]').text()).toContain('HTTP 503: catalog unavailable')
    expect(wrapper.get('[data-action="retry-model-catalog"]').text()).toBe(i18n.global.t('workflow.inspector.modelCatalogRetry'))
    expect(wrapper.get('[data-action="retry-model-catalog"]').element.closest('label')).toBeNull()
    expect(node.data.config).toMatchObject(config)
  })

  it('deduplicates retries, shows loading, and keeps the node config and keyboard focus through recovery', async () => {
    vi.mocked(modelApi.refreshSnapshot)
      .mockRejectedValueOnce(new Error('HTTP 503: catalog unavailable'))
    const { wrapper, node, modelStore } = await render('llm', { provider: 'ollama', model: 'saved-model' })
    const retry = wrapper.get<HTMLButtonElement>('[data-action="retry-model-catalog"]')
    retry.element.focus()

    const pending = deferred<ModelApiSnapshot>()
    vi.mocked(modelApi.refreshSnapshot).mockReturnValueOnce(pending.promise)
    await retry.trigger('click')
    await retry.trigger('click')

    expect(modelApi.refreshSnapshot).toHaveBeenCalledTimes(2)
    expect(retry.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(retry.element)
    expect(wrapper.find('[data-testid="node-model-catalog-status"] [role="status"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="node-model-catalog-status"] [role="status"]').text()).toBe(i18n.global.t('workflow.inspector.modelCatalogLoading'))

    pending.resolve(snapshot([model('new-model', 'new-model')]))
    await flushPromises()

    expect(modelStore.error).toBeNull()
    expect(node.data.config).toMatchObject({ provider: 'ollama', model: 'saved-model' })
    expect(selectedOption(wrapper).textContent).toContain('saved-model')
    expect(document.activeElement).toBe(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element)
    expect(wrapper.find('[data-testid="node-model-catalog-status"]').exists()).toBe(false)
  })

  it('does not restore focus to a different node after the retry completes', async () => {
    vi.mocked(modelApi.refreshSnapshot).mockRejectedValueOnce(new Error('HTTP 503: catalog unavailable'))
    const { wrapper, workflow, node } = await render('llm', { provider: 'ollama', model: 'saved-model' })
    const retry = wrapper.get<HTMLButtonElement>('[data-action="retry-model-catalog"]')
    retry.element.focus()

    const pending = deferred<ModelApiSnapshot>()
    vi.mocked(modelApi.refreshSnapshot).mockReturnValueOnce(pending.promise)
    await retry.trigger('click')

    const other = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'llm')!, { x: 300, y: 0 })!
    other.data.config = { provider: 'openai', model: 'other-saved-model' }
    workflow.historyPast = []
    workflow.historyFuture = []
    workflow.dirty = false
    useUiStore().setSelectedNode(other.id)
    await flushPromises()
    expect(wrapper.get('[data-node-inspector]').attributes('data-node-inspector')).toBe(other.id)

    pending.resolve(snapshot([model('new-model', 'new-model')]))
    await flushPromises()

    expect(node.data.config).toMatchObject({ provider: 'ollama', model: 'saved-model' })
    expect(other.data.config).toMatchObject({ provider: 'openai', model: 'other-saved-model' })
    expect(document.activeElement).not.toBe(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element)
  })

  it('uses the explicit refresh action to retry even when the store already has a cached catalog', async () => {
    vi.mocked(modelApi.refreshSnapshot)
      .mockResolvedValueOnce(snapshot([model('saved-model', 'saved-model')]))
      .mockRejectedValueOnce(new Error('HTTP 503: refresh unavailable'))
      .mockResolvedValueOnce(snapshot([model('saved-model', 'saved-model')]))
    const { wrapper, modelStore } = await render('translate', { provider: 'ollama', model: 'saved-model' })

    await modelStore.refreshStatus()
    expect(modelStore.providers).toHaveLength(1)
    expect(modelStore.error).toBe('HTTP 503: refresh unavailable')
    expect(selectedOption(wrapper).value).toBe('saved-model')
    expect(wrapper.get('[role="alert"]').text()).toContain('HTTP 503')
    await wrapper.get('[data-action="retry-model-catalog"]').trigger('click')
    await flushPromises()

    expect(modelApi.refreshSnapshot).toHaveBeenCalledTimes(3)
    expect(modelStore.error).toBeNull()
    expect(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.value).toBe('saved-model')
  })

  it.each(['llm', 'translate'] as const)('%s 目录首次失败时区分原配置与自动路由，并能直接清空', async (kind) => {
    vi.mocked(modelApi.refreshSnapshot).mockRejectedValueOnce(new Error('HTTP 503: catalog unavailable'))
    const config = { provider: 'ollama', model: 'previous-chat' }
    const { wrapper, workflow, node } = await render(kind, config)
    const select = modelSelect(wrapper)

    expect(node.data.config).toMatchObject(config)
    expect(workflow.dirty).toBe(false)
    expect(selectedOption(wrapper).value).not.toBe('')
    expect(selectedOption(wrapper).disabled).toBe(true)
    expect(selectedOption(wrapper).textContent).toContain('ollama')
    expect(selectedOption(wrapper).textContent).toContain('previous-chat')
    expect(selectedOption(wrapper).textContent).toContain('目录未确认')
    expect(select.element.options[0]?.textContent).toBe('使用服务默认路由')
    expect(wrapper.get('[role="alert"]').text()).toContain('HTTP 503')
    const definition = () => mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    }).nodes?.[0]?.config
    expect(definition()).toMatchObject(config)
    const savedIndex = select.element.selectedIndex
    select.element.selectedIndex = 0
    expect(select.element.selectedIndex).not.toBe(savedIndex)
    await select.trigger('change')
    expect(node.data.config).toMatchObject({ provider: '', model: '' })
    expect(definition()).not.toHaveProperty('provider')
    expect(definition()).not.toHaveProperty('model')
    expect(workflow.historyPast).toHaveLength(1)
    expect(select.element.selectedOptions[0]?.textContent).toBe('使用服务默认路由')

    expect(workflow.undo()).toBe(true)
    await flushPromises()
    expect(workflow.nodes.find((item) => item.id === node.id)?.data.config).toMatchObject(config)
    expect(selectedOption(wrapper).textContent).toContain('previous-chat')
    expect(modelApi.refreshSnapshot).toHaveBeenCalledTimes(1)
  })

  it.each(['llm', 'translate'] as const)('%s 恢复时同名其他服务商不冒充原选项，正确模型返回后自动回显', async (kind) => {
    const first = deferred<ModelApiSnapshot>()
    vi.mocked(modelApi.refreshSnapshot).mockReturnValueOnce(first.promise)
    const config = { provider: 'ollama', model: 'same-chat' }
    const { wrapper, workflow, node, modelStore } = await render(kind, config)
    expect(selectedOption(wrapper).textContent).toContain('same-chat')
    expect(modelSelect(wrapper).attributes('aria-busy')).toBe('true')

    first.resolve(snapshot([]))
    await flushPromises()
    expect(modelStore.error).toBeNull()
    expect(selectedOption(wrapper).textContent).toContain('same-chat')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="retry-model-catalog"]').exists()).toBe(false)

    const other = { ...model('other-same', 'same-chat'), providerId: 'provider-openai' }
    vi.mocked(modelApi.refreshSnapshot).mockResolvedValueOnce(snapshot([other]))
    await modelStore.refreshStatus()
    await flushPromises()
    expect(selectedOption(wrapper).textContent).toContain('ollama')
    expect(selectedOption(wrapper).value).not.toBe(other.id)

    const restored = model('new-id', 'same-chat')
    vi.mocked(modelApi.refreshSnapshot).mockResolvedValueOnce(snapshot([other, restored]))
    await modelStore.refreshStatus()
    await flushPromises()
    expect(selectedOption(wrapper).value).toBe(restored.id)
    expect(selectedOption(wrapper).disabled).toBe(false)
    expect(modelSelect(wrapper).findAll('option')).toHaveLength(3)
    expect(node.data.config).toMatchObject(config)
    expect(workflow.historyPast).toHaveLength(0)
    expect(workflow.dirty).toBe(false)
  })

  it.each(['llm', 'translate'] as const)('%s 只显式配置服务商时也不误报为完全自动路由', async (kind) => {
    vi.mocked(modelApi.refreshSnapshot).mockResolvedValueOnce(snapshot([]))
    const { wrapper, workflow, node } = await render(kind, { provider: 'ollama', model: '' })

    expect(selectedOption(wrapper).textContent).toContain('ollama')
    expect(selectedOption(wrapper).value).not.toBe('')
    expect(node.data.config).toMatchObject({ provider: 'ollama', model: '' })
    const saved = mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    }).nodes?.[0]?.config
    expect(saved).toMatchObject({ provider: 'ollama' })
    expect(saved).not.toHaveProperty('model')
    expect(workflow.dirty).toBe(false)
  })

  it('切换所选节点后，迟到目录只能匹配当前节点的服务商和模型', async () => {
    const read = deferred<ModelApiSnapshot>()
    vi.mocked(modelApi.refreshSnapshot).mockReturnValueOnce(read.promise)
    const original = { provider: 'ollama', model: 'old-chat' }
    const { wrapper, workflow, node } = await render('llm', original)
    const other = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'translate')!, { x: 300, y: 0 })!
    const current = { provider: 'openai', model: 'other-chat' }
    other.data.config = current
    workflow.historyPast = []
    workflow.dirty = false
    useUiStore().setSelectedNode(other.id)
    await flushPromises()
    expect(selectedOption(wrapper).textContent).toContain('other-chat')

    read.resolve(snapshot([model('old-id', 'old-chat'), { ...model('other-id', 'other-chat'), providerId: 'provider-openai' }]))
    await flushPromises()

    expect(selectedOption(wrapper).value).toBe('other-id')
    expect(node.data.config).toMatchObject(original)
    expect(other.data.config).toMatchObject(current)
    expect(workflow.dirty).toBe(false)
    expect(workflow.historyPast).toHaveLength(0)
  })

  it.each([
    ['en-US', 'Use service defaults', 'not confirmed by catalog'],
    ['ja-JP', 'サービスの既定ルートを使用', '一覧で未確認'],
  ] as const)('%s 区分未确认的历史模型和明确的默认路由', async (locale, defaultLabel, unconfirmedLabel) => {
    i18n.global.locale.value = locale
    vi.mocked(modelApi.refreshSnapshot).mockResolvedValueOnce(snapshot([]))
    const { wrapper, node } = await render('translate', { model: 'legacy-name' })
    expect(modelSelect(wrapper).element.options[0]?.textContent).toBe(defaultLabel)
    expect(selectedOption(wrapper).textContent).toContain(unconfirmedLabel)
    expect(selectedOption(wrapper).textContent).toContain('legacy-name')
    expect(node.data.config).toMatchObject({ model: 'legacy-name' })
    expect(node.data.config).not.toHaveProperty('provider')
  })

  it('does not report an error or offer retry for a successful empty catalog', async () => {
    vi.mocked(modelApi.refreshSnapshot).mockResolvedValueOnce(snapshot([]))
    const { wrapper, modelStore } = await render('llm')

    expect(modelStore.error).toBeNull()
    expect(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').findAll('option').map((option) => option.element.value)).toEqual([''])
    expect(wrapper.find('[data-testid="node-model-catalog-status"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="retry-model-catalog"]').exists()).toBe(false)
  })
})
