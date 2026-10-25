// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getNodeCatalog } from '@/api/modules/node'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const wrappers: VueWrapper[] = []

async function render(config: Record<string, unknown>) {
  const pinia = createPinia(); setActivePinia(pinia)
  const workflow = useWorkflowStore(); workflow.resetToEmptyWorkflow()
  const node = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'condition')!, { x: 0, y: 0 })!
  node.data.config = { ...node.data.config, ...config }
  workflow.historyPast = []; workflow.historyFuture = []; workflow.dirty = false
  useUiStore().setSelectedNode(node.id)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper); await flushPromises()
  const configOf = () => workflow.nodes.find((item) => item.id === node.id)?.data.config ?? {}
  return { wrapper, workflow, node, configOf }
}

describe('CONDITION 标量比较值往返', () => {
  beforeEach(() => vi.mocked(getNodeCatalog).mockResolvedValue([]))
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('比较值编辑器写字符串标量，保存与重开都不包装成对象', async () => {
    const { wrapper, workflow, node, configOf } = await render({ variable: 'score', operator: 'EQUALS', value: '' })
    await wrapper.get<HTMLInputElement>('[data-config-field="value"]').setValue('0.75')

    expect(configOf().value).toBe('0.75')

    const definition = mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    })
    expect(definition.nodes?.[0]?.config).toMatchObject({ value: '0.75' })
    expect(typeof (definition.nodes?.[0]?.config as Record<string, unknown>).value).toBe('string')

    const reopened = mapBackendDefinitionGraph(JSON.parse(JSON.stringify(definition.nodes ?? [])))
    const reopenedConfig = reopened.nodes.find((item) => item.id === node.id)?.data.config ?? {}
    expect(reopenedConfig.value).toBe('0.75')
    expect(typeof reopenedConfig.value).toBe('string')
  })

  it.each(['EQUALS', 'NOT_EQUALS'] as const)('%s 显式空串经过保存与重开仍是空串', async (operator) => {
    const { workflow, node } = await render({ variable: 'result', operator, value: '' })
    const definition = mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    })

    expect(definition.nodes?.[0]?.config).toHaveProperty('value', '')
    const reopened = mapBackendDefinitionGraph(JSON.parse(JSON.stringify(definition.nodes ?? [])))
    const reopenedConfig = reopened.nodes.find((item) => item.id === node.id)?.data.config ?? {}
    expect(reopenedConfig).toMatchObject({ operator, value: '' })
    const resaved = mapWorkflowToDefinitionDTO({
      id: reopened.nodes[0]!.id, name: workflow.workflowName, nodes: reopened.nodes, edges: reopened.edges,
    })
    expect(resaved.nodes?.[0]?.config).toHaveProperty('value', '')
  })

  it('切换操作符并 Undo/Redo 时仍保留显式空串比较值', async () => {
    const { workflow, node, configOf } = await render({ variable: 'result', operator: 'EQUALS', value: '' })
    workflow.updateNodeConfig(node.id, 'operator', 'NOT_EQUALS')
    expect(configOf()).toMatchObject({ operator: 'NOT_EQUALS', value: '' })

    expect(workflow.undo()).toBe(true)
    expect(configOf()).toMatchObject({ operator: 'EQUALS', value: '' })
    const afterUndo = mapWorkflowToDefinitionDTO({ id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges })
    expect(afterUndo.nodes?.[0]?.config).toMatchObject({ operator: 'EQUALS', value: '' })

    expect(workflow.redo()).toBe(true)
    expect(configOf()).toMatchObject({ operator: 'NOT_EQUALS', value: '' })
    const afterRedo = mapWorkflowToDefinitionDTO({ id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges })
    expect(afterRedo.nodes?.[0]?.config).toMatchObject({ operator: 'NOT_EQUALS', value: '' })
  })

  it('已保存的标量值在检查器中原样回显，不会被序列化或取对象标签', async () => {
    const { wrapper } = await render({ variable: 'score', operator: 'GREATER_THAN', value: 'abc-def' })

    expect(wrapper.get<HTMLInputElement>('[data-config-field="value"]').element.value).toBe('abc-def')
  })
})
