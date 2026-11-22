// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { approveHumanNode } = vi.hoisted(() => ({
  approveHumanNode: vi.fn(),
}))

vi.mock('@/api/modules/runtime', async () => {
  const actual = await vi.importActual<typeof import('@/api/modules/runtime')>('@/api/modules/runtime')
  return { ...actual, approveHumanNode }
})

import HumanApprovalDialog from './HumanApprovalDialog.vue'
import { i18n } from '@/i18n'

describe('HumanApprovalDialog', () => {
  beforeEach(() => {
    approveHumanNode.mockReset()
    approveHumanNode.mockResolvedValue({ runtimeState: 'SUCCESS' })
  })

  it('submits approval decision and calls the captured completion handler', async () => {
    const onCompleted = vi.fn()
    const wrapper = mount(HumanApprovalDialog, {
      props: {
        onCompleted,
        request: {
          instanceId: 101,
          nodeId: 'node-human',
          nodeLabel: '人工审批',
          details: {
            approved: false,
            approvalStatus: 'pending',
            reviewer: 'ops',
            method: 'webapp',
          },
        },
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })

    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
    document.body.querySelector<HTMLButtonElement>('[data-action="approve"]')?.click()
    await flushPromises()

    expect(approveHumanNode).toHaveBeenCalledWith(101, 'node-human', expect.objectContaining({ approved: true }))
    expect(onCompleted).toHaveBeenCalledWith({
      approved: true,
      snapshot: { runtimeState: 'SUCCESS' },
    }, { instanceId: 101, nodeId: 'node-human' })
    wrapper.unmount()
  })
})

describe('人工审批弹窗键盘焦点', () => {
  let wrapper: ReturnType<typeof mount> | undefined
  let opener: HTMLButtonElement
  let background: HTMLButtonElement
  const request = {
    instanceId: 101,
    nodeId: 'node-human',
    nodeLabel: '人工审批',
    details: { approved: false, approvalStatus: 'pending' as const, reviewer: 'ops', method: 'webapp' },
  }

  beforeEach(() => {
    approveHumanNode.mockReset()
    approveHumanNode.mockResolvedValue({ runtimeState: 'SUCCESS' })
    opener = document.createElement('button')
    background = document.createElement('button')
    document.body.append(opener, background)
    opener.focus()
  })

  afterEach(async () => {
    wrapper?.unmount()
    wrapper = undefined
    await flushPromises()
    opener.remove()
    background.remove()
  })

  function open(visible: boolean) {
    wrapper = mount(HumanApprovalDialog, {
      props: { request, visible, onCompleted: vi.fn() },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    return wrapper
  }

  function dialog() { return document.body.querySelector<HTMLElement>('[role="dialog"]')! }
  function closeButton() { return dialog().querySelector<HTMLButtonElement>('header button')! }
  function press(key: string, shiftKey = false) {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
    document.activeElement?.dispatchEvent(event)
    return event
  }

  it('首次显示时接管焦点，首尾 Tab 循环，拒绝背景焦点，Esc 后恢复打开前焦点', async () => {
    const mounted = open(true)
    await flushPromises()
    const approve = dialog().querySelector<HTMLButtonElement>('[data-action="approve"]')!

    expect(document.activeElement).toBe(closeButton())
    expect(press('Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(approve)
    expect(press('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(closeButton())
    background.focus()
    expect(document.activeElement).toBe(closeButton())

    expect(press('Escape').defaultPrevented).toBe(true)
    expect(mounted.emitted('close')).toHaveLength(1)
    await mounted.setProps({ visible: false })
    await flushPromises()
    expect(document.activeElement).toBe(opener)
  })

  it('内容超高时同一个有界滚动区包含意见、失败反馈和两种决策', async () => {
    const longError = '需要重新检查工作流状态。'.repeat(40)
    approveHumanNode.mockRejectedValueOnce(new Error(longError))
    open(true)
    await flushPromises()
    const panel = dialog()
    const comment = panel.querySelector<HTMLTextAreaElement>('textarea')!
    const approve = panel.querySelector<HTMLButtonElement>('[data-action="approve"]')!
    const reject = panel.querySelector<HTMLButtonElement>('[data-action="reject"]')!
    comment.value = '窗口缩小时仍能恢复的意见'
    comment.dispatchEvent(new Event('input', { bubbles: true }))
    approve.click()
    await flushPromises()

    expect(panel.querySelector('[role="alert"]')?.textContent).toContain(longError)
    expect(comment.value).toBe('窗口缩小时仍能恢复的意见')
    expect(approve.disabled || reject.disabled).toBe(false)
    // jsdom 验证实际渲染的滚动容器与内容同属一处，不测量像素。
    expect(panel.classList.contains('max-h-[calc(100dvh-2rem)]')).toBe(true)
    expect(panel.classList.contains('overflow-y-auto')).toBe(true)
    expect(panel.classList.contains('overscroll-contain')).toBe(true)
  })

  it('重开时捕获新的打开前焦点，卸载后恢复焦点并释放键盘事件', async () => {
    const mounted = open(false)
    await flushPromises()
    expect(document.activeElement).toBe(opener)
    await mounted.setProps({ visible: true })
    await flushPromises()
    expect(document.activeElement).toBe(closeButton())
    await mounted.setProps({ visible: false })
    await flushPromises()
    expect(document.activeElement).toBe(opener)

    background.focus()
    await mounted.setProps({ visible: true })
    await flushPromises()
    expect(document.activeElement).toBe(closeButton())
    mounted.unmount()
    wrapper = undefined
    await flushPromises()
    expect(document.activeElement).toBe(background)
    expect(press('Escape').defaultPrevented).toBe(false)
    expect(mounted.emitted('close')).toBeUndefined()
  })

  it.each(['approve', 'reject'] as const)('提交 %s 时将焦点从禁用的决策移到关闭按钮，失败后可再次键盘操作', async (decision) => {
    let rejectRequest!: (reason: Error) => void
    approveHumanNode.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRequest = reject }))
    const mounted = open(true)
    await flushPromises()

    const approve = dialog().querySelector<HTMLButtonElement>('[data-action="approve"]')!
    const reject = dialog().querySelector<HTMLButtonElement>('[data-action="reject"]')!
    const comment = dialog().querySelector<HTMLTextAreaElement>('textarea')!
    comment.value = '保留意见'
    comment.dispatchEvent(new Event('input', { bubbles: true }))
    const focused = decision === 'approve' ? approve : reject
    const focusClose = vi.spyOn(closeButton(), 'focus')
    focused.focus()
    focused.click()
    await flushPromises()

    try {
      expect(approveHumanNode).toHaveBeenCalledOnce()
      expect(approveHumanNode).toHaveBeenCalledWith(101, 'node-human', expect.objectContaining({
        approved: decision === 'approve',
        comment: '保留意见',
      }))
      expect(approve.disabled).toBe(true)
      expect(reject.disabled).toBe(true)
      expect(document.activeElement).toBe(closeButton())
      // 从已滚动到底部的决策按钮交接焦点时，允许浏览器把关闭按钮滚入可视区。
      expect(focusClose).toHaveBeenCalledWith()
      expect(press('Tab', true).defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(comment)
      expect(press('Tab').defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(closeButton())
    } finally {
      rejectRequest(new Error('暂时不可用'))
      await flushPromises()
    }
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('暂时不可用')
    expect(comment.value).toBe('保留意见')
    expect(approve.disabled).toBe(false)
    expect(reject.disabled).toBe(false)
    expect(press('Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(approve)
    expect(mounted.emitted('close')).toBeUndefined()
  })
})
