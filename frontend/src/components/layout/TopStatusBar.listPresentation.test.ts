// @vitest-environment jsdom
// 仅检查固定普通用户界面中已保留消息的呈现；不加载真实store、通知流或API。
// 合成DOM、Escape事件与程序化焦点不代表真实滚动、键盘或视觉验收。
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { UiNotification } from '@/stores/uiStore'

interface FixtureUi {
  notifications: UiNotification[]
  readonly unreadNotificationCount: number
  notificationsLoading: boolean
  notificationLoadError: boolean
  notificationMutation: null
  notificationMutationError: null
  loadNotificationMessages: ReturnType<typeof vi.fn>
  startNotificationStream: ReturnType<typeof vi.fn>
  markAllNotificationsRead: ReturnType<typeof vi.fn>
  clearNotifications: ReturnType<typeof vi.fn>
  retryNotificationMutation: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  ui: undefined as FixtureUi | undefined,
  auth: Object.freeze({ isAdmin: false, workspace: '常规工作区', user: Object.freeze({ userId: 7 }) }),
  forbidden: vi.fn(() => { throw new Error('列表呈现测试禁止真实通知、网络及写操作') }),
}))

vi.mock('@/stores/uiStore', () => ({ useUiStore: () => mocks.ui }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('./AccountDropdown.vue', () => ({ default: { template: '<div data-testid="account-stub" />' } }))
vi.mock('@/api/modules/notify', () => ({
  listNotificationMessages: mocks.forbidden, clearNotificationMessages: mocks.forbidden,
  markAllNotificationMessagesRead: mocks.forbidden, issueNotifyStreamToken: mocks.forbidden,
  buildNotifyWebSocketUrl: mocks.forbidden,
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/services/realtime/notificationSocket', () => ({ createNotificationSocket: mocks.forbidden }))
vi.mock('@/api/client', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))

import { i18n } from '@/i18n'
import TopStatusBar from './TopStatusBar.vue'

let wrapper: ReturnType<typeof mount> | undefined
let ui: FixtureUi
let releases: Array<() => void> = []

function notifications(count: number): UiNotification[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `presentation-notice-${index + 1}`, title: `保留消息${index + 1}`,
    messageKey: 'notifications.connectionIssue', messageParams: { service: `service-${index + 1}` },
    statusKey: 'status.online', source: `source-${index + 1}`, time: `18:${String(index + 1).padStart(2, '0')}:00`,
    read: index % 3 === 0, tone: 'online',
  }))
}

async function renderHeader() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: { template: '<div />' } },
    { path: '/projects', component: { template: '<div />' } },
  ] })
  await router.push('/home'); await router.isReady()
  wrapper = mount(TopStatusBar, { attachTo: document.body, global: { plugins: [i18n, router] } })
  await flushPromises()
  return router
}

function trigger() { return wrapper!.get('button[aria-controls="notification-panel"]') }
function panel() {
  const element = document.getElementById('notification-panel')
  expect(element).not.toBeNull()
  return new DOMWrapper(element!)
}
async function open() { await trigger().trigger('click'); await flushPromises(); return panel() }

beforeEach(() => {
  vi.clearAllMocks(); releases = []
  i18n.global.locale.value = 'zh-CN'
  ui = reactive<FixtureUi>({
    notifications: notifications(20), notificationsLoading: false, notificationLoadError: false,
    notificationMutation: null, notificationMutationError: null,
    get unreadNotificationCount() { return this.notifications.filter((item: UiNotification) => !item.read).length },
    loadNotificationMessages: vi.fn(async () => undefined), startNotificationStream: vi.fn(),
    markAllNotificationsRead: mocks.forbidden, clearNotifications: mocks.forbidden,
    retryNotificationMutation: mocks.forbidden,
  })
  mocks.ui = ui
  vi.stubGlobal('fetch', mocks.forbidden)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    vi.stubGlobal(name, class { constructor() { mocks.forbidden() } })
  }
})

afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined
  for (const release of releases) release()
  await flushPromises()
  expect(mocks.forbidden).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  i18n.global.locale.value = 'zh-CN'
  document.body.innerHTML = ''
})

