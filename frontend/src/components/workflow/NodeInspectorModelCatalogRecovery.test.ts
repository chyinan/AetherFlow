// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    expect(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.value).toBe('')
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
    await wrapper.get('[data-action="retry-model-catalog"]').trigger('click')
    await flushPromises()

    expect(modelApi.refreshSnapshot).toHaveBeenCalledTimes(3)
    expect(modelStore.error).toBeNull()
    expect(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.value).toBe('saved-model')
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
