// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import LoopBodyEditor from './LoopBodyEditor.vue'

const mocks = vi.hoisted(() => ({
  getNodeConnections: vi.fn(), probeSavedNodeConnection: vi.fn(),
  createNodeConnection: vi.fn(), updateNodeConnection: vi.fn(), probeNodeConnection: vi.fn(),
}))
vi.mock('@/api/modules/nodeConnections', () => mocks)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

const a: NodeConnection = { id: 'studio-a', name: 'Studio A', provider: 'COMFYUI', baseUrl: 'http://studio-a.test:8188', readOnly: false }
const b: NodeConnection = { id: 'studio-b', name: 'Studio B', provider: 'STABLE_DIFFUSION_WEBUI', baseUrl: 'http://studio-b.test:7860', readOnly: false }
const nodes = [
  { nodeId: 'step-a', nodeType: 'IMAGE_GENERATION', displayName: 'Generate', config: { provider: a.provider, connectionId: a.id, checkpoint: 'portrait.safetensors' } },
  { nodeId: 'step-b', nodeType: 'UPSCALE', displayName: 'Upscale', config: { provider: b.provider, connectionId: b.id } },
]
const response = { connections: [a, b] }

function probe(id: string): NodeConnectionProbe {
  return {
    status: 'usable', message: `诊断 ${id}`, detectedFrom: 'backend', capabilities: [],
    models: {
      checkpoints: id === a.id ? ['portrait.safetensors'] : [],
      upscalers: id === b.id ? ['4x-UltraSharp'] : [],
      vaes: [], loras: [], samplers: [], schedulers: [],
    },
  }
}

const wrappers: Array<{ unmount: () => void }> = []
function render(modelValue = nodes) {
  const wrapper = mount(LoopBodyEditor, { props: { modelValue, catalog: [] }, global: { plugins: [i18n, createPinia()] } })
  wrappers.push(wrapper)
  return wrapper
}
const byStep = (id: string) => `[data-body-id="step-${id}"]`
const selectedStatus = '[data-testid="selected-status"]'
const refresh = '[data-testid="refresh-connection"]'
const cancel = '[data-testid="cancel-current-test"]'

