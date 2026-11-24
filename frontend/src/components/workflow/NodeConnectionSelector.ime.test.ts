// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import NodeConnectionSelector from './NodeConnectionSelector.vue'

const api = vi.hoisted(() => ({ getNodeConnections: vi.fn(), createNodeConnection: vi.fn(), updateNodeConnection: vi.fn(), probeNodeConnection: vi.fn(), probeSavedNodeConnection: vi.fn() }))
vi.mock('@/api/modules/nodeConnections', () => api)

const existing: NodeConnection = {
  id: 'studio-upscale', name: '原有放大连接', provider: 'STABLE_DIFFUSION_WEBUI',
  baseUrl: 'http://upscale-service:7860', readOnly: false,
}
const created: NodeConnection = {
  id: 'studio-image', name: '工作室图像连接', provider: 'COMFYUI',
  baseUrl: 'http://image-service:8188', readOnly: false,
}
const usable: NodeConnectionProbe = {
  status: 'usable', message: '这次检测可用', detectedFrom: 'backend',
  models: { checkpoints: [], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: ['Lanczos'] },
  capabilities: ['IMAGE_GENERATION', 'UPSCALE'],
}
const bubbledEscape = vi.fn()
let wrapper: VueWrapper

function getDialog() {
  return document.body.querySelector<HTMLElement>('[data-testid="connection-dialog"]')
}

function find<T extends HTMLElement>(dialog: HTMLElement, testId: string) {
  return dialog.querySelector<T>(`[data-testid="${testId}"]`)!
}

async function openForm(edit = false) {
  wrapper = mount(NodeConnectionSelector, {
    attachTo: document.body,
    props: {
      nodeId: 'image-node',
      nodeType: edit ? 'UPSCALE' : 'IMAGE_GENERATION',
      config: edit ? { provider: existing.provider, connectionId: existing.id } : { provider: created.provider },
    },
    global: { plugins: [i18n] },
  })
  await flushPromises()
  const opener = wrapper.get(`[data-testid="${edit ? 'edit' : 'add'}-connection"]`).element as HTMLButtonElement
  opener.focus()
  opener.click()
  await flushPromises()
  const dialog = getDialog()!
  return { opener, dialog, name: find<HTMLInputElement>(dialog, 'connection-name'), url: find<HTMLInputElement>(dialog, 'connection-url') }
}

function enter(input: HTMLInputElement, value: string, isComposing = false) {
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing }))
}

function composition(input: HTMLInputElement, type: 'compositionstart' | 'compositionend') {
  input.dispatchEvent(new CompositionEvent(type, { bubbles: true }))
}

function escape(target: HTMLElement, options: { isComposing?: boolean; legacy?: boolean; repeat?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape', bubbles: true, cancelable: true, isComposing: options.isComposing, repeat: options.repeat,
  })
  if (options.legacy) Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

