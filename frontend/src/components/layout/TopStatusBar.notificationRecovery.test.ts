// @vitest-environment jsdom
// 通知恢复回归：真实顶栏、Pinia和历史合并；通知API与实时订阅始终使用无网络内存替身。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const doubles = vi.hoisted(() => ({ list: vi.fn(), mark: vi.fn(), clear: vi.fn(), subscribe: vi.fn() }))
vi.mock('@/api/modules/notify', () => ({
  listNotificationMessages: doubles.list,
  markAllNotificationMessagesRead: doubles.mark,
  clearNotificationMessages: doubles.clear,
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeNotifications: doubles.subscribe } }))

import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import TopStatusBar from '@/components/layout/TopStatusBar.vue'

type RecordItem = { id: number; channel: string; eventType: string; payload: { title: string; message: string }; status: string; createdAt: string }
type LiveMessage = { channel: string; eventType: string; payload: { title: string; message: string }; occurredAt: string }
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const record = (id: number, status = 'UNREAD'): RecordItem => ({ id, channel: 'workflow', eventType: 'completed', payload: { title: `合成历史通知${id}`, message: `合成正常消息${id}` }, status, createdAt: `2026-10-16T10:0${id}:00.000Z` })
let releases: (() => void)[] = []
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function gate() { const d = deferred<void>(); releases.push(() => d.resolve()); return d }
let wrapper: VueWrapper | undefined
let server: RecordItem[]
let live: { onMessage: (message: LiveMessage) => void; onConnectionChange: (state: 'online' | 'offline' | 'reconnecting') => void }
let errors: string[]
let markFailure: boolean
let clearFailure: boolean
let markGate: ReturnType<typeof gate> | undefined
let clearGate: ReturnType<typeof gate> | undefined
const text = (key: string) => i18n.global.t(`notifications.${key}`)
const panel = () => document.querySelector<HTMLElement>('#notification-panel')
const panelText = () => panel()?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
const titles = () => [...(panel()?.querySelectorAll('article p.truncate') ?? [])].map(item => item.textContent)
function action(key: 'markAllRead' | 'clear') { return [...(panel()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => button.textContent?.trim() === text(key)) }
async function clickAction(key: 'markAllRead' | 'clear') { const button = action(key); if (!button) throw new Error(`缺少操作 ${key}`); button.click(); await flushPromises() }
async function toggle() { await wrapper!.get('[aria-controls="notification-panel"]').trigger('click'); await flushPromises() }
function emitLive(title = '写入确认后到达的新通知') { live.onMessage({ channel: 'workflow', eventType: 'completed', payload: { title, message: '合成实时正常消息' }, occurredAt: '2026-10-16T10:20:00.000Z' }) }
function observe(name: string, extra: Record<string, unknown> = {}) {
  const store = useUiStore()
  const entry = { name, server: copy(server), notifications: copy(store.notifications), unread: store.unreadNotificationCount,
    loading: store.notificationsLoading, listCalls: doubles.list.mock.calls.length, markCalls: doubles.mark.mock.calls.length,
    clearCalls: doubles.clear.mock.calls.length, errors: copy(errors), panelText: panelText(), titles: titles(), html: panel()?.outerHTML ?? '',
    actionEnabled: { mark: action('markAllRead') ? !action('markAllRead')!.disabled : null, clear: action('clear') ? !action('clear')!.disabled : null }, ...extra }
  return entry
}
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia); i18n.global.locale.value = 'zh-CN'
  const auth = useAuthStore()
  // 每项只有同一个正常普通USER初始化，无登录、身份切换或权限边界探测。
  auth.user = { id: 'notification-review-user', userId: 7, name: '合成普通用户', workspace: '合成工作区', role: 'operator', roles: ['operator'], rawRoles: ['USER'] }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<main />' } }] })
  await router.push('/home'); await router.isReady()
  wrapper = mount(TopStatusBar, { attachTo: document.body, global: { plugins: [pinia, router, i18n],
    config: { errorHandler: error => errors.push(error instanceof Error ? error.message : String(error)) },
    stubs: { AccountDropdown: { template: '<button>账户占位</button>' } } } })
  await flushPromises()
  return useUiStore()
}
beforeEach(() => {
  // Historical API returns newest first, matching the notify service orderByDesc(createdAt, id).
  localStorage.clear(); releases = []; errors = []; server = [record(2), record(1, 'READ')]
  markFailure = false; clearFailure = false; markGate = undefined; clearGate = undefined
  doubles.list.mockReset().mockImplementation(async () => copy(server))
  doubles.mark.mockReset().mockImplementation(async () => {
    if (markFailure) throw Object.assign(new Error('合成422：服务端明确拒绝全部已读'), { response: { status: 422 } })
    // 正常内存写入先提交，然后可控制ACK迟到；期间发来的新实时项不在该次提交快照中。
    server = server.map(item => ({ ...item, status: 'READ' }))
    if (markGate) await markGate.promise
  })
  doubles.clear.mockReset().mockImplementation(async () => {
    if (clearFailure) throw Object.assign(new Error('合成422：服务端明确拒绝清空'), { response: { status: 422 } })
    server = []
    if (clearGate) await clearGate.promise
  })
  doubles.subscribe.mockReset().mockImplementation((_user: unknown, callbacks: typeof live) => { live = callbacks; return () => undefined })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('本审查禁止真实fetch') }))
})
afterEach(async () => {
  releases.forEach(release => release()); await flushPromises()
  useUiStore().stopNotificationStream()
  wrapper?.unmount(); wrapper = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks()
})

