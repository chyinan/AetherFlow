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
function render(modelValue = nodes, attachTo?: HTMLElement) {
  const wrapper = mount(LoopBodyEditor, { attachTo, props: { modelValue, catalog: [] }, global: { plugins: [i18n, createPinia()] } })
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

  it('另一面板读到同一连接的新地址时，立即收起旧模型并按新地址重新诊断', async () => {
    const nextProbe = deferred<NodeConnectionProbe>()
    const wrapper = render()
    await flushPromises()
    const stepA = wrapper.find(byStep('a'))
    const stepB = wrapper.find(byStep('b'))
    const newAddress = 'http://studio-a-migrated.test:8188'
    mocks.getNodeConnections.mockResolvedValue({ connections: [{ ...a, baseUrl: newAddress }, b] })
    mocks.probeSavedNodeConnection.mockImplementation((id: string) => id === a.id ? nextProbe.promise : Promise.resolve(probe(id)))

    await stepB.get(refresh).trigger('click')
    await flushPromises()

    expect(stepA.text()).toContain(newAddress)
    expect(stepA.find(selectedStatus).exists()).toBe(false)
    expect(stepA.get('[data-testid="model-checkpoint"]').text()).toContain('portrait.safetensors (?)')
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id)).toEqual([a.id, b.id, a.id, b.id])

    nextProbe.resolve({ ...probe(a.id), message: '新地址的诊断', models: { ...probe(a.id).models, checkpoints: ['new.safetensors'] } })
    await flushPromises()
    expect(stepA.get(selectedStatus).text()).toContain('新地址的诊断')
    expect(stepA.get('[data-testid="model-checkpoint"]').text()).toContain('new.safetensors')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('失效地址在途的结果不能覆盖新地址的诊断', async () => {
    const oldResponse = deferred<NodeConnectionProbe>()
    const newResponse = deferred<NodeConnectionProbe>()
    let currentEndpoint = oldResponse
    mocks.probeSavedNodeConnection.mockImplementation((id: string) => id === a.id ? currentEndpoint.promise : Promise.resolve(probe(id)))
    const wrapper = render()
    await flushPromises()
    currentEndpoint = newResponse
    mocks.getNodeConnections.mockResolvedValue({ connections: [{ ...a, baseUrl: 'http://studio-a-backup.test:8188' }, b] })
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    await flushPromises()
    const stepA = wrapper.find(byStep('a'))
    newResponse.resolve({ ...probe(a.id), message: '备用地址可用' })
    await flushPromises()

    oldResponse.resolve({ ...probe(a.id), status: 'unreachable', message: '原地址不可达' })
    await flushPromises()
    expect(stepA.get(selectedStatus).text()).toContain('备用地址可用')
    expect(stepA.text()).not.toContain('原地址不可达')
  })

  it('服务端只重命名同级连接时，保留诊断而不重新发送探测', async () => {
    const wrapper = render()
    await flushPromises()
    mocks.getNodeConnections.mockResolvedValue({ connections: [{ ...a, name: 'Studio A (renamed)' }, b] })
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    await flushPromises()

    const stepA = wrapper.find(byStep('a'))
    expect(stepA.get('[data-testid="connection-select"]').text()).toContain('Studio A (renamed)')
    expect(stepA.get(selectedStatus).text()).toContain(a.id)
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id)).toEqual([a.id, b.id, b.id])
  })

  it.each([
    { label: '只改名', changeAddress: false, cancelled: false, refreshPeer: false },
    { label: '已取消的步骤', changeAddress: true, cancelled: true, refreshPeer: false },
    { label: '仍显示旧地址诊断的步骤', changeAddress: true, cancelled: false, refreshPeer: true },
    { label: '目录暂不可用时的换址', changeAddress: true, cancelled: false, refreshPeer: false, catalogUnavailable: true },
  ])('同级步骤保存共享连接：$label', async ({ changeAddress, cancelled, refreshPeer, catalogUnavailable }) => {
    const oldPeerProbe = deferred<NodeConnectionProbe>()
    if (cancelled) mocks.probeSavedNodeConnection.mockReturnValueOnce(oldPeerProbe.promise)
    const shared = [nodes[0]!, { ...nodes[1]!, config: { provider: a.provider, connectionId: a.id } }]
    const wrapper = render(shared, document.body)
    await flushPromises()
    const stepA = wrapper.find(byStep('a'))
    const stepB = wrapper.find(byStep('b'))
    if (cancelled) await stepA.get(cancel).trigger('click')
    else expect(stepA.get(selectedStatus).text()).toContain(a.id)
    if (catalogUnavailable) {
      mocks.getNodeConnections.mockRejectedValueOnce(new Error('目录暂时不可用'))
      await stepB.get(refresh).trigger('click')
      await flushPromises()
      expect(stepA.text()).toContain('目录暂时不可用')
      expect(stepA.get(selectedStatus).text()).toContain(a.id)
    }

    const edited = { ...a, name: 'Shared studio renamed', ...(changeAddress ? { baseUrl: 'http://studio-new.test:8188' } : {}) }
    const write = deferred<NodeConnection>()
    mocks.probeNodeConnection.mockResolvedValue(probe(a.id))
    mocks.updateNodeConnection.mockReturnValueOnce(write.promise)
    await stepB.get('[data-testid="edit-connection"]').trigger('click')
    const dialog = document.querySelector('[data-testid="connection-dialog"]')!
    const setField = (selector: string, value: string) => {
      const input = dialog.querySelector<HTMLInputElement>(selector)!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    setField('[data-testid="connection-name"]', edited.name)
    if (changeAddress) setField('[data-testid="connection-url"]', edited.baseUrl)
    dialog.querySelector<HTMLButtonElement>('[data-testid="test-connection"]')!.click()
    await flushPromises()
    dialog.querySelector<HTMLButtonElement>('[data-testid="save-connection"]')!.click()
    await flushPromises()
    expect(mocks.updateNodeConnection).toHaveBeenCalledExactlyOnceWith(a.id, {
      name: edited.name, provider: edited.provider, baseUrl: edited.baseUrl,
    })
    const peerCalls = () => mocks.probeSavedNodeConnection.mock.calls.filter(([, nodeType]) => nodeType === 'IMAGE_GENERATION')
    expect(peerCalls()).toHaveLength(1)
    mocks.probeSavedNodeConnection.mockImplementation(async (id: string) => ({ ...probe(id), message: '保存后重新诊断' }))
    write.resolve(edited)
    if (cancelled) oldPeerProbe.resolve({ ...probe(a.id), message: '已取消的迟到结果' })
    await flushPromises()

    expect(stepA.get('[data-testid="connection-select"]').text()).toContain(edited.name)
    expect(peerCalls()).toHaveLength(refreshPeer ? 2 : 1)
    if (cancelled || catalogUnavailable) {
      if (cancelled) expect(stepA.text()).toContain('本次测试已取消')
      expect(stepA.find(selectedStatus).exists()).toBe(false)
      mocks.getNodeConnections.mockResolvedValueOnce({ connections: [edited, b] })
      await stepA.get(refresh).trigger('click')
      await flushPromises()
      expect(peerCalls()).toHaveLength(2)
    }
    expect(stepA.get(selectedStatus).text()).toContain(changeAddress ? '保存后重新诊断' : a.id)
  })

  it('刷新发现同级连接不存在时丢弃旧请求，把焦点还给当前重测按钮', async () => {
    const oldProbe = deferred<NodeConnectionProbe>()
    mocks.probeSavedNodeConnection.mockImplementation((id: string) => id === a.id ? oldProbe.promise : Promise.resolve(probe(id)))
    const wrapper = render(nodes, document.body)
    await flushPromises()
    const stepA = wrapper.find(byStep('a'))
    ;(stepA.get(cancel).element as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(stepA.get(cancel).element)
    mocks.getNodeConnections.mockResolvedValue({ connections: [b] })
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    await flushPromises()
    oldProbe.resolve(probe(a.id))
    await flushPromises()

    expect(stepA.find('[data-testid="missing-connection"]').exists()).toBe(true)
    expect(stepA.find(selectedStatus).exists()).toBe(false)
    expect(stepA.find(cancel).exists()).toBe(false)
    expect(document.activeElement).toBe(stepA.get(refresh).element)
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id)).toEqual([a.id, b.id, b.id])
  })

  it('同级连接确认换了地址也不会重开已取消的诊断；用户仍可主动重测', async () => {
    const oldProbe = deferred<NodeConnectionProbe>()
    mocks.probeSavedNodeConnection.mockImplementation((id: string) => id === a.id ? oldProbe.promise : Promise.resolve(probe(id)))
    const wrapper = render()
    await flushPromises()
    const stepA = wrapper.find(byStep('a'))
    await stepA.get(cancel).trigger('click')
    mocks.getNodeConnections.mockResolvedValue({ connections: [{ ...a, baseUrl: 'http://studio-a-migrated.test:8188' }, b] })
    mocks.probeSavedNodeConnection.mockImplementation(async (id: string) => ({ ...probe(id), message: '新探测' }))
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    oldProbe.resolve(probe(a.id))
    await flushPromises()

    expect(stepA.text()).toContain('本次测试已取消')
    expect(stepA.find(selectedStatus).exists()).toBe(false)
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id)).toEqual([a.id, b.id, b.id])
    await stepA.get(refresh).trigger('click')
    await flushPromises()
    expect(stepA.get(selectedStatus).text()).toContain('新探测')
    expect(stepA.text()).not.toContain('本次测试已取消')
    expect(mocks.probeSavedNodeConnection.mock.calls.map(([id]) => id)).toEqual([a.id, b.id, b.id, a.id])
  })

  it.each([
    { focusTarget: '旧清单建议', selector: 'apply-checkpoint-field-unsupported', remains: false },
    { focusTarget: '保留的模型字段', selector: 'model-checkpoint', remains: true },
  ])('目录确认换址时保护当前焦点：$focusTarget', async ({ selector, remains }) => {
    const prior = { ...probe(a.id), capabilities: ['IMAGE_GENERATION'], models: { ...probe(a.id).models, checkpoints: ['old.safetensors'] } }
    mocks.probeSavedNodeConnection.mockImplementation(async (id: string) => id === a.id ? prior : probe(id))
    const wrapper = render(nodes, document.body)
    await flushPromises()
    const stepA = wrapper.find(byStep('a'))
    const nextCatalog = deferred<typeof response>()
    mocks.getNodeConnections.mockReturnValueOnce(nextCatalog.promise)
    await wrapper.find(byStep('b')).get(refresh).trigger('click')
    const focused = stepA.get<HTMLElement>(`[data-testid="${selector}"]`).element
    focused.focus()
    expect(document.activeElement).toBe(focused)

    const newProbe = deferred<NodeConnectionProbe>()
    mocks.probeSavedNodeConnection.mockImplementation((id: string) => id === a.id ? newProbe.promise : Promise.resolve(probe(id)))
    nextCatalog.resolve({ connections: [{ ...a, baseUrl: 'http://studio-a-migrated.test:8188' }, b] })
    await flushPromises()
    const actuallyRetained = focused.isConnected
    const focusAfterRefresh = document.activeElement
    newProbe.resolve(probe(a.id))
    await flushPromises()

    expect(actuallyRetained).toBe(remains)
    expect(focusAfterRefresh).toBe(remains ? focused : stepA.get('[data-testid="node-connection"]').element)
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