describe('图像连接弹窗与输入法 Escape', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    api.getNodeConnections.mockResolvedValue({ connections: [existing] })
    api.probeSavedNodeConnection.mockResolvedValue(usable)
    window.addEventListener('keydown', bubbledEscape)
  })
  afterEach(() => {
    window.removeEventListener('keydown', bubbledEscape)
    wrapper?.unmount()
    document.body.replaceChildren()
  })

  it('新增连接的选词 Escape 不丢失使用中的地址和检测结果，随后仍可主动保存并重试', async () => {
    const { opener, dialog, name, url } = await openForm()
    enter(name, created.name)
    enter(url, created.baseUrl)
    api.probeNodeConnection.mockResolvedValueOnce(usable)
    find<HTMLButtonElement>(dialog, 'test-connection').click()
    await flushPromises()
    expect(api.probeNodeConnection).toHaveBeenCalledExactlyOnceWith({
      provider: created.provider, baseUrl: created.baseUrl, nodeType: 'IMAGE_GENERATION',
    })
    const save = find<HTMLButtonElement>(dialog, 'save-connection')
    expect(save.disabled).toBe(false)

    name.focus()
    composition(name, 'compositionstart')
    enter(name, `${created.name}lian`, true)
    const cancelCandidate = escape(name, { isComposing: true })
    await flushPromises()
    expect.soft(cancelCandidate.defaultPrevented).toBe(false)
    expect(dialog.isConnected).toBe(true)
    expect(getDialog()).toBe(dialog)
    expect(document.activeElement).toBe(name)
    expect(bubbledEscape).not.toHaveBeenCalled()
    expect(api.createNodeConnection).not.toHaveBeenCalled()
    expect(wrapper.emitted('apply')).toBeUndefined()

    // jsdom 没有系统候选框；手动送入取消候选后的稳定文本和 compositionend。
    enter(name, created.name, true)
    composition(name, 'compositionend')
    await flushPromises()
    expect(name.value).toBe(created.name)
    expect(url.value).toBe(created.baseUrl)
    expect(find(dialog, 'form-status').textContent).toContain(usable.message)
    expect(save.disabled).toBe(false)

    api.createNodeConnection.mockRejectedValueOnce(new Error('模拟保存失败')).mockResolvedValueOnce(created)
    save.focus()
    save.click()
    await flushPromises()
    expect(getDialog()).toBe(dialog)
    expect(find(dialog, 'form-error').textContent).toContain('模拟保存失败')
    expect(document.activeElement).toBe(save)
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(api.createNodeConnection).toHaveBeenCalledTimes(1)

    save.click()
    await flushPromises()
    const payload = { name: created.name, provider: created.provider, baseUrl: created.baseUrl }
    expect(api.createNodeConnection).toHaveBeenCalledTimes(2)
    expect(api.createNodeConnection).toHaveBeenNthCalledWith(1, payload)
    expect(api.createNodeConnection).toHaveBeenNthCalledWith(2, payload)
    expect(api.probeNodeConnection).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('apply')).toEqual([[{ connectionId: created.id, provider: created.provider }, 'image-node']])
    expect(getDialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('编辑连接时，已结束组合的 229 Escape 和同次按住的重复事件都不关闭；新按 Escape 仍清除未保存草稿', async () => {
    const { opener, dialog, name, url } = await openForm(true)
    const newUrl = 'http://new-upscale-service:7860'
    enter(url, newUrl)
    let completeTest!: (value: NodeConnectionProbe) => void
    api.probeNodeConnection.mockReturnValueOnce(new Promise<NodeConnectionProbe>((resolve) => { completeTest = resolve }))
    const testConnection = find<HTMLButtonElement>(dialog, 'test-connection')
    testConnection.click()
    await flushPromises()
    expect(testConnection.getAttribute('aria-disabled')).toBe('true')
    name.focus()

    composition(name, 'compositionstart')
    enter(name, '本地放大服务', true)
    composition(name, 'compositionend')
    const cancelCandidate = escape(name, { legacy: true })
    await flushPromises()
    expect.soft(cancelCandidate.defaultPrevented).toBe(false)
    expect(dialog.isConnected).toBe(true)
    const heldEscape = escape(name, { repeat: true })
    await flushPromises()
    expect.soft(heldEscape.defaultPrevented).toBe(false)
    expect(dialog.isConnected).toBe(true)
    expect(getDialog()).toBe(dialog)
    expect(document.activeElement).toBe(name)
    expect(name.value).toBe('本地放大服务')
    expect(url.value).toBe(newUrl)
    expect(testConnection.getAttribute('aria-disabled')).toBe('true')
    expect(bubbledEscape).not.toHaveBeenCalled()
    expect(api.probeNodeConnection).toHaveBeenCalledExactlyOnceWith({
      provider: existing.provider, baseUrl: newUrl, nodeType: 'UPSCALE',
    })

    completeTest(usable)
    await flushPromises()
    expect(find(dialog, 'form-status').textContent).toContain(usable.message)
    expect(find<HTMLButtonElement>(dialog, 'save-connection').disabled).toBe(false)
    expect(document.activeElement).toBe(name)
    expect(api.updateNodeConnection).not.toHaveBeenCalled()
    expect(wrapper.emitted('apply')).toBeUndefined()

    name.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
    expect(escape(name).defaultPrevented).toBe(true)
    await flushPromises()
    expect(bubbledEscape).not.toHaveBeenCalled()
    expect(getDialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
    opener.click()
    await flushPromises()
    const reopened = getDialog()!
    expect(find<HTMLInputElement>(reopened, 'connection-name').value).toBe(existing.name)
    expect(find<HTMLInputElement>(reopened, 'connection-url').value).toBe(existing.baseUrl)
    expect(reopened.querySelector('[data-testid="form-status"]')).toBeNull()
    expect(find<HTMLButtonElement>(reopened, 'save-connection').disabled).toBe(true)
  })
})