describe('正常与既有合并契约对照', () => {
  it('成功历史读取后打开可见真实合成列表及未读数', async () => {
    const store = await setup(); await toggle()
    expect(titles()).toEqual(['合成历史通知2', '合成历史通知1']); expect(store.unreadNotificationCount).toBe(1)
    expect(doubles.list).toHaveBeenCalledTimes(2); expect(errors).toEqual([]); observe('正常历史打开')
  })
  it('成功空历史才展示真实空列表', async () => {
    server = []; await setup(); await toggle()
    expect(panelText()).toContain(text('empty')); expect(titles()).toEqual([]); observe('正常空历史')
  })
  it('全部已读成功使服务端与本地一致，关闭重开保持结果', async () => {
    const store = await setup(); await toggle(); await clickAction('markAllRead')
    expect(server.every(item => item.status === 'READ')).toBe(true); expect(store.unreadNotificationCount).toBe(0)
    await toggle(); await toggle(); expect(store.unreadNotificationCount).toBe(0); expect(titles()).toHaveLength(2); observe('正常已读重开')
  })
  it('清空成功使服务端与本地一致，关闭重开仍为空', async () => {
    const store = await setup(); await toggle(); await clickAction('clear')
    expect(server).toEqual([]); expect(store.notifications).toEqual([]); expect(panelText()).toContain(text('empty'))
    await toggle(); await toggle(); expect(titles()).toEqual([]); expect(doubles.clear).toHaveBeenCalledTimes(1); observe('正常清空重开')
  })
  it('刷新失败保留已显示历史，关闭重开读取可恢复', async () => {
    const store = await setup(); doubles.list.mockRejectedValueOnce(new Error('合成历史读取失败')); await toggle()
    expect(titles()).toHaveLength(2); expect(store.unreadNotificationCount).toBe(1); expect(store.notificationsLoading).toBe(false)
    server = [record(3)]; await toggle(); await toggle(); expect(titles()).toEqual(['合成历史通知3']); observe('有缓存刷新失败及重开恢复')
  })
  it('正常历史替换旧后端记录，同时保留新实时项及本地连接合成项', async () => {
    const store = await setup(); await toggle(); emitLive('历史刷新期间的合成实时项'); live.onConnectionChange('offline')
    server = [record(3)]; await store.loadNotificationMessages(); await nextTick()
    expect(store.notifications.map(item => item.id).filter(id => id.startsWith('record-'))).toEqual(['record-3'])
    expect(store.notifications.some(item => item.title === '历史刷新期间的合成实时项')).toBe(true)
    expect(store.notifications.some(item => item.messageKey === 'notifications.connectionIssue')).toBe(true)
    server = []; await store.loadNotificationMessages(); await nextTick()
    expect(store.notifications).toHaveLength(2); expect(titles()).toContain('历史刷新期间的合成实时项'); observe('正常合并保持非后端项')
  })
})

