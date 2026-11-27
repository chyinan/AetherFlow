// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { workflowApi } from '@/services/api/workflowApi'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import NodeInspector from './NodeInspector.vue'

const api = vi.hoisted(() => ({ getNodeCatalog: vi.fn(), updateDefinition: vi.fn(), getDefinition: vi.fn() }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: api.getNodeCatalog }))
vi.mock('@/api/modules/workflow', async (original) => ({ ...await original<typeof import('@/api/modules/workflow')>(), updateDefinition: api.updateDefinition, getDefinition: api.getDefinition }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let wrapper: VueWrapper | undefined
let persisted: WorkflowDefinitionDTO
beforeEach(() => {
  localStorage.clear()
  api.getNodeCatalog.mockResolvedValue([])
  api.updateDefinition.mockImplementation(async (_id, value) => {
    persisted = JSON.parse(JSON.stringify(value)) as WorkflowDefinitionDTO
    return { id: 101, name: value.name, definitionJson: JSON.stringify(value), version: 2, status: 'DRAFT' }
  })
  api.getDefinition.mockImplementation(async () => ({ id: 101, name: persisted.name, definitionJson: JSON.stringify(persisted), version: 2, status: 'DRAFT' }))
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; i18n.global.locale.value = 'zh-CN'; vi.restoreAllMocks() })

async function setup(kind: 'loop' | 'iteration', locale: 'zh-CN' | 'en-US' | 'ja-JP' = 'zh-CN') {
  i18n.global.locale.value = locale
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate({ ...nodeTemplates.find(item => item.kind === 'loop')!, kind }, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, { maxIterations: 3, concurrency: 4 })
  useUiStore().setSelectedNode(node.id)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n], stubs: { NodeConnectionSelector: true } } })
  await flushPromises()
  const saveAndReopen = async () => {
    await workflowApi.saveWorkflow({ id: '101', name: 'Numeric settings', backendDefinitionId: 101, nodes: store.nodes, edges: store.edges }, { allowMockFallback: false })
    return workflowApi.getWorkflow('101')
  }
  return { store, node, saveAndReopen }
}

it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('clearing iteration numbers keeps blank input and announces saved defaults in %s', async locale => {
  const { node, saveAndReopen } = await setup('iteration', locale)
  for (const [key, fallback] of [['maxIterations', 12], ['concurrency', 1]] as const) {
    const field = wrapper!.get<HTMLInputElement>(`[data-config-field="${key}"]`)
    await field.setValue('')
    expect(field.element.value).toBe('')
    expect(field.attributes('placeholder')).toBe(String(fallback))
    expect(wrapper!.text()).toContain(i18n.global.t('workflow.inspector.emptyNumberDefault', { value: fallback }))
  }
  const reopened = await saveAndReopen()
  expect(persisted.nodes[0]!.config).toMatchObject({ maxIterations: 12, concurrency: 1 })
  expect(reopened.nodes.find(item => item.id === node.id)!.data.config).toMatchObject({ maxIterations: 12, concurrency: 1 })
})

it.each(['loop', 'iteration'] as const)('%s blank uses its default but explicitly entering zero stays zero', async kind => {
  const { store, node, saveAndReopen } = await setup(kind)
  const field = wrapper!.get<HTMLInputElement>('[data-config-field="maxIterations"]')
  await field.setValue('')
  expect(field.element.value).toBe('')
  expect((await saveAndReopen()).nodes.find(item => item.id === node.id)!.data.config.maxIterations).toBe(kind === 'iteration' ? 12 : 10)
  await field.setValue('0')
  expect(field.element.value).toBe('0')
  expect(store.nodes.find(item => item.id === node.id)!.data.config.maxIterations).toBe(0)
  expect((await saveAndReopen()).nodes.find(item => item.id === node.id)!.data.config.maxIterations).toBe(0)
  expect(wrapper!.find('[data-number-default="maxIterations"]').exists()).toBe(false)
  await field.setValue('1000')
  expect((await saveAndReopen()).nodes.find(item => item.id === node.id)!.data.config.maxIterations).toBe(1000)
})
