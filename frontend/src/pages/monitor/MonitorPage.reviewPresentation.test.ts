// @vitest-environment jsdom
// 固定管理界面的受控呈现测试；不加载真实身份、治理来源或服务接口。
// 原生按钮及程序化焦点检查不等于真实 Tab、Enter、Space 或视觉验收。
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { ConversationLog } from '@/types/dify'

const mocks = vi.hoisted(() => ({
  auth: Object.freeze({ isAdmin: true, user: Object.freeze({ id: 'presentation-only', rawRoles: Object.freeze(['ADMIN']) }) }),
  metrics: vi.fn(), logs: vi.fn(), governance: vi.fn(),
  forbidden: vi.fn(() => { throw new Error('呈现测试禁止真实网络及其他业务动作') }),
}))

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/api/modules/governance', () => ({ governanceResourceKeys: [], getGovernanceSnapshot: mocks.governance }))
vi.mock('@/services/api/difyApi', () => ({ difyApi: new Proxy({
  listMonitorMetrics: mocks.metrics, listConversationLogs: mocks.logs,
}, { get(target, property) { return Reflect.has(target, property) ? Reflect.get(target, property) : mocks.forbidden } }) }))
vi.mock('@/api/client', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))

import { i18n } from '@/i18n'
import MonitorPage from './MonitorPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
let releases: Array<() => void> = []
const compact = (value: string) => value.replace(/\s+/g, '')
const text = (key: string) => i18n.global.t(`monitor.${key}`)

function log(overrides: Partial<ConversationLog> = {}): ConversationLog {
  return {
    id: 'trace-alpha', time: '2026-10-17T18:00:00Z', app: '复核事件甲', user: 'sample-service',
    channel: 'api', intent: '甲服务需要检查', status: 'failed', tokens: null, cost: '--',
    feedback: 'none', reviewRequired: true, reviewReason: '甲服务失败需要核对', latencyMs: 3500,
    ...overrides,
  }
}

function logs() {
  return [log(), log({ id: 'trace-beta', app: '复核事件乙', intent: '乙服务采样记录',
    reviewReason: '乙服务采样需要核对', status: 'success', latencyMs: 240,
  }), log({ id: 'trace-normal', app: '普通事件丙', intent: '普通服务事件',
    reviewRequired: false, reviewReason: undefined, status: 'running', latencyMs: 100,
  })]
}

function pendingLogs() {
  let resolve!: (value: ConversationLog[]) => void
  const promise = new Promise<ConversationLog[]>((finish) => { resolve = finish })
  releases.push(() => resolve([]))
  return { promise, resolve }
}

async function renderPage() {
  wrapper = mount(MonitorPage, { attachTo: document.body, global: {
    plugins: [i18n], stubs: { RouterLink: { template: '<a href="#local-navigation"><slot /></a>' } },
  } })
  await flushPromises()
  return wrapper
}

// 基线反例只使用既有标题与内容，不依赖修复后新增的测试标识。
function existingQueue() {
  const heading = wrapper!.findAll('p,h2').find((entry) => entry.text() === text('reviewTitle'))
  expect(heading).toBeDefined()
  const section = heading!.element.closest('section')
  expect(section).not.toBeNull()
  return section!
}

function queue() { return wrapper!.get('[data-testid="monitor-review-queue"]') }
function trace() { return wrapper!.get('#monitor-selected-trace') }
function review(id: string) { return wrapper!.get(`button[data-review-id="${id}"]`) }
function event(id: string) { return wrapper!.get(`button[data-event-id="${id}"]`) }
function refresh() {
  const button = wrapper!.get('header').findAll('button').find((entry) => entry.text() === ({
    'zh-CN': '刷新平台状态', 'en-US': 'Refresh platform status', 'ja-JP': '状態を更新',
  })[i18n.global.locale.value])
  expect(button).toBeDefined()
  return button!
}

beforeEach(() => {
  vi.clearAllMocks(); releases = []
  mocks.metrics.mockReset(); mocks.logs.mockReset(); mocks.governance.mockReset()
  i18n.global.locale.value = 'zh-CN'
  mocks.metrics.mockResolvedValue([])
  mocks.logs.mockResolvedValue(logs())
  mocks.governance.mockResolvedValue({ resources: {} })
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
})

