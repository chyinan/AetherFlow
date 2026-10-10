// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import RunConsole from './RunConsole.vue'

const state = vi.hoisted(() => ({ run: {} as any, workflow: {} as any, ui: {} as any }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => state.run }))
vi.mock('@/stores/workflowStore', () => ({ useWorkflowStore: () => state.workflow }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => state.ui }))
let wrappers: ReturnType<typeof mount>[] = []

beforeEach(() => {
  state.run = reactive({ currentRun: { id: 'run-1', workflowId: 'workflow-1', status: 'failed' }, logsLoading: false,
    logs: [{ id: 'log-1', time: '10:00', level: 'error', nodeId: 'image-1', message: 'secret-prefix [IMAGE_EXECUTION:COMFYUI:QUEUE:sampler:REJECTED] secret-body' }] })
  state.workflow = reactive({ workflowId: 'workflow-1', backendDefinitionId: null,
    nodes: [{ id: 'image-1', selected: false, data: { kind: 'image-generation' } }, { id: 'image-2', selected: true, data: { kind: 'upscale' } }] })
  state.ui = reactive({ selectedNodeId: 'image-2', setSelectedNode(id: string) { this.selectedNodeId = id } })
})
afterEach(() => { wrappers.forEach((wrapper) => wrapper.unmount()); wrappers = []; document.body.replaceChildren() })
function render() {
  const wrapper = mount(RunConsole, { global: { plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': {} }, missingWarn: false, fallbackWarn: false })], stubs: { StatusBadge: true } } })
  wrappers.push(wrapper)
  return wrapper
}
describe('执行日志的图像故障建议', () => {
  it('显示阶段与真实字段建议，不显示原始响应，定位不触发重试', async () => {
    document.body.innerHTML = '<aside data-node-inspector="image-1"></aside>'
    const listener = vi.fn()
    document.querySelector('aside')!.addEventListener('aetherflow-focus-config', listener)
    const wrapper = render()
    expect(wrapper.text()).toContain('工作流提交失败')
    expect(wrapper.text()).toContain('兼容采样器')
    expect(wrapper.text()).not.toContain('secret')
    await wrapper.get('[data-testid="locate-image-failure"]').trigger('click')
    await flushPromises()
    expect(state.ui.selectedNodeId).toBe('image-1')
    expect(state.workflow.nodes.map((node: any) => node.selected)).toEqual([true, false])
    expect((listener.mock.calls[0]![0] as CustomEvent).detail.field).toBe('sampler')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('其他工作流、已删除节点不提供错误定位', async () => {
    state.run.currentRun.workflowId = 'other'
    const wrapper = render()
    expect(wrapper.find('[data-testid="locate-image-failure"]').exists()).toBe(false)
    state.run.currentRun.workflowId = 'workflow-1'
    state.workflow.nodes = []
    await flushPromises()
    expect(wrapper.find('[data-testid="locate-image-failure"]').exists()).toBe(false)
  })
  it('切换运行后不执行旧点击的异步聚焦', async () => {
    document.body.innerHTML = '<aside data-node-inspector="image-1"></aside>'
    const listener = vi.fn()
    document.querySelector('aside')!.addEventListener('aetherflow-focus-config', listener)
    const wrapper = render()
    ;(wrapper.get('[data-testid="locate-image-failure"]').element as HTMLElement).click()
    state.run.currentRun.id = 'run-2'
    await flushPromises()
    expect(listener).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()
  })
  it('超时和中断提醒先确认服务端任务，不默认建议立即重试', async () => {
    state.run.logs[0].message = '[IMAGE_EXECUTION:SD_WEBUI:REQUEST:timeoutSeconds:TIMEOUT]'
    const wrapper = render()
    expect(wrapper.text()).toContain('远端任务可能仍在执行')
    expect(wrapper.text()).not.toContain('再手动重新运行')
    state.run.logs[0].message = '普通旧日志'
    await flushPromises()
    expect(wrapper.text()).toContain('普通旧日志')
    expect(wrapper.find('[data-testid="image-execution-failure"]').exists()).toBe(false)
  })
})
