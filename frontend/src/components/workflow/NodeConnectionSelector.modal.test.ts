// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getNodeConnections: vi.fn(), createNodeConnection: vi.fn(), updateNodeConnection: vi.fn(), probeNodeConnection: vi.fn(), probeSavedNodeConnection: vi.fn() }))
vi.mock('@/api/modules/nodeConnections', () => mocks)
import { i18n } from '@/i18n'
import type { NodeConnectionProbe } from '@/api/modules/nodeConnections'
import NodeConnectionSelector from './NodeConnectionSelector.vue'

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const topbarSource = source('../layout/TopStatusBar.vue')
const accountSource = source('../layout/AccountDropdown.vue')
const topbarClasses = topbarSource.match(/<header class="([^"]+)"/)![1]!
const accountClasses = accountSource.match(/class="(account-menu [^"]+)"/)![1]!
const styles = document.createElement('style')
let wrapper: VueWrapper | undefined

async function openForm(nodeType: 'IMAGE_GENERATION' | 'UPSCALE' = 'IMAGE_GENERATION') {
  wrapper = mount(NodeConnectionSelector, {
    attachTo: document.body,
    props: { nodeId: 'modal-node', nodeType, config: { provider: 'COMFYUI' } },
    global: { plugins: [i18n] },
  })
  await flushPromises()
  const opener = wrapper.get('[data-testid="add-connection"]').element as HTMLButtonElement
  opener.focus()
  opener.click()
  await flushPromises()
  const dialog = document.querySelector<HTMLElement>('[data-testid="connection-dialog"]')!
  return { opener, dialog, name: dialog.querySelector<HTMLInputElement>('[data-testid="connection-name"]')! }
}

