// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getNodeConnections: vi.fn(), createNodeConnection: vi.fn(), updateNodeConnection: vi.fn(), probeNodeConnection: vi.fn(), probeSavedNodeConnection: vi.fn() }))
vi.mock('@/api/modules/nodeConnections', () => mocks)
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn().mockResolvedValue([]) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'
import NodeConnectionSelector from './NodeConnectionSelector.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const saved: NodeConnection = { id: 'saved-comfy', name: '原连接', provider: 'COMFYUI', baseUrl: 'http://old-service:8188', readOnly: false }
const deployment: NodeConnection = { ...saved, id: 'deployment-comfyui', name: '部署连接', readOnly: true }
const created: NodeConnection = { ...saved, id: 'created-after-close', name: 'A 节点工作室', baseUrl: 'http://new-service:8188' }
const usable: NodeConnectionProbe = { status: 'usable', message: '可用', detectedFrom: 'backend', models: { checkpoints: ['real.safetensors'], vaes: [], loras: [], samplers: ['euler'], schedulers: ['normal'], upscalers: ['bilinear'] }, capabilities: ['IMAGE_GENERATION', 'UPSCALE'] }
const wrappers: VueWrapper[] = []
async function render() {
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const template = nodeTemplates.find((item) => item.kind === 'image-generation')!
  const a = store.addNodeFromTemplate(template, { x: 0, y: 0 })!
  const b = store.addNodeFromTemplate(template, { x: 100, y: 0 })!
  store.updateNodeConfigValues(a.id, { provider: 'COMFYUI', checkpoint: 'keep-a', sampler: 'legacy-a', mode: 'txt2img' })
  store.updateNodeConfigValues(b.id, { provider: 'COMFYUI', connectionId: saved.id, checkpoint: 'keep-b', mode: 'txt2img' })
  const ui = useUiStore(); ui.setSelectedNode(a.id)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: { Teleport: true } } })
  wrappers.push(wrapper); await flushPromises()
  return { wrapper, store, ui, a, b, pinia, before: JSON.stringify(store.nodes.map((node) => node.data.config)), history: store.historyPast.length }
}
async function startSave(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="add-connection"]').trigger('click')
  await wrapper.get('[data-testid="connection-name"]').setValue(created.name)
  await wrapper.get('[data-testid="connection-url"]').setValue(created.baseUrl)
  await wrapper.get('[data-testid="test-connection"]').trigger('click'); await flushPromises()
  await wrapper.get('[data-testid="save-connection"]').trigger('click')
}
function unchanged(context: Awaited<ReturnType<typeof render>>) {
  expect(JSON.stringify(context.store.nodes.map((node) => node.data.config))).toBe(context.before)
  expect(context.store.historyPast).toHaveLength(context.history)
}
function option(wrapper: VueWrapper) { return wrapper.get('[data-testid="connection-select"]').find(`option[value="${created.id}"]`) }

