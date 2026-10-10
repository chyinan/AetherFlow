// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getNodeConnections: vi.fn(), createNodeConnection: vi.fn(), updateNodeConnection: vi.fn(), probeNodeConnection: vi.fn(), probeSavedNodeConnection: vi.fn() }))
vi.mock('@/api/modules/nodeConnections', () => mocks)
import { i18n } from '@/i18n'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import NodeConnectionSelector from './NodeConnectionSelector.vue'
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}
const saved: NodeConnection = { id: 'saved-comfy', name: 'Studio', provider: 'COMFYUI', baseUrl: 'http://image-service:8188', readOnly: false }
const sd: NodeConnection = { id: 'saved-sd', name: 'WebUI', provider: 'STABLE_DIFFUSION_WEBUI', baseUrl: 'http://sd-service:7860', readOnly: false }
const deployment: NodeConnection = { ...saved, id: 'deployment-comfyui', name: 'Deployment', readOnly: true }
function probe(overrides: Partial<NodeConnectionProbe> = {}): NodeConnectionProbe {
  return { status: 'usable', message: 'Backend service options discovered', detectedFrom: 'backend', models: { checkpoints: ['real.safetensors'], vaes: ['real-vae'], loras: ['real-lora'], samplers: ['euler'], schedulers: ['normal'], upscalers: ['bilinear'] }, capabilities: ['IMAGE_GENERATION', 'UPSCALE'], ...overrides }
}
const wrappers: VueWrapper[] = []
function render(config: Record<string, unknown> = { provider: 'COMFYUI' }, nodeType: 'IMAGE_GENERATION' | 'UPSCALE' = 'IMAGE_GENERATION') {
  const wrapper = mount(NodeConnectionSelector, { attachTo: document.body, props: { nodeId: 'node-a', nodeType, config }, global: { plugins: [i18n], stubs: { Teleport: true } } })
  wrappers.push(wrapper); return wrapper
}
async function openForm(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="add-connection"]').trigger('click')
  await wrapper.get('[data-testid="connection-name"]').setValue('New connection')
  await wrapper.get('[data-testid="connection-url"]').setValue('http://new-service:8188')
}
async function testForm(wrapper: VueWrapper) { await wrapper.get('[data-testid="test-connection"]').trigger('click'); await flushPromises() }