it('已保留12条消息时，原消息中心入口应呈现12条而非静默截断', async () => {
  ui.notifications = notifications(12)
  await renderHeader()
  const opened = await open()
  expect(ui.notifications).toHaveLength(12)
  expect(opened.findAll('article')).toHaveLength(12)
  expect(opened.text()).toContain('保留消息12')
})

it('有界20条的最后消息保留完整内容，仍使用原有内部滚动容器', async () => {
  const title = `保留消息20${'完整标题'.repeat(12)}`
  ui.notifications[19]!.title = title
  await renderHeader()
  const opened = await open()
  const items = opened.findAll('article')
  expect(items).toHaveLength(20)
  expect(items[19]!.text()).toContain(title)
  expect(items[19]!.text()).toContain('service-20')
  expect(items[19]!.text()).toContain('source-20')
  expect(items[19]!.text()).toContain('18:20:00')
  expect(opened.classes()).toContain('overflow-hidden')
  expect(opened.get('.overflow-y-auto').classes()).toContain('min-h-0')
})

it.each([0, 1, 10])('保留%s条时继续呈现全部条目或既有空提示', async (count) => {
  ui.notifications = notifications(count)
  await renderHeader()
  const opened = await open()
  expect(opened.findAll('article')).toHaveLength(count)
  if (count === 0) expect(opened.text()).toContain(i18n.global.t('notifications.empty'))
  else expect(opened.text()).not.toContain(i18n.global.t('notifications.empty'))
})

it.each([25, 100])('异常保留%s条时展示仍限制为前20条且不改原数组', async (count) => {
  ui.notifications = notifications(count)
  await renderHeader()
  const opened = await open()
  expect(ui.notifications).toHaveLength(count)
  expect(opened.findAll('article')).toHaveLength(20)
  expect(opened.findAll('article')[19]!.text()).toContain('保留消息20')
  expect(opened.text()).not.toContain('保留消息21')
})

it('合成更新后的有界20条全部跟随展示，不产生第二份10条视图', async () => {
  await renderHeader()
  const opened = await open()
  const next = notifications(1)[0]!
  next.id = 'presentation-notice-new'; next.title = '新合成消息'
  ui.notifications = [next, ...ui.notifications].slice(0, 20)
  await flushPromises()
  const items = opened.findAll('article')
  expect(items).toHaveLength(20)
  expect(items[0]!.text()).toContain('新合成消息')
  expect(items[19]!.text()).toContain('保留消息19')
  expect(opened.text()).not.toContain('保留消息20')
})

it('加载、读取失败及mock重新读取都保留已有20条展示', async () => {
  await renderHeader()
  const opened = await open()
  ui.notificationsLoading = true
  await flushPromises()
  expect(opened.attributes('aria-busy')).toBe('true')
  expect(opened.findAll('article')).toHaveLength(20)
  ui.notificationsLoading = false; ui.notificationLoadError = true
  await flushPromises()
  expect(opened.get('[role="alert"]').text()).toContain(i18n.global.t('notifications.loadFailed'))
  expect(opened.findAll('article')).toHaveLength(20)
  let finish!: () => void
  const pending = new Promise<void>((resolve) => { finish = resolve })
  releases.push(finish)
  ui.loadNotificationMessages.mockClear().mockImplementationOnce(() => {
    ui.notificationsLoading = true
    return pending.then(() => { ui.notificationsLoading = false; ui.notificationLoadError = false })
  })
  await opened.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(ui.loadNotificationMessages).toHaveBeenCalledTimes(1)
  expect(opened.findAll('article')).toHaveLength(20)
  finish(); await flushPromises()
  expect(opened.attributes('aria-busy')).toBe('false')
  expect(opened.findAll('article')).toHaveLength(20)
  expect(opened.find('[role="alert"]').exists()).toBe(false)
})

it('Escape恢复触发器、重新打开及路由关闭保持原有行为', async () => {
  const router = await renderHeader()
  await open()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(document.getElementById('notification-panel')).toBeNull()
  expect(document.activeElement).toBe(trigger().element)
  expect((await open()).findAll('article')).toHaveLength(20)
  await router.push('/projects'); await flushPromises()
  expect(document.getElementById('notification-panel')).toBeNull()
  expect(trigger().attributes('aria-expanded')).toBe('false')
})
