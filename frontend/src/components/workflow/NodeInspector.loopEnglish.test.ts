// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import NodeInspector from './NodeInspector.vue'

const api = vi.hoisted(() => ({ getNodeCatalog: vi.fn(), listDefinitions: vi.fn(), listDefinitionVersions: vi.fn() }))
vi.mock('@/api/modules/node', async (original) => ({
  ...await original<typeof import('@/api/modules/node')>(), getNodeCatalog: api.getNodeCatalog,
}))
vi.mock('@/api/modules/workflow', async (original) => ({
  ...await original<typeof import('@/api/modules/workflow')>(),
  listDefinitions: api.listDefinitions, listDefinitionVersions: api.listDefinitionVersions,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let wrapper: VueWrapper | undefined
beforeEach(() => {
  i18n.global.locale.value = 'en-US'
  vi.clearAllMocks()
  api.getNodeCatalog.mockResolvedValue([{
    type: 'WHISPER', displayName: 'Whisper',
    exampleConfig: { fileUrlVariable: 'fileUrl', language: 'auto' },
    configSchema: [],
  }])
  api.listDefinitions.mockResolvedValue([])
  api.listDefinitionVersions.mockResolvedValue([])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  i18n.global.locale.value = 'zh-CN'
  vi.restoreAllMocks()
})

async function setup(kind: 'iteration' | 'loop') {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const template = nodeTemplates.find(item => item.kind === 'loop')!
  const node = store.addNodeFromTemplate({ ...template, kind }, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n] } })
  await flushPromises()
  return { store, config: () => store.nodes.find(item => item.id === node.id)!.data.config }
}

it.each(['iteration', 'loop'] as const)('renders and edits a valid %s node in English', async kind => {
  const { config } = await setup(kind)
  const panel = wrapper!.findAll('section').find(section => section.text().includes('Current execution boundary'))!

  expect.soft(panel.text()).toContain(kind === 'iteration'
    ? 'Runs the steps below for each item and supports asynchronous waits and recovery.'
    : 'Runs the steps below for each round and feeds the state back for the next round.')
  expect.soft(panel.text()).not.toMatch(/[\u3400-\u9fff]/u)
  expect.soft(wrapper!.get('[data-config-field="indexVariable"]').attributes('aria-label')).toBe('Index variable name')
  expect.soft(wrapper!.get('[data-test="loop-body-editor"]')).toBeDefined()
  expect.soft(wrapper!.get('[data-test="add-body-node"]').text()).toBe('Add step')
  expect.soft(wrapper!.text()).toContain('Loop body')
  expect.soft(wrapper!.text()).toContain('No body steps are configured.')

  const input = wrapper!.get<HTMLInputElement>('[data-config-field="inputVariable"]')
  await input.setValue('records')
  expect(config().inputVariable).toBe('records')
  if (kind === 'iteration') {
    expect.soft(wrapper!.get('[data-config-field="itemVariable"]').attributes('aria-label')).toBe('Item variable name')
    expect.soft(wrapper!.get('[data-config-field="concurrency"]').attributes('aria-label')).toBe('Max items waiting on external tasks (1–8)')
    expect.soft(wrapper!.get('[data-config-field="failureStrategy"]').attributes('aria-label')).toBe('When an item fails')
    expect.soft(wrapper!.get('[data-config-field="failureStrategy"] option[value="STOP"]').text()).toBe('Stop the batch')
  } else {
    expect.soft(wrapper!.get('[data-config-field="stopWhen"]').element.getAttribute('placeholder')).toContain('For example')
  }
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  expect(config().bodyNodes).toMatchObject([{ nodeId: 'step-1', nodeType: 'WHISPER', config: { fileUrlVariable: 'item', language: 'auto' } }])
  expect.soft(wrapper!.find('[aria-label="循环体节点类型"]').exists()).toBe(false)
  expect.soft(wrapper!.find('[aria-label="Loop body node type"]').exists()).toBe(true)
  expect.soft(wrapper!.find('[aria-label="Step name"]').exists()).toBe(true)
  expect.soft(wrapper!.find('[aria-label="Move step down"]').exists()).toBe(true)
  expect.soft(wrapper!.find('[aria-label="Delete step"]').exists()).toBe(true)
})