describe('节点连接向导', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getNodeConnections.mockResolvedValue({ connections: [deployment, saved, sd] })
    mocks.probeSavedNodeConnection.mockResolvedValue(probe()); mocks.probeNodeConnection.mockResolvedValue(probe())
    mocks.createNodeConnection.mockResolvedValue({ ...saved, id: 'new-profile' }); mocks.updateNodeConnection.mockResolvedValue(saved)
  })
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()) })
  it('打开、测试、取消不保存或修改节点；重开清空状态', async () => {
    const wrapper = render({}); await flushPromises()
    expect(mocks.probeSavedNodeConnection).toHaveBeenCalledWith('deployment-sd', 'IMAGE_GENERATION', undefined)
    await openForm(wrapper); await testForm(wrapper)
    expect(mocks.probeNodeConnection).toHaveBeenCalledWith({ provider: 'STABLE_DIFFUSION_WEBUI', baseUrl: 'http://new-service:8188', nodeType: 'IMAGE_GENERATION' })
    await wrapper.get('[data-testid="cancel-connection"]').trigger('click')
    expect(mocks.createNodeConnection).not.toHaveBeenCalled(); expect(mocks.updateNodeConnection).not.toHaveBeenCalled()
    expect(wrapper.emitted('apply')).toBeUndefined(); expect(wrapper.emitted('updateConfig')).toBeUndefined()
    await wrapper.get('[data-testid="add-connection"]').trigger('click')
    expect((wrapper.get('[data-testid="connection-url"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-testid="form-status"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="save-connection"]').attributes('disabled')).toBeDefined()
  })
  it('保存成功才同时应用 ID 与 Provider', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValue(pending.promise)
    const wrapper = render(); await flushPromises(); await openForm(wrapper); await testForm(wrapper)
    await wrapper.get('[data-testid="save-connection"]').trigger('click'); expect(wrapper.emitted('apply')).toBeUndefined()
    pending.resolve({ ...sd, id: 'new-profile' }); await flushPromises()
    expect(wrapper.emitted('apply')).toEqual([[{ connectionId: 'new-profile', provider: 'STABLE_DIFFUSION_WEBUI' }, 'node-a']])
    expect(wrapper.emitted('saved')).toHaveLength(1); expect(wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false)
  })
  it('URL 或 Provider 改动清除测试结果并拒绝迟到响应', async () => {
    const pending = deferred<NodeConnectionProbe>(); mocks.probeNodeConnection.mockReturnValueOnce(pending.promise)
    const wrapper = render(); await flushPromises(); await openForm(wrapper)
    await wrapper.get('[data-testid="test-connection"]').trigger('click')
    await wrapper.get('[data-testid="connection-url"]').setValue('http://changed-service:8188')
    pending.resolve(probe({ message: 'stale URL response' })); await flushPromises()
    expect(wrapper.find('[data-testid="form-status"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="save-connection"]').attributes('disabled')).toBeDefined()
    await testForm(wrapper); expect(wrapper.find('[data-testid="form-status"]').exists()).toBe(true)
    await wrapper.get('[data-testid="connection-provider"]').setValue('STABLE_DIFFUSION_WEBUI')
    expect(wrapper.find('[data-testid="form-status"]').exists()).toBe(false)
  })
  it('取消重开后旧测试不能覆盖新测试', async () => {
    const first = deferred<NodeConnectionProbe>(); const second = deferred<NodeConnectionProbe>()
    mocks.probeNodeConnection.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const wrapper = render(); await flushPromises(); await openForm(wrapper)
    await wrapper.get('[data-testid="test-connection"]').trigger('click'); await wrapper.get('[data-testid="cancel-connection"]').trigger('click')
    await openForm(wrapper); await wrapper.get('[data-testid="test-connection"]').trigger('click')
    second.resolve(probe({ message: 'current response' })); await flushPromises()
    first.resolve(probe({ status: 'unreachable', message: 'stale response' })); await flushPromises()
    expect(wrapper.get('[data-testid="form-status"]').text()).toContain('current response'); expect(wrapper.text()).not.toContain('stale response')
  })
  it('切换节点关闭并清空向导，不接受旧测试', async () => {
    const pending = deferred<NodeConnectionProbe>(); mocks.probeNodeConnection.mockReturnValueOnce(pending.promise)
    const wrapper = render(); await flushPromises(); await openForm(wrapper); await wrapper.get('[data-testid="test-connection"]').trigger('click')
    await wrapper.setProps({ nodeId: 'node-b', config: { provider: sd.provider, connectionId: sd.id } })
    expect(wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false)
    pending.resolve(probe({ message: 'old node response' })); await flushPromises()
    await wrapper.get('[data-testid="add-connection"]').trigger('click')
    expect(wrapper.find('[data-testid="form-status"]').exists()).toBe(false); expect(wrapper.emitted('apply')).toBeUndefined()
  })
  it('保存中切换节点或导航卸载不会将结果应用给新节点', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const wrapper = render(); await flushPromises(); await openForm(wrapper); await testForm(wrapper)
    await wrapper.get('[data-testid="save-connection"]').trigger('click'); await wrapper.setProps({ nodeId: 'node-b' })
    pending.resolve({ ...saved, id: 'saved-for-a' }); await flushPromises(); expect(wrapper.emitted('apply')).toBeUndefined()
    const navigation = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(navigation.promise)
    await openForm(wrapper); await testForm(wrapper); await wrapper.get('[data-testid="save-connection"]').trigger('click')
    wrapper.unmount(); navigation.resolve({ ...saved, id: 'after-navigation' }); await flushPromises(); expect(wrapper.emitted('apply')).toBeUndefined()
  })
  it('编辑失败保留旧 profile 和模型值', async () => {
    mocks.updateNodeConnection.mockRejectedValue(new Error('Backend rejected unreachable URL'))
    const config = { provider: 'COMFYUI', connectionId: saved.id, checkpoint: 'old.safetensors' }
    const wrapper = render(config); await flushPromises(); await wrapper.get('[data-testid="edit-connection"]').trigger('click')
    await wrapper.get('[data-testid="connection-url"]').setValue('http://changed-service:8188'); await testForm(wrapper)
    await wrapper.get('[data-testid="save-connection"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-testid="form-error"]').text()).toContain('Backend rejected'); expect(wrapper.emitted('apply')).toBeUndefined()
    expect(config.connectionId).toBe(saved.id); expect(config.checkpoint).toBe('old.safetensors')
    await wrapper.get('[data-testid="cancel-connection"]').trigger('click'); await wrapper.get('[data-testid="edit-connection"]').trigger('click')
    expect((wrapper.get('[data-testid="connection-url"]').element as HTMLInputElement).value).toBe(saved.baseUrl)
  })
  it.each(['http://name:secret@service:8188', 'https://service.test?token=secret', 'https://service.test/#secret', 'file:///tmp/service'])('拒绝有凭据或不支持的 URL %s', async (url) => {
    const wrapper = render(); await flushPromises(); await openForm(wrapper); await wrapper.get('[data-testid="connection-url"]').setValue(url); await testForm(wrapper)
    expect(mocks.probeNodeConnection).not.toHaveBeenCalled(); expect(wrapper.find('[data-testid="form-error"]').exists()).toBe(true)
  })
  it('缺失的显式 profile 不回退部署默认', async () => {
    const wrapper = render({ provider: 'COMFYUI', connectionId: 'deleted-profile' }); await flushPromises()
    expect(wrapper.find('[data-testid="missing-connection"]').exists()).toBe(true); expect(mocks.probeSavedNodeConnection).not.toHaveBeenCalled()
    expect(wrapper.emitted('apply')).toBeUndefined()
  })
  it('选择保存连接同步 Provider，返回默认清除 connectionId', async () => {
    const wrapper = render(); await flushPromises(); await wrapper.get('[data-testid="connection-select"]').setValue(sd.id)
    expect(wrapper.emitted('apply')?.[0]).toEqual([{ connectionId: sd.id, provider: sd.provider }, 'node-a'])
    await wrapper.setProps({ config: { connectionId: sd.id, provider: sd.provider } }); await flushPromises()
    await wrapper.get('[data-testid="connection-select"]').setValue('')
    expect(wrapper.emitted('apply')?.[1]).toEqual([{ connectionId: undefined, provider: sd.provider }, 'node-a'])
  })
  it('只展示当前服务目录并可见保留不支持旧值，不静默替换', async () => {
    const wrapper = render({ provider: 'COMFYUI', connectionId: saved.id, checkpoint: 'old.safetensors', sampler: 'legacy sampler' }); await flushPromises()
    expect(wrapper.get('[data-testid="model-checkpoint"]').findAll('option').map((option) => option.attributes('value'))).toEqual(['', 'old.safetensors', 'real.safetensors'])
    expect(wrapper.get('[data-testid="unsupported-checkpoint"]').text()).toContain('old.safetensors')
    expect(wrapper.get('[data-testid="unsupported-sampler"]').text()).toContain('legacy sampler'); expect(wrapper.emitted('updateConfig')).toBeUndefined()
    await wrapper.get('[data-testid="model-checkpoint"]').setValue('real.safetensors'); expect(wrapper.emitted('updateConfig')).toEqual([['checkpoint', 'real.safetensors']])
  })
  it('Comfy Checkpoint 显式必填，但不自动选第一个', async () => {
    const wrapper = render({ provider: 'COMFYUI', connectionId: saved.id }); await flushPromises()
    expect(wrapper.find('[data-testid="checkpoint-required"]').exists()).toBe(true)
    expect((wrapper.get('[data-testid="model-checkpoint"]').element as HTMLSelectElement).value).toBe(''); expect(wrapper.emitted('updateConfig')).toBeUndefined()
  })
  it('目录未知不是空目录，并显示后端 warning', async () => {
    mocks.probeSavedNodeConnection.mockResolvedValue(probe({ unavailableCatalogs: ['vaes'], warnings: ['VAE discovery not supported'], models: { ...probe().models, vaes: [], loras: [] } }))
    const wrapper = render(); await flushPromises(); const label = wrapper.get('[data-testid="model-vae"]').element.parentElement!
    expect(label.textContent).toContain('目录未知'); expect(label.textContent).not.toContain('服务返回的目录为空')
    expect(wrapper.text()).toContain('服务返回的目录为空'); expect(wrapper.text()).toContain('VAE discovery not supported')
  })
  it('新连接的目录不被上一连接的迟到响应覆盖', async () => {
    const first = deferred<NodeConnectionProbe>(); const second = deferred<NodeConnectionProbe>()
    mocks.probeSavedNodeConnection.mockImplementation((id: string) => id === saved.id ? first.promise : second.promise)
    const wrapper = render({ provider: 'COMFYUI', connectionId: saved.id }); await flushPromises()
    await wrapper.setProps({ config: { provider: sd.provider, connectionId: sd.id } })
    second.resolve(probe({ message: 'new catalog', models: { ...probe().models, checkpoints: ['sd-model'] } })); await flushPromises()
    first.resolve(probe({ message: 'old catalog', models: { ...probe().models, checkpoints: ['old-model'] } })); await flushPromises()
    expect(wrapper.get('[data-testid="selected-status"]').text()).toContain('new catalog')
    expect(wrapper.get('[data-testid="model-checkpoint"]').text()).toContain('sd-model'); expect(wrapper.text()).not.toContain('old-model')
  })
  it('只读部署项无编辑入口，放大列出服务算法', async () => {
    const wrapper = render({ provider: 'COMFYUI' }, 'UPSCALE'); await flushPromises()
    expect(wrapper.find('[data-testid="edit-connection"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="model-upscaler"]').text()).toContain('bilinear'); expect(wrapper.find('[data-testid="model-checkpoint"]').exists()).toBe(false)
  })
  it('同 ID 编辑保存后重读服务目录，旧地址响应不能覆盖新地址', async () => {
    const oldProbe = deferred<NodeConnectionProbe>(); const newProbe = deferred<NodeConnectionProbe>()
    mocks.probeSavedNodeConnection.mockReturnValueOnce(oldProbe.promise).mockReturnValueOnce(newProbe.promise)
    mocks.updateNodeConnection.mockResolvedValue({ ...saved, baseUrl: 'http://new-host:8188' })
    const wrapper = render({ provider: 'COMFYUI', connectionId: saved.id }); await flushPromises()
    await wrapper.get('[data-testid="edit-connection"]').trigger('click')
    await wrapper.get('[data-testid="connection-url"]').setValue('http://new-host:8188'); await testForm(wrapper)
    await wrapper.get('[data-testid="save-connection"]').trigger('click'); await flushPromises()
    expect(mocks.probeSavedNodeConnection).toHaveBeenCalledTimes(2)
    newProbe.resolve(probe({ message: 'new endpoint', models: { ...probe().models, checkpoints: ['new-host-model'] } })); await flushPromises()
    oldProbe.resolve(probe({ message: 'old endpoint', models: { ...probe().models, checkpoints: ['old-host-model'] } })); await flushPromises()
    expect(wrapper.get('[data-testid="selected-status"]').text()).toContain('new endpoint')
    expect(wrapper.get('[data-testid="model-checkpoint"]').text()).toContain('new-host-model')
    expect(wrapper.text()).not.toContain('old-host-model')
  })
  it('没有 ID 的旧节点只读保留模型参数；显式选部署连接才可编辑', async () => {
    const wrapper = render({ provider: 'COMFYUI', sampler: 'legacy' }); await flushPromises()
    expect(wrapper.get('[data-testid="model-sampler"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="legacy-model-hint"]').exists()).toBe(true)
    expect(wrapper.emitted('updateConfig')).toBeUndefined()
    await wrapper.get('[data-testid="connection-select"]').setValue(deployment.id)
    expect(wrapper.emitted('apply')?.[0]).toEqual([{ connectionId: deployment.id, provider: 'COMFYUI' }, 'node-a'])
    await wrapper.setProps({ config: { provider: 'COMFYUI', connectionId: deployment.id, sampler: 'legacy' } }); await flushPromises()
    expect(wrapper.get('[data-testid="model-sampler"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="model-sampler"]').setValue('euler')
    expect(wrapper.emitted('updateConfig')).toEqual([['sampler', 'euler']])
  })

  it('Escape 不冒泡到父页面，关闭后恢复触发按钮焦点', async () => {
    const wrapper = render(); await flushPromises()
    const opener = wrapper.get('[data-testid="add-connection"]')
    ;(opener.element as HTMLButtonElement).focus(); await opener.trigger('click')
    expect(document.activeElement).toBe(wrapper.get('[data-testid="connection-name"]').element)
    const bubbled = vi.fn(); window.addEventListener('keydown', bubbled)
    await wrapper.get('[data-testid="connection-dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="connection-dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element); expect(bubbled).not.toHaveBeenCalled()
    window.removeEventListener('keydown', bubbled)
  })
  it('名称长度与后端 80 字符限制一致，超长时不会测试或保存', async () => {
    const wrapper = render(); await flushPromises(); await openForm(wrapper)
    expect(wrapper.get('[data-testid="connection-name"]').attributes('maxlength')).toBe('80')
    await wrapper.get('[data-testid="connection-name"]').setValue('x'.repeat(81)); await testForm(wrapper)
    expect(wrapper.get('[data-testid="form-error"]').text()).toContain('80')
    expect(mocks.probeNodeConnection).not.toHaveBeenCalled(); expect(mocks.createNodeConnection).not.toHaveBeenCalled()
  })

  it('保存成功使旧的在途列表失效，新 profile 不被迟到列表抹掉', async () => {
    const oldList = deferred<{ connections: NodeConnection[] }>()
    mocks.getNodeConnections.mockReturnValueOnce(oldList.promise)
    const wrapper = render(); await openForm(wrapper); await testForm(wrapper)
    await wrapper.get('[data-testid="save-connection"]').trigger('click'); await flushPromises()
    await wrapper.setProps({ config: { provider: 'COMFYUI', connectionId: 'new-profile' } }); await flushPromises()
    expect(wrapper.get('[data-testid="connection-select"]').attributes('disabled')).toBeUndefined()
    oldList.resolve({ connections: [deployment] }); await flushPromises()
    expect(wrapper.find('[data-testid="missing-connection"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="connection-select"]').find('option[value="new-profile"]').text()).toContain('Studio')
  })
  it('旧节点空 Provider 按既有序列化规则：图像为 SD、放大为 Comfy', async () => {
    const image = render({}); const upscale = render({}, 'UPSCALE'); await flushPromises()
    expect((image.get('[data-testid="default-provider"]').element as HTMLSelectElement).value).toBe('STABLE_DIFFUSION_WEBUI')
    expect((upscale.get('[data-testid="default-provider"]').element as HTMLSelectElement).value).toBe('COMFYUI')
    expect(image.emitted('apply')).toBeUndefined(); expect(upscale.emitted('apply')).toBeUndefined()
  })

})
