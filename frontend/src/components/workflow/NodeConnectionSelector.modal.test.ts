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
