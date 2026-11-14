// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'

const api = vi.hoisted(() => ({ catalog: vi.fn(), capabilities: vi.fn() }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: api.catalog }))
vi.mock('@/api/modules/ai', async (original) => ({ ...await original<object>(), getWorkflowCapabilities: api.capabilities }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const wrappers: VueWrapper[] = []
const imageCatalog = [{ type: 'IMAGE_GENERATION', configSchema: [{ name: 'steps', type: 'NUMBER' }] }]
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}

function capabilities(available = false): AiWorkflowCapabilities {
  return {
    runtimeReachable: true,
    llmExecutable: false,
    whisperExecutable: false,
    llmProviders: ['OLLAMA'],
    imageProviders: [],
    supportedNodeTypes: ['IMAGE_GENERATION'],
    executableNodeTypes: available ? ['IMAGE_GENERATION'] : [],
    unavailableReasons: available ? {} : { IMAGE_GENERATION: 'Provider is unavailable' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  api.catalog.mockResolvedValue(imageCatalog)
  api.capabilities.mockResolvedValue(capabilities())
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

it('recovers the inspector catalog after its initial request failed and a capability recheck loads the catalog', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)

  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'image-generation')!, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)

  // 工作流存储首次加载和检查器独立目录请求均失败。
  api.catalog.mockRejectedValueOnce(new Error('temporary catalog outage'))
    .mockRejectedValueOnce(new Error('temporary catalog outage'))
  await store.loadNodeTemplates()

  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper)
  await flushPromises()

  expect(wrapper.find('[data-config-field="steps"]').exists()).toBe(false)
  expect(store.nodeCatalog).toBeNull()
  expect(api.catalog).toHaveBeenCalledTimes(2)

  api.catalog.mockResolvedValueOnce(imageCatalog)
  api.capabilities.mockResolvedValueOnce(capabilities(true))
  await wrapper.get('[data-action="recheck-node-capabilities"]').trigger('click')
  await flushPromises()

  expect(store.capabilitiesLoaded).toBe(true)
  expect(store.nodeCatalogLoaded).toBe(true)
  expect(wrapper.find('[data-config-field="steps"]').exists()).toBe(true)
})

it('keeps the last valid inspector catalog usable when a later recheck catalog request fails', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)

  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'image-generation')!, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)
  api.catalog.mockResolvedValueOnce(imageCatalog)
  await store.loadNodeTemplates()

  api.catalog.mockRejectedValueOnce(new Error('temporary inspector request failure'))
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.find('[data-config-field="steps"]').exists()).toBe(true)

  api.catalog.mockRejectedValueOnce(new Error('refresh failed privately'))
  api.capabilities.mockResolvedValueOnce(capabilities(true))
  await wrapper.get('[data-action="recheck-node-capabilities"]').trigger('click')
  await flushPromises()

  expect(store.nodeCatalogLoaded).toBe(false)
  expect(store.nodeCatalog).toEqual(imageCatalog)
  expect(wrapper.find('[data-config-field="steps"]').exists()).toBe(true)
  expect(wrapper.get('[data-testid="node-capability-check-status"]').text()).not.toContain('refresh failed privately')
})

it('does not let a late private catalog response replace a shared catalog load already in flight at mount', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)

  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'image-generation')!, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)
  const storeCatalog = deferred<typeof imageCatalog>()
  const storeCapabilities = deferred<AiWorkflowCapabilities>()
  api.catalog.mockReturnValueOnce(storeCatalog.promise)
  api.capabilities.mockReturnValueOnce(storeCapabilities.promise)
  const loadStartedBeforeMount = store.loadNodeTemplates()
  await flushPromises()

  const lateMountCatalog = deferred<typeof imageCatalog>()
  api.catalog.mockReturnValueOnce(lateMountCatalog.promise)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper)
  await flushPromises()

  storeCatalog.resolve(imageCatalog)
  storeCapabilities.resolve(capabilities(true))
  await loadStartedBeforeMount
  await flushPromises()
  expect(wrapper.find('[data-config-field="steps"]').exists()).toBe(true)

  lateMountCatalog.resolve([{ type: 'IMAGE_GENERATION', configSchema: [{ name: 'staleField', type: 'STRING' }] }])
  await flushPromises()
  expect(wrapper.find('[data-config-field="steps"]').exists()).toBe(true)
  expect(wrapper.find('[data-config-field="staleField"]').exists()).toBe(false)
})
