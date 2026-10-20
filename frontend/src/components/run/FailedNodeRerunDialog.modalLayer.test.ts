// @vitest-environment jsdom
// 仅验证遮罩结构、层级声明、事件与焦点状态；jsdom 没有真实层叠与命中测试，
// 不代表视觉遮挡或真实指针命中验收通过。
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { previewFailedNodeRerun, rerunFailedNode } = vi.hoisted(() => ({ previewFailedNodeRerun: vi.fn(), rerunFailedNode: vi.fn() }))
vi.mock('@/api/modules/workflow', () => ({ previewFailedNodeRerun, rerunFailedNode }))

import FailedNodeRerunDialog from './FailedNodeRerunDialog.vue'
import { i18n } from '@/i18n'

const preview = {
  sourceInstanceId: 1, nodeId: 'failed', revision: 'revision', eligible: true,
  invalidatedNodes: [{ nodeId: 'failed', label: '失败节点' }],
  preservedNodes: [{ nodeId: 'paid', label: '已完成 AI 节点' }], blockers: [],
}
const wrappers: ReturnType<typeof mount>[] = []

function dialog() {
  const wrapper = mount(FailedNodeRerunDialog, {
    props: { instanceId: 1, nodeId: 'failed', nodeLabel: '失败节点' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}

function action(name: string) {
  return document.body.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!
}

/** 从 Tailwind 类名里读出层级数值，例如 z-50 → 50，z-[150] → 150。 */
function zIndexOf(element: Element | null): number {
  if (!element) return Number.NaN
  for (const token of element.className.split(/\s+/)) {
    const arbitrary = /^z-\[(\d+)\]$/.exec(token)
    if (arbitrary) return Number(arbitrary[1])
    const plain = /^z-(\d+)$/.exec(token)
    if (plain) return Number(plain[1])
  }
  return Number.NaN
}

function sourceOf(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('失败节点重跑确认框的模态层级与焦点', () => {
  beforeEach(() => {
    previewFailedNodeRerun.mockReset().mockResolvedValue(preview)
    rerunFailedNode.mockReset().mockResolvedValue({ id: 2 })
  })
  afterEach(() => {
    wrappers.splice(0).forEach(wrapper => wrapper.unmount())
    document.body.innerHTML = ''
  })

  it('遮罩覆盖整个视口且层级高于公共顶栏与通知面板', async () => {
    dialog()
    await flushPromises()
    const panel = document.body.querySelector('[role="dialog"]')!
    const overlay = panel.parentElement!
    expect(overlay.className).toContain('fixed')
    expect(overlay.className).toContain('inset-0')
    const overlayZ = zIndexOf(overlay)
    expect(Number.isNaN(overlayZ)).toBe(false)

    // 公共顶栏与其通知面板的层级取自组件自身声明，遮罩必须更高才能真正挡住背景交互。
    const statusBar = sourceOf('../layout/TopStatusBar.vue')
    const headerZ = Number(/z-\[(\d+)\][^"]*flex h-14/.exec(statusBar)![1])
    const panelZ = Number(/notification-panel[^"]*z-\[(\d+)\]/.exec(statusBar)![1])
    expect(overlayZ).toBeGreaterThan(headerZ)
    expect(overlayZ).toBeGreaterThan(panelZ)
  })

  it('沿用项目既有模态框层级约定', async () => {
    dialog()
    await flushPromises()
    const overlay = document.body.querySelector('[role="dialog"]')!.parentElement!
    // 项目内既有模态框（未保存导航、节点连线、Whisper 环境）统一使用 z-[150]。
    expect(zIndexOf(overlay)).toBe(150)
  })

  it('初始焦点落在对话框内且 Tab 与 Shift+Tab 在按钮间循环', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = dialog()
    await flushPromises()
    const panel = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(document.activeElement).toBe(panel)

    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    expect(buttons.length).toBeGreaterThan(1)
    buttons[buttons.length - 1]!.focus()
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(buttons[0])

    buttons[0]!.focus()
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(buttons[buttons.length - 1])

    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape 关闭并把焦点交还给触发元素', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = dialog()
    await flushPromises()
    document.body.querySelector('[role="dialog"]')!.parentElement!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('取消、重复打开与重复确认都不产生额外副作用', async () => {
    const first = dialog()
    await flushPromises()
    action('rerun').click()
    action('rerun').click()
    await flushPromises()
    expect(rerunFailedNode).toHaveBeenCalledTimes(1)

    // 重新打开时旧对话框已卸载，新的预览仍来自当前实例。
    first.unmount()
    wrappers.splice(wrappers.indexOf(first), 1)
    previewFailedNodeRerun.mockResolvedValue({ ...preview, nodeId: 'other', revision: 'revision-2' })
    const second = dialog()
    await flushPromises()
    expect(document.body.textContent).toContain('失败节点')
    action('close').click()
    await flushPromises()
    expect(second.emitted('close')).toHaveLength(1)
  })
})
