// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import type { CopilotStreamOptions } from '@/services/api/copilotApi'
import type { CopilotMessage } from '@/types/copilot'
import AICopilotPanel from './AICopilotPanel.vue'

const { stream, planWorkflow, editCanvas } = vi.hoisted(() => ({
  stream: vi.fn(), planWorkflow: vi.fn(), editCanvas: vi.fn(),
}))
vi.mock('@/services/api/copilotApi', () => ({
  copilotApi: {
    stream, planWorkflow, editCanvas,
    listConversations: vi.fn().mockResolvedValue([{ id: 'conv-1', workflowId: 'wf-1' }]),
    listMessages: vi.fn().mockImplementation(async () => [
      { id: 'earlier-reply', role: 'assistant', content: 'Earlier saved reply.', createdAt: '17:00' },
    ]),
  },
}))
vi.mock('@/services/api/modelApi', () => ({
  modelApi: { refreshSnapshot: vi.fn().mockResolvedValue({ providers: [], models: [] }) },
}))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: {} }))

const context = {
  workflowId: 'wf-1', workflowName: 'Existing workflow', projectId: null, editRevision: 1,
  selectedNodeId: null, nodes: [], edges: [], templates: [],
}
const stopLabel = 'Stop receiving'
const stoppedLabel = 'Stopped receiving this reply.'