describe('连接保存跨向导和检查器生命周期', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getNodeConnections.mockResolvedValue({ connections: [deployment, saved] })
    mocks.probeNodeConnection.mockResolvedValue(usable); mocks.probeSavedNodeConnection.mockResolvedValue(usable)
    mocks.createNodeConnection.mockResolvedValue(created); mocks.updateNodeConnection.mockResolvedValue(saved)
  })
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it.each(['cancel', 'escape', 'backdrop', 'close'] as const)('保存中通过 %s 关闭后，成功记录仍可选且反馈已保存未应用', async (dismiss) => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); const { wrapper } = context; await startSave(wrapper)
    const dialog = wrapper.get('[data-testid="connection-dialog"]')
    if (dismiss === 'cancel') await wrapper.get('[data-testid="cancel-connection"]').trigger('click')
    if (dismiss === 'escape') await dialog.trigger('keydown', { key: 'Escape' })
    if (dismiss === 'backdrop') await dialog.element.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    if (dismiss === 'close') await dialog.get('button[aria-label="关闭"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false)
    pending.resolve(created); await flushPromises()
    expect(option(wrapper).exists()).toBe(true)
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain(created.name)
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain('未应用')
    unchanged(context)
    await wrapper.get('[data-testid="connection-select"]').setValue(created.id); await flushPromises()
    expect(context.a.data.config).toMatchObject({ connectionId: created.id, provider: created.provider, checkpoint: 'keep-a', sampler: 'legacy-a' })
    expect(context.store.historyPast).toHaveLength(context.history + 1)
    expect(mocks.createNodeConnection).toHaveBeenCalledTimes(1)
  })

  it('取消后尝试重开和快速重挂载仍不能重复提交未决保存', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); const { wrapper, ui, a, b } = context; await startSave(wrapper)
    await wrapper.get('[data-testid="save-connection"]').trigger('click')
    await wrapper.get('[data-testid="cancel-connection"]').trigger('click')
    expect(wrapper.get('[data-testid="add-connection"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="add-connection"]').trigger('click')
    expect(wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false)
    ui.setSelectedNode(b.id); await flushPromises()
    expect(wrapper.get('[data-testid="add-connection"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="edit-connection"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain(created.name)
    ui.setSelectedNode(a.id); await flushPromises()
    expect(wrapper.get('[data-testid="add-connection"]').attributes('disabled')).toBeDefined()
    pending.resolve(created); await flushPromises()
    expect(option(wrapper).exists()).toBe(true); unchanged(context)
    expect(mocks.createNodeConnection).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="add-connection"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="add-connection"]').trigger('click')
    expect((wrapper.get('[data-testid="connection-url"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('[data-testid="save-connection"]').attributes('disabled')).toBeDefined()
  })

  it('实际 keyed 切换卸载后保存完成，旧目录迟到不能抹掉结果或应用到 B', async () => {
    const pending = deferred<NodeConnection>(); const staleList = deferred<{ connections: NodeConnection[] }>()
    mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); const { wrapper, ui, b, store } = context; await startSave(wrapper)
    const previous = wrapper.getComponent(NodeConnectionSelector)
    mocks.getNodeConnections.mockReturnValueOnce(staleList.promise)
    ui.setSelectedNode(b.id); await flushPromises()
    expect(wrapper.getComponent(NodeConnectionSelector).vm).not.toBe(previous.vm)
    pending.resolve(created); await flushPromises()
    expect(option(wrapper).exists()).toBe(true)
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain(created.name)
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain('未应用')
    staleList.resolve({ connections: [deployment, saved] }); await flushPromises()
    expect(option(wrapper).exists()).toBe(true)
    expect(wrapper.get('[data-testid="connection-select"]').attributes('disabled')).toBeUndefined()
    expect(store.loadNodeTemplates).toHaveBeenCalledTimes(1)
    unchanged(context)
  })

  it('导航卸载期间保存完成，返回检查器可见成功记录和未应用反馈', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); await startSave(context.wrapper)
    context.wrapper.unmount()
    pending.resolve(created); await flushPromises()
    mocks.getNodeConnections.mockResolvedValue({ connections: [deployment, saved, created] })
    const wrapper = mount(NodeInspector, { global: { plugins: [context.pinia, i18n], stubs: { Teleport: true } } })
    wrappers.push(wrapper); await flushPromises()
    expect(option(wrapper).exists()).toBe(true)
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain('未应用')
    unchanged(context)
  })

  it('离开后在请求未决时返回仍保留写锁，取消不会被误认为撤回保存', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); await startSave(context.wrapper)
    expect(context.wrapper.get('[data-testid="cancel-connection"]').text()).toBe('关闭（保存继续）')
    context.wrapper.unmount()
    const wrapper = mount(NodeInspector, { global: { plugins: [context.pinia, i18n], stubs: { Teleport: true } } })
    wrappers.push(wrapper); await flushPromises()
    expect(wrapper.get('[data-testid="add-connection"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain('保存请求仍会继续')
    pending.resolve(created); await flushPromises()
    expect(option(wrapper).exists()).toBe(true)
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain('未应用')
    unchanged(context)
  })

  it('编辑保存后关闭仍更新共享连接并刷新同 ID 目录，不增加节点配置历史', async () => {
    const pending = deferred<NodeConnection>(); const oldProbe = deferred<NodeConnectionProbe>(); const newProbe = deferred<NodeConnectionProbe>()
    mocks.updateNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); const { wrapper, ui, b } = context
    mocks.probeSavedNodeConnection.mockReturnValueOnce(oldProbe.promise).mockReturnValueOnce(newProbe.promise)
    ui.setSelectedNode(b.id); await flushPromises()
    await wrapper.get('[data-testid="edit-connection"]').trigger('click')
    await wrapper.get('[data-testid="connection-url"]').setValue(created.baseUrl)
    await wrapper.get('[data-testid="test-connection"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-testid="save-connection"]').trigger('click')
    await wrapper.get('[data-testid="cancel-connection"]').trigger('click')
    pending.resolve({ ...saved, baseUrl: created.baseUrl }); await flushPromises()
    newProbe.resolve({ ...usable, message: '更新地址后的探测' }); await flushPromises()
    oldProbe.resolve({ ...usable, message: '过期地址探测' }); await flushPromises()
    expect(wrapper.get('[data-testid="selected-status"]').text()).toContain('更新地址后的探测')
    expect(wrapper.text()).not.toContain('过期地址探测')
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).toContain('已引用此连接的节点会使用更新后的地址')
    expect(wrapper.get('[data-testid="connection-save-status"]').text()).not.toContain('未应用')
    unchanged(context)
    await wrapper.get('[data-testid="edit-connection"]').trigger('click')
    expect((wrapper.get('[data-testid="connection-url"]').element as HTMLInputElement).value).toBe(created.baseUrl)
    expect(mocks.updateNodeConnection).toHaveBeenCalledTimes(1)
    expect(mocks.createNodeConnection).not.toHaveBeenCalled()
  })

  it('正常成功原子应用一次，完整保留旧模型参数并可撤销', async () => {
    const context = await render(); await startSave(context.wrapper); await flushPromises()
    expect(context.a.data.config).toMatchObject({ connectionId: created.id, provider: created.provider, checkpoint: 'keep-a', sampler: 'legacy-a' })
    expect(context.store.historyPast).toHaveLength(context.history + 1)
    expect(context.wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false)
    expect(mocks.createNodeConnection).toHaveBeenCalledTimes(1)
    context.store.undo(); unchanged(context)
  })

  it('保存失败保留当前草稿和节点配置，解除未决锁后允许显式重试', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); const { wrapper } = context; await startSave(wrapper)
    pending.reject(new Error('服务拒绝保存')); await flushPromises()
    expect(wrapper.get('[data-testid="form-error"]').text()).toContain('服务拒绝保存')
    expect((wrapper.get('[data-testid="connection-name"]').element as HTMLInputElement).value).toBe(created.name)
    expect((wrapper.get('[data-testid="connection-url"]').element as HTMLInputElement).value).toBe(created.baseUrl)
    expect(wrapper.get('[data-testid="save-connection"]').attributes('disabled')).toBeUndefined()
    expect(option(wrapper).exists()).toBe(false); unchanged(context)
    await wrapper.get('[data-testid="save-connection"]').trigger('click'); await flushPromises()
    expect(mocks.createNodeConnection).toHaveBeenCalledTimes(2)
    expect(context.a.data.config.connectionId).toBe(created.id)
  })

  it('取消并切节点后失败仍反馈原连接错误，不污染新节点且可再创建', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const context = await render(); await startSave(context.wrapper)
    await context.wrapper.get('[data-testid="cancel-connection"]').trigger('click')
    context.ui.setSelectedNode(context.b.id); await flushPromises()
    pending.reject(new Error('服务拒绝保存')); await flushPromises()
    expect(context.wrapper.get('[data-testid="connection-save-status"]').text()).toContain(created.name)
    expect(context.wrapper.get('[data-testid="connection-save-status"]').text()).toContain('服务拒绝保存')
    expect(context.wrapper.get('[data-testid="add-connection"]').attributes('disabled')).toBeUndefined()
    expect(option(context.wrapper).exists()).toBe(false); unchanged(context)
  })
})
