// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getNodeCatalog } from '@/api/modules/node'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
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
  const node = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'variable-assigner')!, { x: 0, y: 0 })!
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

async function switchMode(wrapper: VueWrapper, mode: 'LITERAL' | 'SOURCE_VARIABLE') {
  await wrapper.get<HTMLSelectElement>('[data-config-field="valueMode"]').setValue(mode)
}

describe('VARIABLE_ASSIGNER JSON 值校验', () => {
  beforeEach(() => vi.mocked(getNodeCatalog).mockResolvedValue([]))
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('JSON 非法时校验按界面文本派生，不把错误写进 config，模式往返后仍提示', async () => {
    const { wrapper, configOf } = await render({
      variableMode: 'LITERAL', valueMode: 'LITERAL', valueType: 'JSON', value: { a: 1 }, valueJsonText: '{\n  "a": 1\n}',
    })
    await wrapper.get<HTMLTextAreaElement>('textarea[data-config-field="value"]').setValue('{broken')

    expect(configOf().valueJsonText).toBe('{broken')
    expect(configOf()).not.toHaveProperty('valueValidationError')
    // 解析失败时不得用未解析文本覆盖已保存的值，界面文本与 config 的差异必须靠提示暴露。
    expect(configOf().value).toEqual({ a: 1 })
    expect(wrapper.get('[role="alert"]').text().trim()).not.toBe('')

    await switchMode(wrapper, 'SOURCE_VARIABLE')

    // 未解析文本仍随 config 保存，来源变量模式下也必须提示，不能靠切模式把错误藏起来。
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await switchMode(wrapper, 'LITERAL')

    expect(wrapper.get<HTMLTextAreaElement>('textarea[data-config-field="value"]').element.value).toBe('{broken')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.get('[role="alert"]').text().trim()).not.toBe('')
    expect(configOf()).not.toHaveProperty('valueValidationError')
  })

  it('把文本修正为合法 JSON 后提示消失并写回值', async () => {
    const { wrapper, configOf } = await render({
      valueMode: 'LITERAL', valueType: 'JSON', value: { a: 1 }, valueJsonText: '{\n  "a": 1\n}',
    })
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea[data-config-field="value"]')
    await textarea.setValue('{broken')
    await textarea.setValue('{"a": 2}')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(configOf().value).toEqual({ a: 2 })
    expect(configOf().valueJsonText).toBe('{"a": 2}')
    expect(configOf()).not.toHaveProperty('valueValidationError')
  })

  it('切入点切换模式不再单向清除校验状态，字符串模式按文本原样保存', async () => {
    const { wrapper, configOf } = await render({
      valueMode: 'SOURCE_VARIABLE', valueType: 'STRING', value: '', sourceVariable: 'question',
    })
    await switchMode(wrapper, 'LITERAL')
    await wrapper.get<HTMLTextAreaElement>('textarea[data-config-field="value"]').setValue('hello')

    expect(configOf()).toMatchObject({ valueMode: 'LITERAL', valueType: 'STRING', value: 'hello' })
    expect(configOf()).not.toHaveProperty('valueValidationError')
  })

  it('保存链路以 valueJsonText 为准：最新文本随配置一起送进 mapper，非法文本不再被旧值掩盖', async () => {
    const { wrapper, workflow } = await render({
      valueMode: 'LITERAL', valueType: 'JSON', value: { a: 1 }, valueJsonText: '{\n  "a": 1\n}',
    })
    const saved = () => mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    }).nodes?.[0]?.config
    const textarea = wrapper.get<HTMLTextAreaElement>('textarea[data-config-field="value"]')

    await textarea.setValue('{"b": 3}')
    expect(saved()).toMatchObject({ valueType: 'JSON', value: { b: 3 } })

    await textarea.setValue('{broken')
    expect(() => saved()).toThrow()
  })
})
