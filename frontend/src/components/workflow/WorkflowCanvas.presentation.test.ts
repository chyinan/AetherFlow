// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { NodeTemplate } from '@/types/workflow'
import WorkflowCanvas from './WorkflowCanvas.vue'

const fixture = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))
vi.mock('@/stores/workflowStore', () => ({ useWorkflowStore: () => fixture.store }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ selectedNodeId: null, setSelectedNode: vi.fn() }) }))
vi.mock('@vue-flow/core', () => ({ useVueFlow: () => ({ fitView: vi.fn() }), VueFlow: { template: '<div><slot /></div>' } }))
vi.mock('@vue-flow/background', () => ({ Background: { template: '<div />' } }))
vi.mock('@vue-flow/controls', () => ({ Controls: { template: '<div />' } }))
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { template: '<div />' } }))
vi.mock('./NodeAddMenu.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./WorkflowNode.vue', () => ({ default: { template: '<div />' } }))

const templates: NodeTemplate[] = [
  { kind: 'start', category: 'Input', label: 'Start', description: '', config: {}, inputs: [], outputs: ['fileId'] },
  { kind: 'summary', category: 'AI', label: 'Summary', description: '', config: {}, inputs: ['transcript'], outputs: ['summaryText'] },
  { kind: 'image-generation', category: 'Image', label: 'Image', description: '', config: {}, inputs: ['prompt'], outputs: ['imageUrl'], availability: { available: false, reason: '展示夹具：服务未就绪' } },
]
let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  fixture.store = reactive({ nodes: [], edges: [], editRevision: 0, templates: structuredClone(templates) })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

function setup() {
  wrapper = mount(WorkflowCanvas, { global: { plugins: [i18n] } })
  return wrapper
}
function cards() { return wrapper!.findAll('[data-node-template]') }

describe('工作流节点目录展示', () => {
  it('默认按分类展示全部节点并保留不可用原因', () => {
    const view = setup()
    expect(view.findAll('[data-node-category]').map(group => group.attributes('data-node-category'))).toEqual(['Input', 'AI', 'Image'])
    expect(cards().map(card => card.attributes('data-node-template'))).toEqual(['start', 'summary', 'image-generation'])
    expect(view.text()).toContain('展示夹具：服务未就绪')
  })

  it('搜索本地化名称、分类和输入输出', async () => {
    const view = setup()
    const search = view.get('aside input[type="search"]')
    expect(search.attributes('aria-label')).toBe(i18n.global.t('workflow.searchNodes'))
    await search.setValue(i18n.global.t('workflow.catalog.items.summary.label'))
    expect(cards().map(card => card.attributes('data-node-template'))).toEqual(['summary'])
    await search.setValue('  SUMMARYTEXT  ')
    expect(cards().map(card => card.attributes('data-node-template'))).toEqual(['summary'])
    await search.setValue(i18n.global.t('workflow.catalog.categories.Image'))
    expect(cards().map(card => card.attributes('data-node-template'))).toEqual(['image-generation'])
  })

  it('无结果时提供反馈并可重置恢复全部节点', async () => {
    const view = setup()
    await view.get('aside input[type="search"]').setValue('没有匹配的节点')
    expect(cards()).toHaveLength(0)
    expect(view.get('[data-testid="node-palette-no-results"]').attributes('role')).toBe('status')
    expect(view.get('[data-testid="node-palette-no-results"]').text()).toContain(i18n.global.t('common.noResult'))
    await view.get('[data-action="clear-node-search"]').trigger('click')
    expect((view.get('aside input[type="search"]').element as HTMLInputElement).value).toBe('')
    expect(cards()).toHaveLength(templates.length)
  })

  it('目录为空时保留原有空状态', () => {
    fixture.store.templates = []
    const view = setup()
    expect(view.text()).toContain(i18n.global.t('workflow.noCurrentNodes'))
    expect(cards()).toHaveLength(0)
  })
})
