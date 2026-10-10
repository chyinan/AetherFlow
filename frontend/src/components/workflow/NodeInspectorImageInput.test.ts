// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { getNodeCatalog } from '@/api/modules/node'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
import NodeInspector from './NodeInspector.vue'
import ImageInputPicker from './ImageInputPicker.vue'
import NodeConnectionSelector from './NodeConnectionSelector.vue'
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const wrappers: VueWrapper[] = []
async function render(kind: 'image-generation' | 'upscale' = 'image-generation', config: Record<string, unknown> = { mode: 'img2img' }) {
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === kind)!, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, config); useUiStore().setSelectedNode(node.id)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: { NodeConnectionSelector: {
    name: 'NodeConnectionSelector',
    template: '<div><select data-config-field="connectionId"><option>Connection</option></select><select data-config-field="checkpoint" disabled><option>Checkpoint</option></select></div>',
  }, WhisperEnvironmentDialog: true } } })
  wrappers.push(wrapper); await flushPromises(); return { wrapper, store, node }
}
describe('检查器图片输入集成', () => {
  beforeEach(() => {
    vi.mocked(getNodeCatalog).mockResolvedValue([{ type: 'IMAGE_GENERATION', configSchema: [
      { name: 'mode', type: 'STRING', options: ['txt2img', 'img2img'], ui: { mode: 'basic', control: 'segmented' } },
      { name: 'workflowJson', type: 'STRING', ui: { mode: 'advanced', control: 'textarea' } },
      { name: 'workflow', type: 'OBJECT', ui: { mode: 'advanced', control: 'json' } },
      { name: 'timeoutSeconds', type: 'NUMBER', ui: { mode: 'advanced', control: 'number' } },
      { name: 'sourceImage', type: 'STRING', ui: { mode: 'advanced', control: 'textarea' } },
      { name: 'sourceImageVariable', type: 'STRING', ui: { mode: 'advanced', control: 'input' } },
    ] }])
  })
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })
  it.each(['image-generation', 'upscale'] as const)('%s 图片设置进入已有 store 原子变更流程', async (kind) => {
    const { wrapper, store, node } = await render(kind)
    const picker = wrapper.getComponent(ImageInputPicker)
    const history = store.historyPast.length
    picker.vm.$emit('apply', { sourceImage: '', sourceImageVariable: 'imageFileIds' }, node.id)
    expect(store.historyPast.length).toBe(history + 1)
    expect(store.nodes[0]?.data.config.sourceImageVariable).toBe('imageFileIds')
    expect(store.undo()).toBe(true)
    expect(store.nodes[0]?.data.config.sourceImageVariable).not.toBe('imageFileIds')
  })
  it('txt2img 隐藏未使用源图输入，切到 img2img 后自动呈现', async () => {
    const { wrapper, store, node } = await render('image-generation', { mode: 'txt2img' })
    expect(wrapper.findComponent(ImageInputPicker).exists()).toBe(false)
    store.updateNodeConfig(node.id, 'mode', 'img2img'); await flushPromises()
    expect(wrapper.findComponent(ImageInputPicker).exists()).toBe(true)
    expect(wrapper.findAll('[data-config-field="sourceImage"]')).toHaveLength(1)
  })
  it('迟到的另一个节点 apply 事件不会修改当前节点', async () => {
    const { wrapper, store, node } = await render()
    const before = { ...node.data.config }
    wrapper.getComponent(ImageInputPicker).vm.$emit('apply', { sourceImage: 'stale' }, 'another-node')
    expect(store.nodes[0]?.data.config).toEqual(before)
  })
  it.each(['workflowJson', 'workflow', 'timeoutSeconds'])('错误定位从运行面板打开高级字段 %s，清单定位可返回基础字段', async (field) => {
    const { wrapper, node } = await render()
    const lastRun = wrapper.findAll('button').find((button) => button.text() === i18n.global.t('workflow.inspector.lastRun'))!
    await lastRun.trigger('click')
    expect(wrapper.find(`[data-config-field="${field}"]`).exists()).toBe(false)
    expect(requestNodeConfigFieldFocus(node.id, field)).toBe(true)
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get(`[data-config-field="${field}"]`).element)
    wrapper.getComponent(NodeConnectionSelector).vm.$emit('locateConfig', 'mode', node.id)
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.findAll('[data-config-field="mode"]')[0]!.element)
  })
  it('从 lastRun 定位源图片会重开选择器且不自动打开文件对话框', async () => {
    const { wrapper, node } = await render()
    await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('workflow.inspector.lastRun'))!.trigger('click')
    expect(wrapper.findComponent(ImageInputPicker).exists()).toBe(false)
    requestNodeConfigFieldFocus(node.id, 'sourceImage')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-config-field="sourceImage"]').element)
  })
  it('快速切换节点后旧定位请求不能抢占新节点焦点或展开设置', async () => {
    const { wrapper, store, node } = await render()
    const other = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'image-generation')!, { x: 100, y: 0 })!
    store.updateNodeConfig(other.id, 'mode', 'img2img')
    const outside = document.createElement('button'); document.body.append(outside); outside.focus()
    requestNodeConfigFieldFocus(node.id, 'timeoutSeconds')
    useUiStore().setSelectedNode(other.id)
    // DOM 尚未更新时的旧 ID 事件也必须被忽略。
    requestNodeConfigFieldFocus(node.id, 'workflow')
    await flushPromises()
    expect(wrapper.get('[data-node-inspector]').attributes('data-node-inspector')).toBe(other.id)
    expect(wrapper.find('[data-config-field="timeoutSeconds"]').exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
    wrapper.getComponent(NodeConnectionSelector).vm.$emit('locateConfig', 'workflow', node.id)
    await flushPromises()
    expect(wrapper.find('[data-config-field="workflow"]').exists()).toBe(false)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('不可用模型字段定位回退到连接选择器', async () => {
    const { wrapper, node } = await render()
    requestNodeConfigFieldFocus(node.id, 'checkpoint')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-config-field="connectionId"]').element)
  })

})
