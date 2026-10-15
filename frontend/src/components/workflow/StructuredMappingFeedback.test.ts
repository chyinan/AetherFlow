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
import type { MappingSpec } from '@/utils/structuredMapping'

const api = vi.hoisted(() => ({ getNodeCatalog: vi.fn(), listDefinitions: vi.fn(), listDefinitionVersions: vi.fn(), createDefinition: vi.fn(), updateDefinition: vi.fn(), getDefinition: vi.fn() }))
vi.mock('@/api/modules/node', async (original) => ({
  ...await original<typeof import('@/api/modules/node')>(), getNodeCatalog: api.getNodeCatalog,
}))
vi.mock('@/api/modules/workflow', async (original) => ({
  ...await original<typeof import('@/api/modules/workflow')>(),
  listDefinitions: api.listDefinitions, listDefinitionVersions: api.listDefinitionVersions, createDefinition: api.createDefinition, updateDefinition: api.updateDefinition, getDefinition: api.getDefinition,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.clearAllMocks()
  api.getNodeCatalog.mockResolvedValue([{
    type: 'WHISPER', displayName: 'Whisper',
    exampleConfig: { fileUrlVariable: 'fileUrl', fileIdVariable: 'fileId', language: 'auto', prompt: '' },
    configSchema: [],
  }])
  api.listDefinitions.mockResolvedValue([{ id: 7, name: '子工作流' }, { id: 8, name: '第二个' }, { id: 9, name: '第三个' }])
  api.listDefinitionVersions.mockResolvedValue([{ definitionId: 7, version: 2 }])
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })


async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find(t => t.kind === 'template-transform')!, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, { transformMode: 'structured' })
  useUiStore().setSelectedNode(node.id)
  const errors: unknown[] = []
  const mountInspector = () => mount(NodeInspector, { global: { plugins: [pinia, i18n], config: { errorHandler: e => errors.push(e) } } })
  wrapper = mountInspector(); await flushPromises()
  const field = (name: string) => wrapper!.get(`[data-testid="${name}"]`)
  return { store, node, errors, field, mountInspector }
}

const successText = '已应用到节点，请保存工作流'
async function applyLiteral() {
  const context = await setup()
  await wrapper!.get('[aria-label="取值方式 1"]').setValue('literal')
  await wrapper!.get('[aria-label="字段值 1"]').setValue('{invalid')
  expect(context.field('apply-mapping').attributes()).toHaveProperty('disabled')
  await wrapper!.get('[aria-label="字段值 1"]').setValue('42')
  await context.field('apply-mapping').trigger('click'); await flushPromises()
  return context
}
it('真实检查器将纠正后的映射写入 Pinia 后保留本次应用成功提示', async () => {
  const { store, node, errors } = await applyLiteral()
  expect((store.nodes.find(n => n.id === node.id)!.data.config.mapping as MappingSpec).fields[0]!.value).toBe(42)
  expect(wrapper!.find('[data-testid="mapping-config-error"]').exists()).toBe(false)
  expect(wrapper!.text()).toContain(successText)
  await flushPromises()
  expect(wrapper!.text()).toContain(successText)
  expect(errors).toEqual([])
})
it('连续显式应用同一映射仍展示成功且保持输出契约', async () => {
  const { store, node, field } = await applyLiteral()
  const past = store.historyPast.length
  const expected = JSON.stringify(store.nodes.find(n => n.id === node.id)!.data.config)
  await field('apply-mapping').trigger('click'); await flushPromises()
  expect(wrapper!.text()).toContain(successText)
  expect(JSON.stringify(store.nodes.find(n => n.id === node.id)!.data.config)).toBe(expected)
  expect(store.historyPast).toHaveLength(past + 1)
})
it.each([
  ['mapping-source', 'other'],
  ['mapping-output-variable', 'newOutput'],
  ['mapping-preview-input', '{"other":1}'],
])('应用后编辑 %s 会清除成功提示', async (name, value) => {
  const { field } = await applyLiteral()
  await field(name).setValue(value)
  expect(wrapper!.text()).not.toContain(successText)
})
it('外部替换及撤销重做均不能沿用上一次应用提示', async () => {
  const { store, node, field } = await applyLiteral()
  store.updateNodeConfigValues(node.id, { outputVariable: 'external' }); await flushPromises()
  expect(wrapper!.text()).not.toContain(successText)
  expect((field('mapping-output-variable').element as HTMLInputElement).value).toBe('external')
  expect(store.undo()).toBe(true); await flushPromises()
  expect(wrapper!.text()).not.toContain(successText)
  expect(store.redo()).toBe(true); await flushPromises()
  expect(wrapper!.text()).not.toContain(successText)
})
it('等内容的新映射对象属于外部替换，不延续成功提示', async () => {
  const { store, node } = await applyLiteral()
  const config = store.nodes.find(n => n.id === node.id)!.data.config
  store.updateNodeConfigValues(node.id, { mapping: JSON.parse(JSON.stringify(config.mapping)) }); await flushPromises()
  expect(wrapper!.text()).not.toContain(successText)
})
it('切换到相同配置的另一个节点不会显示旧成功提示', async () => {
  const { store, node } = await applyLiteral()
  const values = JSON.parse(JSON.stringify(store.nodes.find(n => n.id === node.id)!.data.config))
  const next = store.addNodeFromTemplate(nodeTemplates.find(t => t.kind === 'template-transform')!, { x: 1, y: 1 })!
  store.updateNodeConfigValues(next.id, values)
  useUiStore().setSelectedNode(next.id); await flushPromises()
  expect(wrapper!.text()).not.toContain(successText)
})
it('关闭重开同一节点不沿用先前成功提示', async () => {
  const { node } = await applyLiteral()
  useUiStore().setSelectedNode(null); await flushPromises()
  useUiStore().setSelectedNode(node.id); await flushPromises()
  expect(wrapper!.text()).not.toContain(successText)
})
it('应用回传前原地改写映射不能冒充本次应用确认', async () => {
  const { store, node, field } = await setup()
  const applying = field('apply-mapping').trigger('click')
  const mapping = store.nodes.find(n => n.id === node.id)!.data.config.mapping as MappingSpec
  mapping.sourcePath = 'externalReplacement'
  await applying; await flushPromises()
  expect((field('mapping-source').element as HTMLInputElement).value).toBe('externalReplacement')
  expect(wrapper!.text()).not.toContain(successText)
})