describe('失败结果与可恢复操作', () => {
  it('全部已读被明确拒绝时保留未读事实并显示可重试失败', async () => {
    const store = await setup(); await toggle(); markFailure = true; await clickAction('markAllRead')
    const failed = observe('全部已读明确拒绝')
    expect.soft(server[0]!.status).toBe('UNREAD'); expect.soft(store.unreadNotificationCount).toBe(1)
    expect.soft(panelText()).toMatch(/失败|未完成|重试/)
    markFailure = false; await clickAction('markAllRead'); expect(store.unreadNotificationCount).toBe(0)
    expect(doubles.mark).toHaveBeenCalledTimes(2); observe('全部已读显式重试成功', { originalUnread: failed.unread })
  })
  it('清空被明确拒绝时保留列表和直接重试入口，重开可再读取', async () => {
    const store = await setup(); await toggle(); clearFailure = true; await clickAction('clear')
    observe('清空明确拒绝')
    expect.soft(server).toHaveLength(2); expect.soft(store.notifications).toHaveLength(2)
    expect.soft(titles()).toHaveLength(2); expect.soft(panelText()).toMatch(/失败|未完成|重试/)
    expect.soft(Boolean(action('clear')) || /重试/.test(panelText())).toBe(true)
    clearFailure = false; await toggle(); await toggle(); expect(titles()).toHaveLength(2)
    await clickAction('clear'); expect(server).toEqual([]); expect(store.notifications).toEqual([]); observe('清空失败重开再试成功')
  })
  it('冷启动等待和历史失败区别于确实无消息，并能重开恢复', async () => {
    server = []; const loading = gate(); doubles.list.mockImplementation(async () => { await loading.promise; throw new Error('合成历史暂不可用') })
    const store = await setup(); await toggle(); const pending = observe('冷启动读取等待')
    expect.soft(store.notificationsLoading).toBe(true); expect.soft(panelText()).toMatch(/加载|正在|读取/)
    expect.soft(panelText()).not.toContain(text('empty'))
    loading.resolve(); await flushPromises(); const failed = observe('冷启动读取失败')
    expect.soft(panelText()).toMatch(/失败|不可用|重试/); expect.soft(panelText()).not.toContain(text('empty'))
    doubles.list.mockResolvedValue([record(3)]); await toggle(); await toggle()
    expect(titles()).toEqual(['合成历史通知3']); observe('冷启动失败重开恢复', { pending: pending.panelText, failed: failed.panelText })
  })
  it.each(['markAllRead', 'clear'] as const)('%s 等待时重复点击只有一个内存写请求，并向用户说明正在处理', async key => {
    await setup(); await toggle(); const waiting = gate()
    if (key === 'markAllRead') markGate = waiting; else clearGate = waiting
    await clickAction(key); await clickAction(key); observe(`${key}在途重复点击`)
    const fn = key === 'markAllRead' ? doubles.mark : doubles.clear
    expect.soft(fn).toHaveBeenCalledTimes(1)
    expect.soft(action(key)?.disabled === true || /处理中|正在|清空中|标记中/.test(panelText())).toBe(true)
    waiting.resolve(); await flushPromises(); observe(`${key}重复点击后确认完成`)
  })
})

