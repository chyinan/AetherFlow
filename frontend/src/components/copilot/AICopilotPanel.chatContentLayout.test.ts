// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import AICopilotPanel from './AICopilotPanel.vue'

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }))
vi.mock('@/services/api/copilotApi', () => ({ copilotApi: {
  listConversations: vi.fn().mockResolvedValue([]), stream,
} }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: {
  refreshSnapshot: vi.fn().mockResolvedValue({ providers: [], models: [] }),
} }))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: {} }))

const mediaUrl = `https://media.example.test/recordings/meeting.mp4?download=1&signature=${'0123456789abcdef'.repeat(4)}`
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  window.sessionStorage.clear()
  i18n.global.locale.value = 'en-US'
  stream.mockReset()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('正文展示测试禁止真实网络请求') }))
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('正文展示测试禁止真实网络请求') } })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals() })

async function send(content: string) {
  stream.mockResolvedValueOnce({ id: 'reply-1', role: 'assistant', content, createdAt: '04:00', conversationId: 'conv-11' })
  wrapper = mount(AICopilotPanel, { global: { plugins: [i18n] } })
  await flushPromises()
  await wrapper.get('textarea').setValue(`请总结 ${mediaUrl}`)
  await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return wrapper
}

describe('Copilot 长消息正文布局', () => {
  it('用户地址与助手正文允许长单词断行，保留链接和行内代码内容', async () => {
    const panel = await send(`处理 [原始录音](${mediaUrl})，然后检查 \`${mediaUrl}\`。`)
    const user = panel.get('article:nth-last-of-type(2) > p')
    const assistant = panel.get('article:last-of-type .copilot-markdown')
    // jsdom 不做排版；这里只锁定正文断行钩子，实际宽度由浏览器回归检查。
    expect(user.classes()).toContain('[overflow-wrap:anywhere]')
    expect(assistant.classes()).toContain('[overflow-wrap:anywhere]')
    expect(user.text()).toBe(`请总结 ${mediaUrl}`)
    expect(assistant.get('a').attributes('href')).toBe(mediaUrl)
    expect(assistant.get('code').text()).toBe(mediaUrl)
  })

  it('多行代码保持原文与缩进，不为修正文案换行而插入额外空格或换行', async () => {
    const code = `  ffmpeg -i "${mediaUrl}" -c copy output.mp4\n    --keep-this-indentation`
    const panel = await send(`\`\`\`text\n${code}\n\`\`\``)
    expect(panel.get('article:last-of-type pre code').element.textContent).toBe(code)
    expect(panel.get('article:last-of-type .copilot-markdown').classes()).toContain('[overflow-wrap:anywhere]')
    expect(stream).toHaveBeenCalledTimes(1)
  })
})
