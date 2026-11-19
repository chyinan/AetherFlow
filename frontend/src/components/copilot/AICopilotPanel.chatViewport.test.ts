// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
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
    listMessages: vi.fn().mockImplementation(async () => Array.from({ length: 8 }, (_, index) => ({
      id: `history-${index}`, role: index % 2 ? 'assistant' : 'user',
      content: `Earlier message ${index}`, createdAt: '17:00',
    }))),
  },
}))
vi.mock('@/services/api/modelApi', () => ({
  modelApi: { refreshSnapshot: vi.fn().mockResolvedValue({ providers: [], models: [] }) },
}))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: {} }))

const editorContext = {
  workflowId: 'wf-1', workflowName: 'Viewport fixture', projectId: null, editRevision: 1,
  selectedNodeId: null, nodes: [], edges: [], templates: [],
}

function response(content: string): CopilotMessage {
  return { id: 'reply-1', role: 'assistant', content, createdAt: '17:01', conversationId: 'conv-1' }
}

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  window.sessionStorage.clear()
  i18n.global.locale.value = 'en-US'
  stream.mockReset()
  planWorkflow.mockReset()
  editCanvas.mockReset()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('聊天滚动测试禁止真实网络请求') }))
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('聊天滚动测试禁止真实网络请求') } })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

async function openChat() {
  let callbacks!: CopilotStreamOptions
  let complete!: (message: CopilotMessage) => void
  let fail!: (error: Error) => void
  const pending = new Promise<CopilotMessage>((resolve, reject) => { complete = resolve; fail = reject })
  stream.mockImplementation((_prompt, options: CopilotStreamOptions) => { callbacks = options; return pending })

  const panel = mount(AICopilotPanel, {
    props: { context: editorContext, applyCanvasEdit: vi.fn() },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  wrapper = panel
  await flushPromises()
  const chatMode = panel.findAll('[role="group"] button').find((button) => button.text() === i18n.global.t('copilot.editor.chatMode'))
  expect(chatMode).toBeDefined()
  await chatMode!.trigger('click')

  // jsdom 不进行布局；用当前消息 DOM 模拟内容增长和 scrollTop 的浏览器钳位。
  const viewport = panel.get('.overflow-y-auto.flex-1').element as HTMLDivElement
  const clientHeight = 120
  const scrollHeight = () => Math.max(clientHeight, Array.from(viewport.querySelectorAll('article'))
    .reduce((height, article) => height + 30 + (article.textContent?.length ?? 0), 0))
  const bottom = () => scrollHeight() - clientHeight
  let top = 0
  const writes = vi.fn((value: number) => { top = Math.min(bottom(), Math.max(0, value)) })
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, get: () => clientHeight },
    scrollHeight: { configurable: true, get: scrollHeight },
    scrollTop: { configurable: true, get: () => top, set: writes },
  })
  const composer = panel.get('textarea')
  async function send() {
    await composer.setValue('What does the latest run show?')
    composer.element.focus()
    await composer.trigger('keydown', { key: 'Enter' })
    expect(stream).toHaveBeenCalledTimes(1)
    expect(viewport.textContent).toContain('What does the latest run show?')
    expect(document.activeElement).toBe(composer.element)
  }
  async function shortcut(key: 'quickSuggestNextNode' | 'quickExplainLatestError' | 'quickDraftWorkflow') {
    const label = i18n.global.t(`copilot.${key}`)
    const button = panel.findAll('button').find((candidate) => candidate.text() === label)
    expect(button).toBeDefined()
    await button!.trigger('click')
    return label
  }
  function userScroll(value: number) { top = Math.min(bottom(), Math.max(0, value)) }

  return {
    viewport, bottom, writes, send, shortcut, composer, userScroll, complete, fail,
    delta: (content: string) => callbacks.onDelta?.(content),
  }
}