function controlledTurn() {
  let callbacks!: CopilotStreamOptions
  let resolve!: (message: CopilotMessage) => void
  let reject!: (error: Error) => void
  const reply = new Promise<CopilotMessage>((yes, no) => { resolve = yes; reject = no })
  stream.mockImplementationOnce((_query, options: CopilotStreamOptions) => {
    callbacks = options
    return reply
  })
  return {
    get signal() { return callbacks.signal },
    delta(content: string) { callbacks.onDelta?.(content) },
    finish(content: string) { resolve({ id: 'new-reply', role: 'assistant', content, createdAt: '17:01', conversationId: 'conv-1' }) },
    fail: reject,
  }
}

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  window.sessionStorage.clear()
  i18n.global.locale.value = 'en-US'
  stream.mockReset()
  editCanvas.mockReset()
  planWorkflow.mockReset()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('测试禁止真实网络请求') }))
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('测试禁止真实网络请求') } })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function openPanel() {
  const panel = mount(AICopilotPanel, {
    props: { context, applyCanvasEdit: vi.fn() },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  wrapper = panel
  await flushPromises()
  const composer = panel.get('textarea')
  const button = (text: string) => panel.findAll('button').find((candidate) => candidate.text() === text)
  async function click(text: string) {
    const target = button(text)
    expect(target, text).toBeDefined()
    await target!.trigger('click')
  }
  const clickTranslated = (key: string) => click(i18n.global.t(key))
  return { panel, composer, button, click, clickTranslated }
}

describe('Copilot 普通聊天停止接收', () => {
  it.each(['quickExplainLatestError', 'quickSuggestNextNode'] as const)(
    '直接编辑模式下的 %s 是聊天，停止后保留部分回复和未发送草稿',
    async (shortcut) => {
      const turn = controlledTurn()
      const { panel, composer, button, clickTranslated } = await openPanel()
      await composer.setValue('Unsent follow-up')
      await clickTranslated(`copilot.${shortcut}`)
      turn.delta('**First useful detail.**\n\n```text\nPartial block')
      await flushPromises()
      expect(stream).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ conversationId: 'conv-1' }))
      expect(editCanvas).not.toHaveBeenCalled()
      // 基线错误地显示“取消编辑”；同一实际按钮能中断请求，却不标注该聊天回复已停止。
      const stop = button(stopLabel) ?? button('Cancel edit')
      expect(stop).toBeDefined()
      stop!.element.focus()
      await stop!.trigger('click')
      expect(turn.signal?.aborted).toBe(true)
      turn.fail(new DOMException('Aborted', 'AbortError'))
      await flushPromises()
      expect(panel.get('article:last-of-type').text()).toContain('First useful detail.')
      expect(composer.element.value).toBe('Unsent follow-up')
      expect(panel.text()).toContain('Earlier saved reply.')
      expect.soft(stop!.text()).toBe(stopLabel)
      const notice = panel.find('article:last-of-type > [role="status"]')
      expect.soft(notice.exists() && notice.text()).toBe(stoppedLabel)
      expect(document.activeElement).toBe(composer.element)
      expect(button(stopLabel)).toBeUndefined()
    },
  )

  it('聊天在第一段回复前可停止，立即续聊时旧请求的迟到结果不会覆盖或解锁新一轮', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const first = controlledTurn()
    const second = controlledTurn()
    const { panel, composer, button, click, clickTranslated } = await openPanel()
    await clickTranslated('copilot.editor.chatMode')
    await composer.setValue('First question')
    await composer.trigger('keydown', { key: 'Enter' })
    await click(stopLabel)
    expect(first.signal?.aborted).toBe(true)
    expect(panel.get('article:last-of-type > [role="status"]').text()).toBe(stoppedLabel)
    expect(panel.get('button[type="submit"]').attributes('disabled')).toBeUndefined()

    await composer.setValue('Second question')
    await composer.trigger('keydown', { key: 'Enter' })
    expect(stream).toHaveBeenCalledTimes(2)
    expect(stream.mock.calls[1]?.[1]).toMatchObject({ conversationId: 'conv-1' })
    first.delta('Late chunk from first reply')
    first.finish('Late completion from first reply')
    await flushPromises()
    expect(panel.text()).not.toContain('Late chunk')
    expect(panel.text()).not.toContain('Late completion')
    expect(button(stopLabel)).toBeDefined()
    expect(panel.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    second.delta('Current chunk')
    await flushPromises()
    expect(panel.get('article:last-of-type').text()).toContain('Current chunk')
    expect(panel.get('article:last-of-type').text()).not.toContain(stoppedLabel)
    second.finish('Second complete answer')
    await flushPromises()
    expect(panel.get('article:last-of-type').text()).toContain('Second complete answer')
    expect(panel.findAll('article > [role="status"]').map((status) => status.text())).toEqual([stoppedLabel])
    expect(button(stopLabel)).toBeUndefined()
  })

  it('真实编辑请求依旧只显示取消编辑，并保持原取消反馈', async () => {
    editCanvas.mockImplementation((_text: string, options: { signal: AbortSignal }) => new Promise((_yes, no) => {
      options.signal.addEventListener('abort', () => no(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const { panel, composer, button, clickTranslated } = await openPanel()
    await composer.setValue('Rename this node')
    await composer.trigger('keydown', { key: 'Enter' })
    expect(editCanvas).toHaveBeenCalledTimes(1)
    expect(stream).not.toHaveBeenCalled()
    expect(button(stopLabel)).toBeUndefined()
    await clickTranslated('copilot.editor.cancel')
    await flushPromises()
    expect(panel.text()).toContain(i18n.global.t('copilot.editor.cancelled'))
    expect(panel.text()).not.toContain(stoppedLabel)
  })

  it('没有手动停止时仍显示正常结果和普通失败，不误报中断', async () => {
    const good = controlledTurn()
    const bad = controlledTurn()
    const { panel, button, clickTranslated } = await openPanel()
    await clickTranslated('copilot.quickExplainLatestError')
    good.finish('Complete response')
    await flushPromises()
    expect(button(stopLabel)).toBeUndefined()
    await clickTranslated('copilot.quickExplainLatestError')
    bad.fail(new Error('Provider unavailable'))
    await flushPromises()
    expect(panel.text()).toContain('Complete response')
    expect(panel.text()).toContain('Provider unavailable')
    expect(panel.text()).not.toContain(stoppedLabel)
    expect(button(stopLabel)).toBeUndefined()
  })
})