describe('写入和迟到读取', () => {
  it('旧历史在全部已读确认并重开后返回，不能把成功已读回滚成未读', async () => {
    const store = await setup(); await toggle(); const stale = copy(server); const waiting = deferred<RecordItem[]>(); releases.push(() => waiting.resolve(stale))
    doubles.list.mockImplementationOnce(() => waiting.promise); const read = store.loadNotificationMessages()
    await clickAction('markAllRead'); expect(store.unreadNotificationCount).toBe(0)
    await toggle(); await toggle(); expect(store.unreadNotificationCount).toBe(0)
    waiting.resolve(stale); await read; await nextTick(); observe('旧历史覆盖已读确认后的重开')
    expect(store.unreadNotificationCount).toBe(0)
  })
  it('旧历史在清空确认并重开后返回，不能复活已经成功清空的记录', async () => {
    const store = await setup(); await toggle(); const stale = copy(server); const waiting = deferred<RecordItem[]>(); releases.push(() => waiting.resolve(stale))
    doubles.list.mockImplementationOnce(() => waiting.promise); const read = store.loadNotificationMessages()
    await clickAction('clear'); expect(store.notifications).toEqual([])
    await toggle(); await toggle(); expect(store.notifications).toEqual([])
    waiting.resolve(stale); await read; await nextTick(); observe('旧历史复活清空确认后的重开')
    expect(server).toEqual([]); expect(store.notifications).toEqual([]); expect(titles()).toEqual([])
  })
  it('打开触发的新读取已显示后，挂载时更旧的读取不能覆盖较新列表', async () => {
    const oldSnapshot = copy(server); const old = deferred<RecordItem[]>(); releases.push(() => old.resolve(oldSnapshot))
    doubles.list.mockImplementationOnce(() => old.promise); const store = await setup()
    server = [record(3)]; await toggle(); expect(titles()).toEqual(['合成历史通知3'])
    const latest = observe('最新历史先返回', { olderPending: true }); old.resolve(oldSnapshot); await flushPromises(); observe('挂载旧历史晚到', { latestTitles: latest.titles })
    expect(store.notifications.map(item => item.id)).toEqual(['record-3']); expect(titles()).toEqual(['合成历史通知3'])
  })
  it.each(['markAllRead', 'clear'] as const)('%s 服务端已提交而ACK迟到时，新实时通知保持存在且未读', async key => {
    const store = await setup(); await toggle(); const waiting = gate()
    if (key === 'markAllRead') markGate = waiting; else clearGate = waiting
    await clickAction(key); emitLive(); await nextTick(); const fresh = store.notifications.find(item => item.title === '写入确认后到达的新通知')!
    expect(fresh.read).toBe(false); observe(`${key}已提交ACK前新实时项`, { commitBeforeLive: true })
    waiting.resolve(); await flushPromises(); observe(`${key}迟到ACK后的新实时项`, { freshId: fresh.id })
    const retained = store.notifications.find(item => item.id === fresh.id)
    expect(retained).toBeDefined(); expect(retained?.read).toBe(false); expect(titles()).toContain('写入确认后到达的新通知')
  })
})