describe('同一循环体的图像步骤共享连接目录，诊断各自独立', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN'
    vi.resetAllMocks()
    mocks.getNodeConnections.mockResolvedValue(response)
    mocks.probeSavedNodeConnection.mockImplementation(async (id: string) => probe(id))
  })
  afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

  it('打开两个步骤时，每个面板都会得到自己的状态和模型选项', async () => {
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find(byStep('a')).find(selectedStatus).text()).toContain(a.id)
    expect(wrapper.find(byStep('b')).find(selectedStatus).text()).toContain(b.id)
    expect(wrapper.find(byStep('a')).find('[data-testid="model-checkpoint"]').text()).not.toContain('(?)')
    expect(wrapper.find(byStep('b')).find('[data-testid="model-upscaler"]').text()).toContain('4x-UltraSharp')
    expect(mocks.getNodeConnections).toHaveBeenCalledTimes(1)
    expect(mocks.probeSavedNodeConnection.mock.calls).toEqual([
      [a.id, 'IMAGE_GENERATION', 'portrait.safetensors'], [b.id, 'UPSCALE', undefined],
    ])
  })

  it('初次读失败后，从任一个面板重试会启动仍等待读取的两个诊断', async () => {
    const firstRead = deferred<typeof response>()
    mocks.getNodeConnections.mockReturnValue(firstRead.promise)
    const wrapper = render()
    firstRead.reject(new Error('目录暂时不可用'))
    await flushPromises()
    expect(wrapper.find(byStep('a')).text()).toContain('目录暂时不可用')
    expect(wrapper.find(byStep('b')).text()).toContain('目录暂时不可用')
    expect(mocks.probeSavedNodeConnection).not.toHaveBeenCalled()

    mocks.getNodeConnections.mockResolvedValue(response)
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    await flushPromises()

    expect(wrapper.find(byStep('a')).find(selectedStatus).text()).toContain(a.id)
    expect(wrapper.find(byStep('b')).find(selectedStatus).text()).toContain(b.id)
    expect(wrapper.text()).not.toContain('目录暂时不可用')
    expect(mocks.getNodeConnections).toHaveBeenCalledTimes(2)
  })

  it('共享读在途时切换节点配置，仅诊断最终选择', async () => {
    const firstRead = deferred<typeof response>()
    mocks.getNodeConnections.mockReturnValue(firstRead.promise)
    const wrapper = render()
    await wrapper.setProps({ modelValue: [
      { ...nodes[0], config: { ...nodes[0]!.config, connectionId: b.id, provider: b.provider, checkpoint: 'second.safetensors' } },
      nodes[1],
    ] })
    firstRead.resolve(response)
    await flushPromises()

    expect(wrapper.find(byStep('a')).find(selectedStatus).text()).toContain(b.id)
    expect(wrapper.find(byStep('b')).find(selectedStatus).text()).toContain(b.id)
    expect(mocks.getNodeConnections).toHaveBeenCalledTimes(1)
    expect(mocks.probeSavedNodeConnection.mock.calls).toEqual([
      [b.id, 'IMAGE_GENERATION', 'second.safetensors'], [b.id, 'UPSCALE', undefined],
    ])
  })

  it('重读某一步不重开同级中已取消的诊断，迟到的探测结果也不会复活它', async () => {
    const delayedProbe = deferred<NodeConnectionProbe>()
    mocks.probeSavedNodeConnection.mockImplementation((id: string) => id === a.id ? delayedProbe.promise : Promise.resolve(probe(id)))
    const wrapper = render()
    await flushPromises()

    await wrapper.find(byStep('a')).get(cancel).trigger('click')
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    await flushPromises()
    delayedProbe.resolve(probe(a.id))
    await flushPromises()

    expect(wrapper.find(byStep('a')).find(selectedStatus).exists()).toBe(false)
    expect(wrapper.find(byStep('a')).text()).toContain('本次测试已取消')
    expect(wrapper.find(byStep('b')).find(selectedStatus).text()).toContain(b.id)
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id)).toEqual([a.id, b.id, b.id])
  })

  it('独立刷新自己的面板而不重测已有结果的同级步骤', async () => {
    const wrapper = render()
    await flushPromises()
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    await flushPromises()
    expect(wrapper.find(byStep('a')).find(selectedStatus).text()).toContain(a.id)
    expect(wrapper.find(byStep('b')).find(selectedStatus).text()).toContain(b.id)
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id)).toEqual([a.id, b.id, b.id])
  })

  it('与目录响应同一轮渲染加入的新步骤也得到自身诊断', async () => {
    const firstRead = deferred<typeof response>()
    mocks.getNodeConnections.mockReturnValue(firstRead.promise)
    const wrapper = render([nodes[0]!])

    firstRead.resolve(response)
    await Promise.resolve()
    await wrapper.setProps({ modelValue: nodes })
    await flushPromises()

    expect(wrapper.find(byStep('a')).find(selectedStatus).text()).toContain(a.id)
    expect(wrapper.find(byStep('b')).find(selectedStatus).text()).toContain(b.id)
    expect(mocks.getNodeConnections).toHaveBeenCalledTimes(1)
    // 已就绪的新面板可以先得到结果；只要求每一步各有一次自己的读。
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id).sort()).toEqual([a.id, b.id])
  })

  it('删除仍在等待读取的步骤不触发该步骤的诊断', async () => {
    const firstRead = deferred<typeof response>()
    mocks.getNodeConnections.mockReturnValue(firstRead.promise)
    const wrapper = render()
    await wrapper.setProps({ modelValue: [nodes[1]!] })
    firstRead.resolve(response)
    await flushPromises()

    expect(wrapper.find(byStep('a')).exists()).toBe(false)
    expect(wrapper.find(byStep('b')).find(selectedStatus).text()).toContain(b.id)
    expect(mocks.probeSavedNodeConnection.mock.calls).toEqual([[b.id, 'UPSCALE', undefined]])
  })
})