describe('Copilot 普通对话滚动', () => {
  it('从较早历史发送新问题后显示新一轮，不移走输入焦点', async () => {
    const chat = await openChat()
    expect(chat.bottom()).toBeGreaterThan(100)
    chat.userScroll(40)
    await chat.send()
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
  })

  it('接近底部时跟随同一批流式片段，按渲染后的高度滚到底部', async () => {
    const chat = await openChat()
    await chat.send()
    chat.userScroll(chat.bottom() - 0.75)
    chat.writes.mockClear()
    chat.delta('First part of the explanation. ')
    chat.delta('Second part of the explanation.')
    await nextTick()
    expect(chat.viewport.textContent).toContain('First part of the explanation. Second part')
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
    expect(chat.writes).toHaveBeenCalledTimes(1)
  })

  it('手动上翻阅读时，流式片段和最终替换均不抢位置', async () => {
    const chat = await openChat()
    await chat.send()
    chat.userScroll(60)
    chat.writes.mockClear()
    chat.delta('Streaming while reading earlier messages.')
    await nextTick()
    chat.complete(response('Final answer while reading earlier messages.'))
    await flushPromises()
    expect(chat.viewport.textContent).toContain('Final answer while reading earlier messages.')
    expect(chat.viewport.scrollTop).toBe(60)
    expect(chat.writes).not.toHaveBeenCalled()
  })

  it('手动回到底部后，从下一段回复恢复跟随', async () => {
    const chat = await openChat()
    await chat.send()
    chat.userScroll(60)
    chat.delta('One part. ')
    await nextTick()
    expect(chat.viewport.scrollTop).toBe(60)
    chat.userScroll(chat.bottom())
    chat.delta('Another part now.')
    await nextTick()
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
  })

  it('最终答案替换占位内容后仍能看到末尾', async () => {
    const chat = await openChat()
    await chat.send()
    chat.userScroll(chat.bottom())
    chat.complete(response('A complete answer without any partial chunks.'))
    await flushPromises()
    expect(chat.viewport.textContent).toContain('A complete answer without any partial chunks.')
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
  })

  it('在底部跟随时也能看到普通对话流的失败提示', async () => {
    const chat = await openChat()
    await chat.send()
    chat.userScroll(chat.bottom())
    chat.fail(new Error('Controlled stream failure'))
    await flushPromises()
    expect(chat.viewport.textContent).toContain('Controlled stream failure')
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
  })

  it('片段排队后若已上翻，不把读者拉回底部', async () => {
    const chat = await openChat()
    await chat.send()
    chat.userScroll(chat.bottom())
    chat.writes.mockClear()
    chat.delta('Message received just before reading above.')
    chat.userScroll(60)
    await nextTick()
    expect(chat.viewport.scrollTop).toBe(60)
    expect(chat.writes).not.toHaveBeenCalled()
  })
})


describe('Copilot 对话快捷操作滚动', () => {
  it.each(['quickSuggestNextNode', 'quickExplainLatestError'] as const)(
    '从旧历史点击 %s 后显示新一轮，但保留现有草稿且只发出一个聊天请求',
    async (key) => {
      const chat = await openChat()
      await chat.composer.setValue('已输入但未发送的草稿')
      chat.userScroll(40)
      expect(chat.bottom()).toBeGreaterThan(100)
      const label = await chat.shortcut(key)
      expect(stream).toHaveBeenCalledTimes(1)
      expect(stream.mock.calls[0]?.[1]).toMatchObject({ displayPrompt: label })
      expect(chat.viewport.querySelector('article:nth-last-of-type(2)')?.textContent).toContain(label)
      expect(chat.composer.element.value).toBe('已输入但未发送的草稿')
      expect(planWorkflow).not.toHaveBeenCalled()
      expect(editCanvas).not.toHaveBeenCalled()
      expect(chat.viewport.scrollTop).toBe(chat.bottom())
    },
  )

  it('在底部跟随建议的增量与最终内容，并保留原有建议按钮', async () => {
    const chat = await openChat()
    await chat.shortcut('quickSuggestNextNode')
    chat.userScroll(chat.bottom())
    chat.delta('可以添加开始节点作为输入。')
    await nextTick()
    expect(chat.viewport.lastElementChild?.textContent).toContain('可以添加开始节点')
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
    chat.complete(response('建议先添加开始节点。现有画布不会自动修改。'))
    await flushPromises()
    expect(chat.viewport.lastElementChild?.textContent).toContain('现有画布不会自动修改')
    expect(chat.viewport.lastElementChild?.querySelector('button')).not.toBeNull()
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
  })

  it('底部跟随时显示快捷排错的失败反馈', async () => {
    const chat = await openChat()
    await chat.shortcut('quickExplainLatestError')
    chat.userScroll(chat.bottom())
    chat.fail(new Error('Controlled shortcut failure'))
    await flushPromises()
    expect(chat.viewport.lastElementChild?.textContent).toContain('Controlled shortcut failure')
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
  })

  it('快捷回复期间主动上翻后保持阅读位置，回到底部后继续跟随', async () => {
    const chat = await openChat()
    await chat.shortcut('quickExplainLatestError')
    chat.userScroll(60)
    chat.writes.mockClear()
    chat.delta('排查第一步。')
    await nextTick()
    expect(chat.viewport.scrollTop).toBe(60)
    expect(chat.writes).not.toHaveBeenCalled()
    chat.userScroll(chat.bottom())
    chat.complete(response('排查第一步。最终检查结果。'))
    await flushPromises()
    expect(chat.viewport.lastElementChild?.textContent).toContain('最终检查结果')
    expect(chat.viewport.scrollTop).toBe(chat.bottom())
  })

  it('不将独立的设计工作流操作改成聊天，也不改变其滚动位置', async () => {
    const chat = await openChat()
    planWorkflow.mockImplementation(() => new Promise<CopilotMessage>(() => {}))
    chat.userScroll(40)
    await chat.shortcut('quickDraftWorkflow')
    expect(planWorkflow).toHaveBeenCalledTimes(1)
    expect(stream).not.toHaveBeenCalled()
    expect(editCanvas).not.toHaveBeenCalled()
    expect(chat.viewport.scrollTop).toBe(40)
    expect(chat.writes).not.toHaveBeenCalled()
  })
})
