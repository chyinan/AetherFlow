// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { customNodeTemplate, defaultCustomDefinition } from '@/utils/customNodes'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn(async () => []) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const wrappers: { unmount(): void }[] = []
const selector = '[data-testid="custom-node-config"] textarea'

async function mountInspector() {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  const ui = useUiStore()
  const base = defaultCustomDefinition()
  const template = customNodeTemplate({
    ...base,
    inputs: [{ name: 'metadata', type: 'OBJECT', defaultValue: { language: 'zh', edition: 1 } }],
    fields: [{ name: 'tags', type: 'ARRAY', defaultValue: ['voice', 'mix'] }],
    request: { ...base.request!, body: { metadata: '{{inputs.metadata}}', tags: '{{config.tags}}' } },
  })
  const first = store.addNodeFromTemplate(template, { x: 0, y: 0 })!
  const second = store.addNodeFromTemplate(template, { x: 140, y: 0 })!
  ui.setSelectedNode(first.id)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n] } })
  wrappers.push(wrapper)
  await flushPromises()
  const overrides = (group: 'customInputs' | 'customValues') => store.nodes.find(node => node.id === first.id)!.data.config[group]
  const field = (index: number) => wrapper.findAll<HTMLTextAreaElement>(selector)[index]!
  return { store, ui, first, second, overrides, field }
}

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('自定义节点 JSON 字段的文本编辑', () => {
  it.each([
    { index: 0, group: 'customInputs', key: 'metadata', value: { language: 'zh', edition: 1 } },
    { index: 1, group: 'customValues', key: 'tags', value: ['voice', 'mix'] },
  ] as const)('保留 $key 的换行和光标，同时画布收到原来的 JSON 类型和值', async ({ index, group, key, value }) => {
    const { field, overrides } = await mountInspector()
    const input = field(index)
    const element = input.element
    element.focus()
    element.setRangeText('\n  ', 1, 1, 'end')
    const entered = element.value
    const caret = element.selectionStart
    await input.trigger('input')

    expect(overrides(group)).toEqual({ [key]: value })
    expect.soft(element.value).toBe(entered)
    expect.soft(element.selectionStart).toBe(caret)
    expect(document.activeElement).toBe(element)
  })

  it('撤销重做显示历史值，切换同类型节点不带走编辑格式', async () => {
    const { store, ui, first, second, overrides, field } = await mountInspector()
    const edited = '{\n  "language": "en",\n  "edition": 2\n}'
    await field(0).setValue(edited)
    expect(overrides('customInputs')).toEqual({ metadata: { language: 'en', edition: 2 } })
    expect.soft(field(0).element.value).toBe(edited)

    expect(store.undo()).toBe(true)
    await nextTick()
    expect(field(0).element.value).toBe('{"language":"zh","edition":1}')
    expect(overrides('customInputs')).toEqual({})
    expect(store.redo()).toBe(true)
    await nextTick()
    expect(field(0).element.value).toBe('{"language":"en","edition":2}')

    ui.setSelectedNode(second.id)
    await nextTick()
    expect(field(0).element.value).toBe('{"language":"zh","edition":1}')
    ui.setSelectedNode(first.id)
    await nextTick()
    expect(field(0).element.value).toBe('{"language":"en","edition":2}')
  })

  it('暂时无效 JSON 和显式清空仍走现有校验；清空时输入框保持空白', async () => {
    const { overrides, field } = await mountInspector()
    const invalid = '{\n  "language":'
    await field(0).setValue(invalid)
    expect(field(0).element.value).toBe(invalid)
    expect(field(0).attributes('aria-invalid')).toBe('true')
    expect(overrides('customInputs')).toEqual({ metadata: invalid })

    await field(0).setValue('')
    expect(overrides('customInputs')).toEqual({ metadata: null })
    expect(field(0).attributes('aria-invalid')).toBe('false')
    expect(field(0).element.value).toBe('')
  })
})