it('既有人工复核入口属于默认可聚焦的原生按钮', async () => {
  await renderPage()
  const entry = [...existingQueue().querySelectorAll<HTMLElement>('article,button')]
    .find((element) => element.textContent?.includes('复核事件乙'))
  expect(entry).toBeDefined()
  expect(entry!.tabIndex).toBe(0)
  expect(entry!.tagName).toBe('BUTTON')
  expect((entry as HTMLButtonElement).type).toBe('button')
  expect(entry!.className).toContain('focus-visible')
})

it('首次日志等待不能把未知待办报成零待复核或无结果', async () => {
  const pending = pendingLogs()
  mocks.logs.mockReturnValueOnce(pending.promise)
  await renderPage()
  const content = compact(existingQueue().textContent ?? '')
  expect(content).not.toContain(compact(`0${text('reviewQueue')}`))
  expect(content).not.toContain(compact(i18n.global.t('common.noResult')))
  expect(queue().attributes('aria-busy')).toBe('true')
  expect(queue().text()).toContain('正在获取待复核事件')
})

it('复核与事件入口的选中状态、受控区域和具名Trace对应同一事件', async () => {
  await renderPage()
  await review('trace-beta').trigger('click')
  expect(review('trace-beta').attributes('aria-pressed')).toBe('true')
  expect(event('trace-beta').attributes('aria-pressed')).toBe('true')
  expect(review('trace-alpha').attributes('aria-pressed')).toBe('false')
  expect(review('trace-beta').attributes('aria-controls')).toBe('monitor-selected-trace')
  expect(event('trace-beta').attributes('aria-controls')).toBe('monitor-selected-trace')
  expect(review('trace-beta').text()).toContain('已选中')
  expect(review('trace-beta').text()).toContain('乙服务采样需要核对')
  expect(trace().text()).toContain('trace-beta')
  expect(trace().text()).toContain('复核事件乙')
  expect(trace().text()).toContain('乙服务采样记录')
  expect(trace().get(`#${trace().attributes('aria-labelledby')}`).element.tagName).toBe('H2')
  expect(trace().get(`#${trace().attributes('aria-describedby')}`).text()).toContain('复核事件乙')
  expect(trace().get(`#${trace().attributes('aria-describedby')}`).text()).toContain('trace-beta')
})

it('重复选择及甲乙往返保留按钮焦点，不额外请求数据', async () => {
  await renderPage()
  for (const id of ['trace-beta', 'trace-beta', 'trace-alpha']) {
    const button = review(id)
    ;(button.element as HTMLButtonElement).focus()
    await button.trigger('click')
    expect(document.activeElement).toBe(button.element)
    expect(trace().text()).toContain(id)
  }
  expect(mocks.logs).toHaveBeenCalledTimes(1)
  expect(mocks.metrics).toHaveBeenCalledTimes(1)
  expect(mocks.governance).toHaveBeenCalledTimes(1)
})

it('选择普通事件会同步清除复核队列选中状态并显示该Trace', async () => {
  await renderPage()
  await event('trace-normal').trigger('click')
  expect(event('trace-normal').attributes('aria-pressed')).toBe('true')
  expect(queue().findAll('button[aria-pressed="true"]')).toHaveLength(0)
  expect(trace().text()).toContain('trace-normal')
  expect(trace().text()).toContain('普通服务事件')
})

it('长复核原因、来源与完整Trace标识在DOM中保留', async () => {
  const id = `trace-${'long-id-'.repeat(35)}`
  const reason = `待复核原因${'详细上下文'.repeat(50)}`
  mocks.logs.mockResolvedValueOnce([log({ id, reviewReason: reason })])
  await renderPage()
  expect(review(id).text()).toContain(reason)
  expect(review(id).text()).toContain('sample-service')
  expect(review(id).text()).toContain('api')
  expect(review(id).text()).toContain('3500ms')
  await review(id).trigger('click')
  expect(trace().text()).toContain(id)
})

it('首次日志失败显示未知及局部恢复提示，不报成功空队列', async () => {
  mocks.logs.mockRejectedValueOnce(new Error('合成日志不可用'))
  await renderPage()
  expect(queue().get('[data-testid="review-count"]').text()).toContain('数量待确认')
  expect(queue().text()).toContain('待复核状态暂时无法确认')
  expect(queue().text()).not.toContain('当前没有待复核事件')
  expect(queue().attributes('aria-busy')).toBe('false')
  expect(refresh().attributes('disabled')).toBeUndefined()
})

it('日志成功为空时才确认零待复核并显示明确空提示', async () => {
  mocks.logs.mockResolvedValueOnce([])
  await renderPage()
  expect(compact(queue().get('[data-testid="review-count"]').text())).toBe(compact(`0${text('reviewQueue')}`))
  expect(queue().text()).toContain('当前没有待复核事件')
  expect(queue().text()).not.toContain('数量待确认')
  expect(wrapper!.find('#monitor-selected-trace').exists()).toBe(false)
})

