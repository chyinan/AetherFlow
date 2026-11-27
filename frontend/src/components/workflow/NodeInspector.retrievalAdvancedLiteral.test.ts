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
let wrapper: VueWrapper | undefined
let previousLocale = i18n.global.locale.value

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const workflow = useWorkflowStore()
  workflow.resetToEmptyWorkflow()
  const node = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'knowledge-retrieval')!, { x: 0, y: 0 })!
  workflow.updateNodeConfigValues(node.id, { queryText: 'test query', datasetId: '1', topK: 3 })
  useUiStore().setSelectedNode(node.id)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n] } })
  await flushPromises()
  const definition = () => mapWorkflowToDefinitionDTO({ id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges })
  return { workflow, node, definition }
}

describe('知识检索高级设置中的 JSON 示例', () => {
  beforeEach(() => {
    vi.mocked(getNodeCatalog).mockResolvedValue([])
    previousLocale = i18n.global.locale.value
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
    i18n.global.locale.value = previousLocale
  })

  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s 下可展开、编辑并保存元数据过滤条件', async (locale) => {
    i18n.global.locale.value = locale
    const { definition } = await setup()
    const expand = wrapper!.get('button[aria-expanded]')
    await expand.trigger('click')
    const metadata = wrapper!.get<HTMLTextAreaElement>('[data-config-field="metadataFilter"]')
    expect(metadata.attributes('placeholder')).toBe('{"sourceType":"input"}')
    await metadata.setValue('{"sourceType":"input"}')
    const dto = definition()
    expect(dto.nodes[0]!.config!.metadataFilter).toBe('{"sourceType":"input"}')
    const reopened = mapBackendDefinitionGraph(JSON.parse(JSON.stringify(dto.nodes)))
    expect(JSON.parse(String(reopened.nodes[0]!.data.config.metadataFilter))).toEqual({ sourceType: 'input' })
    await expand.trigger('click')
    expect(wrapper!.find('[data-config-field="metadataFilter"]').exists()).toBe(false)
    await expand.trigger('click')
    expect(wrapper!.get<HTMLTextAreaElement>('[data-config-field="metadataFilter"]').element.value).toBe('{"sourceType":"input"}')
  })

  it('Top K 数字与滑杆在已有 1–50 范围内保持同步，保存后仍是数字', async () => {
    const { definition } = await setup()
    await wrapper!.get('button[aria-expanded]').trigger('click')
    const number = wrapper!.get<HTMLInputElement>('input[type="number"][data-config-field="topK"]')
    const range = wrapper!.get<HTMLInputElement>('input[type="range"][data-config-field="topK"]')
    await number.setValue('50')
    expect(range.element.value).toBe('50')
    expect(definition().nodes[0]!.config!.topK).toBe(50)
    await range.setValue('1')
    expect(number.element.value).toBe('1')
    expect(definition().nodes[0]!.config!.topK).toBe(1)
  })
})

it('清空 Top K 后数字框保留空白、滑杆显示默认值 3，保存与重开一致', async () => {
  vi.mocked(getNodeCatalog).mockResolvedValue([])
  const { workflow, node, definition } = await setup()
  try {
    await wrapper!.get('button[aria-expanded]').trigger('click')
    const number = wrapper!.get<HTMLInputElement>('input[type="number"][data-config-field="topK"]')
    const range = wrapper!.get<HTMLInputElement>('input[type="range"][data-config-field="topK"]')
    await number.setValue('50')
    await number.setValue('')
    expect(number.element.value).toBe('')
    expect(number.attributes('placeholder')).toBe('3')
    expect(range.element.value).toBe('3')
    expect(workflow.nodes.find(item => item.id === node.id)!.data.config.topK).toBe('')
    expect(wrapper!.get('[data-number-default="topK"]').text()).toBe(i18n.global.t('workflow.inspector.emptyNumberDefault', { value: 3 }))
    const dto = definition()
    expect(dto.nodes[0]!.config!.topK).toBe(3)
    expect(mapBackendDefinitionGraph(JSON.parse(JSON.stringify(dto.nodes))).nodes[0]!.data.config.topK).toBe(3)
    await range.setValue('1')
    expect(number.element.value).toBe('1')
    expect(wrapper!.find('[data-number-default="topK"]').exists()).toBe(false)
    expect(definition().nodes[0]!.config!.topK).toBe(1)
  } finally {
    wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks()
  }
})