function key(target: HTMLElement, value: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function startPendingTest(dialog: HTMLElement) {
  let resolve!: (result: NodeConnectionProbe) => void
  let reject!: (cause: Error) => void
  mocks.probeNodeConnection.mockReturnValueOnce(new Promise<NodeConnectionProbe>((yes, no) => {
    resolve = yes
    reject = no
  }))
  const url = dialog.querySelector<HTMLInputElement>('[data-testid="connection-url"]')!
  url.value = 'http://sample-service:8188'
  url.dispatchEvent(new Event('input', { bubbles: true }))
  const test = dialog.querySelector<HTMLButtonElement>('[data-testid="test-connection"]')!
  test.focus()
  test.click()
  return { resolve, reject, test }
}

const usable: NodeConnectionProbe = {
  status: 'usable', message: '测试目录', detectedFrom: 'backend',
  models: { checkpoints: [], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: [] },
  capabilities: ['IMAGE_GENERATION'],
}

describe('节点连接弹窗模态交互', () => {
  beforeAll(async () => {
    // 编译真实组件的工具类，避免 jsdom 中只有类名却没有层级样式的假阳性。
    const result = await postcss([tailwindcss({
      content: [{ raw: [source('./NodeConnectionSelector.vue'), topbarSource, accountSource].join('\n'), extension: 'vue' }],
      corePlugins: { preflight: false },
    })]).process('@tailwind utilities;', { from: undefined })
    styles.textContent = result.css
    document.head.append(styles)
  })
  afterAll(() => styles.remove())
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    mocks.getNodeConnections.mockResolvedValue({ connections: [] })
    mocks.probeSavedNodeConnection.mockResolvedValue({ status: 'unconfigured', message: '', models: {}, capabilities: [] })
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.replaceChildren()
  })

  it.each(['IMAGE_GENERATION', 'UPSCALE'] as const)('%s 遮罩层级高于顶栏和账户浮层', async (nodeType) => {
    const { dialog } = await openForm(nodeType)
    const overlay = dialog.parentElement!
    const topbar = document.createElement('header')
    const account = document.createElement('div')
    topbar.className = topbarClasses
    account.className = accountClasses
    document.body.prepend(topbar, account)
    expect(overlay.parentElement).toBe(document.body)
    expect(getComputedStyle(overlay).position).toBe('fixed')
    expect(getComputedStyle(overlay).inset).toBe('0px')
    expect(getComputedStyle(topbar).zIndex).toBe('100')
    expect(getComputedStyle(account).zIndex).toBe('120')
    const modalLevel = Number(getComputedStyle(overlay).zIndex)
    expect(modalLevel).toBeGreaterThan(Number(getComputedStyle(topbar).zIndex))
    expect(modalLevel).toBeGreaterThan(Number(getComputedStyle(account).zIndex))
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('打开后聚焦名称且保存保持禁用', async () => {
    const { dialog, name } = await openForm()
    expect(document.activeElement).toBe(name)
    expect(dialog.querySelector<HTMLButtonElement>('[data-testid="save-connection"]')!.disabled).toBe(true)
  })

  it('一次 Escape 关闭弹窗、阻止冒泡并回焦到打开按钮', async () => {
    const { opener, name } = await openForm()
    const bubbled = vi.fn()
    window.addEventListener('keydown', bubbled)
    try {
      expect(key(name, 'Escape').defaultPrevented).toBe(true)
      await flushPromises()
      expect(document.querySelector('[data-testid="connection-dialog"]')).toBeNull()
      expect(document.activeElement).toBe(opener)
      expect(bubbled).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', bubbled)
    }
  })

  it('首次测试在途时保留当前焦点且不重复请求', async () => {
    const { dialog } = await openForm()
    const { test, resolve } = startPendingTest(dialog)
    await flushPromises()
    expect(test.disabled).toBe(false)
    expect(test.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(test)
    expect(dialog.querySelector<HTMLButtonElement>('[data-testid="save-connection"]')!.disabled).toBe(true)

    test.click()
    expect(mocks.probeNodeConnection).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(test)
    expect(mocks.probeNodeConnection).toHaveBeenCalledWith({
      provider: 'COMFYUI', baseUrl: 'http://sample-service:8188', nodeType: 'IMAGE_GENERATION',
    })

    resolve(usable)
    await flushPromises()
    expect(test.getAttribute('aria-disabled')).toBeNull()
    expect(document.activeElement).toBe(test)
    expect(dialog.querySelector<HTMLButtonElement>('[data-testid="save-connection"]')!.disabled).toBe(false)
    expect(mocks.createNodeConnection).not.toHaveBeenCalled()
  })

  it.each([
    ['usable', '连接可用', '本次可读取服务目录'],
    ['unreachable', '无法连接', '本次服务连接超时'],
    ['missing_model', '缺少必要选项或模型', '未发现可用的 Checkpoint'],
    ['unconfigured', '未配置', '服务未提供此节点需要的能力'],
  ] as const)('结构化诊断 %s 更新已挂载的状态区而不移动焦点', async (status, label, message) => {
    const { dialog } = await openForm()
    const announcement = dialog.querySelector<HTMLElement>('[role="status"]')!
    const initialText = announcement?.textContent?.trim()
    const { test, resolve } = startPendingTest(dialog)
    await flushPromises()
    const pendingText = announcement?.textContent?.trim()

    resolve({ ...usable, status, message, warnings: ['仅用于详情的目录说明'] })
    await flushPromises()

    const card = dialog.querySelector('[data-testid="form-status"]')
    expect(card?.textContent).toContain(label)
    expect(card?.textContent).toContain(message)
    expect(announcement?.getAttribute('role')).toBe('status')
    expect(announcement.getAttribute('aria-atomic')).toBe('true')
    expect(initialText).toBe('')
    expect(pendingText).toBe('')
    expect(card?.querySelector('[role="status"]')).toBe(announcement)
    expect(announcement.textContent).toContain(label)
    expect(announcement.textContent).toContain(message)
    expect(announcement.textContent).not.toContain('仅用于详情的目录说明')
    expect(card?.textContent).toContain('仅用于详情的目录说明')
    expect(document.activeElement).toBe(test)
    expect(dialog.querySelector<HTMLButtonElement>('[data-testid="save-connection"]')!.disabled).toBe(status !== 'usable')
    expect(mocks.createNodeConnection).not.toHaveBeenCalled()
    expect(mocks.updateNodeConnection).not.toHaveBeenCalled()
    expect(wrapper!.emitted('apply')).toBeUndefined()
    expect(wrapper!.emitted('updateConfig')).toBeUndefined()
  })

  it('重试、修改地址和关闭时只保留当前向导的结果；请求异常由原有 alert 提示', async () => {
    const { dialog, opener, name } = await openForm()
    const announcement = dialog.querySelector<HTMLElement>('[role="status"]')!
    const url = dialog.querySelector<HTMLInputElement>('[data-testid="connection-url"]')!
    const first = startPendingTest(dialog)
    first.resolve({ ...usable, message: '首次目录结果' })
    await flushPromises()
    expect(announcement?.getAttribute('role')).toBe('status')
    expect(announcement.textContent).toContain('首次目录结果')

    const second = startPendingTest(dialog)
    await flushPromises()
    expect(announcement.textContent?.trim()).toBe('')
    second.resolve({ ...usable, message: '首次目录结果' })
    await flushPromises()
    expect(announcement.textContent).toContain('首次目录结果')

    const third = startPendingTest(dialog)
    name.focus()
    third.reject(new Error('模拟读取失败'))
    await flushPromises()
    expect(announcement.textContent?.trim()).toBe('')
    expect(dialog.querySelector('[data-testid="form-error"][role="alert"]')?.textContent).toContain('模拟读取失败')
    expect(document.activeElement).toBe(name)

    const old = startPendingTest(dialog)
    url.value = 'http://changed-service:8188'
    url.dispatchEvent(new Event('input', { bubbles: true }))
    mocks.probeNodeConnection.mockResolvedValueOnce({ ...usable, message: '最新地址目录结果' })
    old.test.click()
    await flushPromises()
    old.resolve({ ...usable, message: '过期地址结果' })
    await flushPromises()
    expect(announcement.textContent).toContain('最新地址目录结果')
    expect(announcement.textContent).not.toContain('过期地址结果')
    expect(dialog.querySelector('[data-testid="form-error"]')).toBeNull()
    expect(mocks.probeNodeConnection).toHaveBeenCalledTimes(5)

    expect(key(old.test, 'Escape').defaultPrevented).toBe(true)
    await flushPromises()
    expect(announcement.isConnected).toBe(false)
    expect(document.activeElement).toBe(opener)
    opener.click()
    await flushPromises()
    const reopened = document.querySelector('[role="status"]')
    expect(reopened).not.toBe(announcement)
    expect(reopened?.textContent?.trim()).toBe('')
  })

  it('从在途测试按钮按 Escape 可立即退出并忽略迟到响应', async () => {
    const { dialog, opener } = await openForm()
    const { test, resolve } = startPendingTest(dialog)
    await flushPromises()
    expect(test.disabled).toBe(false)
    expect(key(test, 'Escape').defaultPrevented).toBe(true)
    await flushPromises()
    expect(document.activeElement).toBe(opener)
    expect(dialog.isConnected).toBe(false)

    resolve(usable)
    await flushPromises()
    expect(document.querySelector('[data-testid="form-status"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(wrapper!.emitted('apply')).toBeUndefined()
  })

  it('测试失败不会从后来选择的输入框夺回焦点', async () => {
    const { dialog, name } = await openForm()
    const { test, reject } = startPendingTest(dialog)
    await flushPromises()
    name.focus()
    reject(new Error('synthetic failure'))
    await flushPromises()
    expect(document.activeElement).toBe(name)
    expect(test.disabled).toBe(false)
    expect(test.getAttribute('aria-disabled')).toBeNull()
    expect(dialog.querySelector('[data-testid="form-error"]')).not.toBeNull()
    expect(mocks.probeNodeConnection).toHaveBeenCalledTimes(1)
  })

  it.each(['取消', '关闭', '遮罩'])('%s 回焦且重开清空未保存草稿', async (method) => {
    const { opener, dialog, name } = await openForm()
    name.value = '未保存草稿'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    const url = dialog.querySelector<HTMLInputElement>('[data-testid="connection-url"]')!
    url.value = 'http://draft-service:8188'
    url.dispatchEvent(new Event('input', { bubbles: true }))
    const target = method === '遮罩' ? dialog.parentElement! : method === '取消'
      ? dialog.querySelector<HTMLElement>('[data-testid="cancel-connection"]')! : dialog.querySelector<HTMLElement>('button')!
    target.click()
    await flushPromises()
    expect(document.querySelector('[data-testid="connection-dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
    opener.click()
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>('[data-testid="connection-name"]')!.value).toBe('')
    expect(document.querySelector<HTMLInputElement>('[data-testid="connection-url"]')!.value).toBe('')
    expect(mocks.createNodeConnection).not.toHaveBeenCalled()
    expect(mocks.updateNodeConnection).not.toHaveBeenCalled()
    expect(mocks.probeNodeConnection).not.toHaveBeenCalled()
    expect(wrapper!.emitted('apply')).toBeUndefined()
    expect(wrapper!.emitted('updateConfig')).toBeUndefined()
  })
})