it('指标读取失败但日志成功时，复核队列仍是可信的已获取列表', async () => {
  mocks.metrics.mockRejectedValueOnce(new Error('合成指标不可用'))
  await renderPage()
  expect(queue().findAll('button[data-review-id]')).toHaveLength(2)
  expect(compact(queue().get('[data-testid="review-count"]').text())).toBe(compact(`2${text('reviewQueue')}`))
  expect(queue().text()).not.toContain('数量待确认')
  expect(queue().text()).not.toContain('待复核状态暂时无法确认')
})

it('有普通事件但无待复核时确认零，刷新中保留旧零与忙碌提示', async () => {
  const normal = logs().filter((entry) => !entry.reviewRequired)
  mocks.logs.mockResolvedValueOnce(normal)
  await renderPage()
  expect(compact(queue().get('[data-testid="review-count"]').text())).toBe(compact(`0${text('reviewQueue')}`))
  expect(queue().text()).toContain('当前没有待复核事件')
  expect(trace().text()).toContain('trace-normal')
  const pending = pendingLogs()
  mocks.logs.mockReturnValueOnce(pending.promise)
  await refresh().trigger('click')
  await flushPromises()
  expect(queue().attributes('aria-busy')).toBe('true')
  expect(compact(queue().get('[data-testid="review-count"]').text())).toBe(compact(`0${text('reviewQueue')}`))
  expect(queue().text()).toContain('正在刷新待复核事件')
  expect(trace().text()).toContain('trace-normal')
  pending.resolve(normal)
  await flushPromises()
  expect(queue().attributes('aria-busy')).toBe('false')
  expect(queue().text()).toContain('当前没有待复核事件')
  expect(trace().text()).toContain('trace-normal')
})

it('旧队列刷新中保留可选择项和忙碌提示，回执保留期间的新选择', async () => {
  await renderPage()
  const pending = pendingLogs()
  mocks.logs.mockReturnValueOnce(pending.promise)
  await refresh().trigger('click')
  await flushPromises()
  expect(queue().attributes('aria-busy')).toBe('true')
  expect(queue().text()).toContain('正在刷新待复核事件')
  expect(queue().findAll('button[data-review-id]')).toHaveLength(2)
  await review('trace-beta').trigger('click')
  expect(trace().text()).toContain('trace-beta')
  pending.resolve(logs())
  await flushPromises()
  expect(queue().attributes('aria-busy')).toBe('false')
  expect(review('trace-beta').attributes('aria-pressed')).toBe('true')
  expect(trace().text()).toContain('trace-beta')
})

it('刷新日志失败后显示未知，通过既有mock刷新恢复列表', async () => {
  await renderPage()
  mocks.logs.mockRejectedValueOnce(new Error('合成刷新失败'))
  await refresh().trigger('click')
  await flushPromises()
  expect(queue().get('[data-testid="review-count"]').text()).toContain('数量待确认')
  expect(queue().findAll('button[data-review-id]')).toHaveLength(0)
  expect(queue().text()).toContain('待复核状态暂时无法确认')
  expect(queue().text()).not.toContain('当前没有待复核事件')
  await refresh().trigger('click')
  await flushPromises()
  expect(queue().findAll('button[data-review-id]')).toHaveLength(2)
  expect(queue().text()).not.toContain('数量待确认')
  expect(trace().text()).toContain('trace-alpha')
  expect(mocks.logs).toHaveBeenCalledTimes(3)
})

it.each([
  ['zh-CN', '这里只查看，不会提交人工复核', '已选中', '当前没有待复核事件'],
  ['en-US', 'Viewing does not submit a manual review', 'Selected', 'No events need review'],
  ['ja-JP', '表示しても手動レビューは送信されません', '選択中', '確認待ちのイベントはありません'],
] as const)('%s 的查看说明、选中与空状态文案完整', async (locale, hint, selected, empty) => {
  i18n.global.locale.value = locale
  await renderPage()
  expect(queue().text()).toContain(hint)
  expect(review('trace-alpha').text()).toContain(selected)
  mocks.logs.mockResolvedValueOnce([])
  await refresh().trigger('click')
  await flushPromises()
  expect(queue().text()).toContain(empty)
  expect(queue().text()).not.toMatch(/undefined|reviewSelectionHint|reviewEmpty/)
})
