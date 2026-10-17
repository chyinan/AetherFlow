// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import AICopilotPanel from './AICopilotPanel.vue'

vi.mock('@/services/api/copilotApi', () => ({ copilotApi: { listConversations: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: { refreshSnapshot: vi.fn().mockResolvedValue({ providers: [], models: [] }) } }))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: {} }))
vi.mock('@/services/copilot/copilotConversationSession', () => ({
  UNCONFIRMED_CONVERSATION: 'unconfirmed', conversationSessionKey: () => 'presentation-session',
  readConversationSelection: () => 'new', writeConversationSelection: vi.fn(),
}))

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('展示测试禁止真实网络请求') }))
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('展示测试禁止真实网络请求') } })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.unstubAllGlobals() })

describe('Copilot输入区展示', () => {
  it('聊天输入和图标发送按钮具有完整名称', async () => {
    wrapper = mount(AICopilotPanel, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.get('form input').attributes('aria-label')).toBe(i18n.global.t('copilot.askPlaceholder'))
    expect(wrapper.get('button[type="submit"]').attributes('aria-label')).toBe('发送消息')
  })

  it('编辑模式输入保留与任务一致的名称', async () => {
    wrapper = mount(AICopilotPanel, { props: { applyCanvasEdit: vi.fn() }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.get('form input').attributes('aria-label')).toBe(i18n.global.t('copilot.editor.placeholder'))
    expect(wrapper.get('button[type="submit"]').attributes('aria-label')).toBe('发送消息')
  })
})