describe('恢复入口与请求边界', () => {
  it('首次历史失败后可以在当前面板显式重试读取', async () => {
    doubles.list.mockRejectedValue(new Error('合成读取拒绝'))
    await setup(); await toggle()
    expect(panelText()).not.toContain(text('empty'))
    doubles.list.mockResolvedValue([record(3)])
    const retry = [...panel()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === text('retryLoad'))
    expect(retry).toBeDefined(); retry!.click(); await flushPromises()
    expect(titles()).toEqual(['合成历史通知3'])
    expect(useUiStore().notificationLoadError ?? false).toBe(false)
  })
  it('清空明确失败后原动作重试只再次派发清空', async () => {
    await setup(); await toggle(); clearFailure = true; await clickAction('clear')
    expect(titles()).toHaveLength(2)
    const retry = [...panel()!.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === text('retryAction'))
    expect(retry).toBeDefined(); clearFailure = false; retry!.click(); await flushPromises()
    expect(doubles.clear).toHaveBeenCalledTimes(2); expect(doubles.mark).not.toHaveBeenCalled()
    expect(titles()).toEqual([]); expect(panelText()).toContain(text('empty'))
  })
  it.each(['markAllRead', 'clear'] as const)('%s 在途时store也互斥另一个写动作，不能靠绕过按钮重复派发', async key => {
    const store = await setup(); await toggle(); const waiting = gate()
    if (key === 'markAllRead') markGate = waiting; else clearGate = waiting
    const first = key === 'markAllRead' ? store.markAllNotificationsRead() : store.clearNotifications()
    await Promise.resolve()
    const repeated = [store.markAllNotificationsRead(), store.clearNotifications()]
    const dispatched = { mark: doubles.mark.mock.calls.length, clear: doubles.clear.mock.calls.length }
    waiting.resolve(); await Promise.all([first, ...repeated])
    expect(dispatched.mark).toBe(key === 'markAllRead' ? 1 : 0)
    expect(dispatched.clear).toBe(key === 'clear' ? 1 : 0)
  })
  it.each(['markAllRead', 'clear'] as const)('%s 在途不发新GET，完成后新的历史仍有权替换本地结果', async key => {
    const store = await setup(); await toggle(); const waiting = gate()
    if (key === 'markAllRead') markGate = waiting; else clearGate = waiting
    const writing = key === 'markAllRead' ? store.markAllNotificationsRead() : store.clearNotifications()
    const calls = doubles.list.mock.calls.length
    await store.loadNotificationMessages(); expect(doubles.list).toHaveBeenCalledTimes(calls)
    waiting.resolve(); await writing
    server = [record(3)]; await store.loadNotificationMessages(); await nextTick()
    expect(titles()).toEqual(['合成历史通知3']); expect(store.unreadNotificationCount).toBe(1)
  })
  it.each(['markAllRead', 'clear'] as const)('%s 确认后无需重开也拒绝写前旧GET', async key => {
    const store = await setup(); await toggle(); const stale = copy(server); const old = deferred<RecordItem[]>()
    releases.push(() => old.resolve(stale)); doubles.list.mockImplementationOnce(() => old.promise)
    const reading = store.loadNotificationMessages()
    await clickAction(key); old.resolve(stale); await reading; await nextTick()
    expect(store.unreadNotificationCount).toBe(0)
    expect(titles()).toHaveLength(key === 'markAllRead' ? 2 : 0)
    expect(store.notificationsLoading).toBe(false)
  })
  it('旧读取的失败不能覆盖较新成功读取或显示过时错误', async () => {
    const store = await setup(); const old = deferred<RecordItem[]>()
    releases.push(() => old.resolve([])); doubles.list.mockImplementationOnce(() => old.promise)
    const first = store.loadNotificationMessages().catch(() => undefined)
    server = [record(3)]; await store.loadNotificationMessages()
    old.reject(new Error('合成旧读取失败')); await first; await toggle()
    expect(titles()).toEqual(['合成历史通知3']); expect(store.notificationLoadError ?? false).toBe(false)
    expect(panelText()).not.toContain(text('loadFailed'))
  })
  it('旧读取结束不能提前结束最新读取的等待状态', async () => {
    const store = await setup(); const older = gate(); const latest = gate()
    doubles.list.mockImplementationOnce(async () => { await older.promise; return [] })
      .mockImplementationOnce(async () => { await latest.promise; return [record(3)] })
    const first = store.loadNotificationMessages(); const second = store.loadNotificationMessages()
    older.resolve(); await first; expect(store.notificationsLoading).toBe(true)
    latest.resolve(); await second; expect(store.notificationsLoading).toBe(false)
    expect(store.notifications.map(item => item.id)).toEqual(['record-3'])
  })
  it('缓存写入不可用不会把已确认服务端写入改报为操作失败', async () => {
    const store = await setup(); await toggle()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('合成缓存已满') })
    await clickAction('markAllRead')
    expect(server.every(item => item.status === 'READ')).toBe(true)
    expect(store.unreadNotificationCount).toBe(0); expect(errors).toEqual([])
    expect(store.notificationMutationError ?? null).toBeNull()
    expect(store.notificationMutation ?? null).toBeNull()
  })
  it('同ID连接合成项在写等待时被新状态替换，旧ACK不标读这次新事件', async () => {
    const store = await setup(); await toggle(); live.onConnectionChange('offline')
    const original = store.notifications.find(item => item.source === 'realtime')!
    const waiting = gate(); markGate = waiting
    const writing = store.markAllNotificationsRead(); await Promise.resolve()
    live.onConnectionChange('online')
    const renewed = store.notifications.find(item => item.id === original.id)!
    expect(renewed.messageKey).toBe('notifications.realtimeRestored')
    waiting.resolve(); await writing; expect(renewed.read).toBe(false)
    expect(store.notifications.find(item => item.id === original.id)?.read).toBe(false)
  })
})
