// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeConnectionProbe } from '@/api/modules/nodeConnections'
import NodeConnectionSelector from './NodeConnectionSelector.vue'

const api = vi.hoisted(() => ({
  getNodeConnections: vi.fn(),
  probeSavedNodeConnection: vi.fn(),
  probeNodeConnection: vi.fn(),
  createNodeConnection: vi.fn(),
  updateNodeConnection: vi.fn(),
}))
vi.mock('@/api/modules/nodeConnections', () => api)

const urlValue = 'http://studio.invalid:8188'
const usable: NodeConnectionProbe = {
  detectedFrom: 'backend',
  status: 'usable',
  message: 'Studio fixture',
  models: { checkpoints: ['studio.safetensors'], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: [] },
  capabilities: ['IMAGE_GENERATION'],
}
const wrappers: VueWrapper[] = []

function get<T extends HTMLElement>(id: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(`[data-testid="${id}"]`)
  expect(element).not.toBeNull()
  return element!
}
function error(root: ParentNode) {
  return root.querySelector<HTMLElement>('[data-testid="form-error"]')
}
async function enter(field: HTMLInputElement | HTMLSelectElement, value: string) {
  field.value = value
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  await flushPromises()
}
async function click(button: HTMLButtonElement) {
  button.focus()
  button.click()
  await flushPromises()
}
async function render(locale = 'zh-CN') {
  const wrapper = mount(NodeConnectionSelector, {
    attachTo: document.body,
    props: { nodeId: 'img-fixture', nodeType: 'IMAGE_GENERATION', config: { provider: 'COMFYUI' } },
    global: { plugins: [createPinia(), createI18n({ legacy: false, locale })] },
  })
  wrappers.push(wrapper)
  await flushPromises()
  const opener = get<HTMLButtonElement>('add-connection', wrapper.element)
  await click(opener)
  const dialog = get<HTMLElement>('connection-dialog')
  return {
    wrapper, opener, dialog,
    name: get<HTMLInputElement>('connection-name', dialog),
    url: get<HTMLInputElement>('connection-url', dialog),
    provider: get<HTMLSelectElement>('connection-provider', dialog),
    test: get<HTMLButtonElement>('test-connection', dialog),
    save: get<HTMLButtonElement>('save-connection', dialog),
  }
}
function expectFieldError(field: HTMLInputElement, message: string, dialog: HTMLElement) {
  expect(error(dialog)?.textContent).toBe(message)
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(field.getAttribute('aria-describedby')!)).toBe(error(dialog))
}
beforeEach(() => {
  vi.resetAllMocks()
  api.getNodeConnections.mockResolvedValue({ connections: [] })
  api.probeSavedNodeConnection.mockResolvedValue(usable)
  api.probeNodeConnection.mockResolvedValue(usable)
  api.createNodeConnection.mockResolvedValue({
    id: 'saved-fixture', name: 'Studio', provider: 'COMFYUI', baseUrl: urlValue, readOnly: false,
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('图像连接向导的字段校验与恢复', () => {
  it.each([
    ['zh-CN', '请输入连接名称'],
    ['en-US', 'Enter a connection name'],
    ['ja-JP', '接続名を入力してください'],
  ])('成功检测后，%s 的空名称错误与输入关联；修正后不用重测', async (locale, message) => {
    const { wrapper, dialog, name, url, test, save } = await render(locale)
    await enter(url, urlValue)
    await click(test)
    expect(save.disabled).toBe(false)
    expect(get('form-status', dialog).textContent).toContain(usable.message)
    await click(save)
    expect(error(dialog)?.textContent).toBe(message)
    expect(api.createNodeConnection).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(name)
    expectFieldError(name, message, dialog)
    expect(url.hasAttribute('aria-invalid')).toBe(false)
    await enter(name, '  ')
    expectFieldError(name, message, dialog)
    await enter(name, 'Studio')
    expect(error(dialog)).toBeNull()
    expect(name.hasAttribute('aria-invalid')).toBe(false)
    expect(name.hasAttribute('aria-describedby')).toBe(false)
    expect(get('form-status', dialog).textContent).toContain(usable.message)
    expect(api.probeNodeConnection).toHaveBeenCalledTimes(1)
    expect(api.createNodeConnection).not.toHaveBeenCalled()
    await enter(name, '')
    expect(error(dialog)).toBeNull()
    await enter(name, 'Studio')
    await click(save)
    expect(api.createNodeConnection).toHaveBeenCalledExactlyOnceWith({ name: 'Studio', provider: 'COMFYUI', baseUrl: urlValue })
    expect(wrapper.emitted('apply')).toEqual([[{ connectionId: 'saved-fixture', provider: 'COMFYUI' }, 'img-fixture']])
  })

  it('名字改正时立即清除假警告，即使未发生新检测或保存', async () => {
    const { dialog, name, url, test, save } = await render()
    await enter(url, urlValue)
    await click(test)
    await click(save)
    expect(error(dialog)?.textContent).toBe('请输入连接名称')
    await enter(name, 'Studio')
    expect(error(dialog)).toBeNull()
    expect(api.probeNodeConnection).toHaveBeenCalledTimes(1)
    expect(api.createNodeConnection).not.toHaveBeenCalled()
  })

  it('地址未通过本地校验时定位地址；其他字段或仍无效的编辑不撤掉提示', async () => {
    const { dialog, name, url, provider, test, save } = await render()
    const message = '请输入无凭据、查询参数或片段的有效 HTTP(S) 服务地址'
    await click(test)
    expect(error(dialog)?.textContent).toBe(message)
    expect(document.activeElement).toBe(url)
    expectFieldError(url, message, dialog)
    expect(name.hasAttribute('aria-invalid')).toBe(false)
    await enter(name, 'Studio')
    await enter(provider, 'STABLE_DIFFUSION_WEBUI')
    await enter(url, 'invalid')
    expectFieldError(url, message, dialog)
    expect(api.probeNodeConnection).not.toHaveBeenCalled()
    await enter(url, urlValue)
    expect(error(dialog)).toBeNull()
    expect(url.hasAttribute('aria-invalid')).toBe(false)
    expect(save.disabled).toBe(true)
    await click(test)
    expect(save.disabled).toBe(false)
    expect(api.probeNodeConnection).toHaveBeenCalledTimes(1)
  })

  it('与未修正的地址编辑相反，服务失败不标记名称或地址，仍保留草稿并等用户重试', async () => {
    const { dialog, name, url, test, save } = await render()
    api.probeNodeConnection.mockRejectedValueOnce(new Error('受控测试暂时失败'))
    api.createNodeConnection.mockRejectedValueOnce(new Error('受控保存暂时失败'))
    await enter(name, 'Studio')
    await enter(url, urlValue)
    await click(test)
    expect(error(dialog)?.textContent).toContain('受控测试暂时失败')
    expect(document.activeElement).toBe(test)
    expect(url.hasAttribute('aria-invalid')).toBe(false)
    expect(save.disabled).toBe(true)
    await click(test)
    expect(error(dialog)).toBeNull()
    await click(save)
    expect(error(dialog)?.textContent).toContain('受控保存暂时失败')
    expect(name.hasAttribute('aria-invalid')).toBe(false)
    expect(url.hasAttribute('aria-invalid')).toBe(false)
    expect(name.value).toBe('Studio')
    expect(url.value).toBe(urlValue)
    await enter(name, 'Studio revised')
    expect(error(dialog)?.textContent).toContain('受控保存暂时失败')
    expect(save.disabled).toBe(false)
    await click(save)
    expect(api.createNodeConnection).toHaveBeenCalledTimes(2)
  })

  it('在渲染字段错误之前已经选择了其他控件时不抢焦点', async () => {
    const { dialog, provider, test } = await render()
    test.focus()
    test.click()
    provider.focus()
    await flushPromises()
    expect(error(dialog)?.textContent).toContain('有效 HTTP(S)')
    expect(document.activeElement).toBe(provider)
    expect(api.probeNodeConnection).not.toHaveBeenCalled()
  })

  it('取消时清理校验并还原焦点，重开不显示旧字段错误', async () => {
    const { opener, dialog, test } = await render()
    await click(test)
    expect(error(dialog)?.textContent).toContain('有效 HTTP(S)')
    const focused = document.activeElement
    focused?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(dialog.isConnected).toBe(false)
    expect(document.activeElement).toBe(opener)
    await click(opener)
    expect(error(get('connection-dialog'))).toBeNull()
    expect(api.probeNodeConnection).not.toHaveBeenCalled()
    expect(api.createNodeConnection).not.toHaveBeenCalled()
  })
})
