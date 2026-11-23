// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { axiosInstance } from '@/api/client/apiClient'
import type { ProviderRuntimeLogEntry } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import MonitorPage from './MonitorPage.vue'

// 固定管理页呈现身份；治理模块空替身。真实 Axios 只允许下列合成运行指标及提供商事件 GET。
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAdmin: true, user: { id: 'monitor-presentation-only', rawRoles: ['ADMIN'] } }),
}))
vi.mock('@/api/modules/governance', () => ({
  governanceResourceKeys: [],
  getGovernanceSnapshot: vi.fn(async () => ({ resources: {} })),
}))

const defaultAdapter = axiosInstance.defaults.adapter
const initialLocale = i18n.global.locale.value
const events: ProviderRuntimeLogEntry[] = [
  { id: 'event-a', time: '2026-11-21T00:00:00Z', attempt: 1, provider: 'SYNTHETIC_A',
    eventType: 'SUCCESS', level: 'info', message: '合成事件甲', latencyMillis: 60, metadata: { estimatedCostUsd: '0.001' } },
  { id: 'event-b', time: '2026-11-21T00:01:00Z', attempt: 1, provider: 'SYNTHETIC_B',
    eventType: 'ERROR', level: 'error', message: '合成事件乙', latencyMillis: 100 },
]
let wrapper: VueWrapper | undefined
let requests: Array<string>
let pathRejected = vi.fn()
let logReply: (config: InternalAxiosRequestConfig) => unknown | Promise<unknown>
let metricsUnavailable: boolean
let release: Array<() => void>

function unavailable(config: InternalAxiosRequestConfig) {
  return new AxiosError('正常服务暂时不可用', 'ERR_BAD_RESPONSE', config, undefined, {
    data: { code: 503, message: 'Service unavailable' }, status: 503,
    statusText: 'Service Unavailable', headers: {}, config,
  })
}

function holdLogs() {
  let resolve!: (payload: unknown) => void
  let reject!: (reason: unknown) => void
  const wait = new Promise<unknown>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  const setSuccess = (logs: ProviderRuntimeLogEntry[]) => { logReply = () => ({ logs }); resolve({ logs }) }
  const setFailure = () => {
    logReply = (config) => { throw unavailable(config) }
    // 第一次尝试仍走同一真实 Axios 拦截器，并使用正确的请求配置。
    reject('pending logs unavailable')
  }
  logReply = async (config) => {
    try { return await wait } catch { throw unavailable(config) }
  }
  release.push(() => resolve({ logs: [] }))
  return { setSuccess, setFailure }
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/monitor', component: MonitorPage },
    { path: '/home', component: { template: '<div />' } },
    { path: '/models', component: { template: '<div />' } },
  ] })
  await router.push('/monitor')
  await router.isReady()
  wrapper = mount(MonitorPage, { attachTo: document.body, global: { plugins: [createPinia(), router, i18n] } })
  await flushPromises()
  return wrapper
}

const stream = () => wrapper!.get('.monitor-event-stream')
const streamHeader = () => stream().element.previousElementSibling!.textContent?.replace(/\s+/g, ' ') ?? ''
const eventCount = (count: number) => i18n.global.t('monitor.eventCount', { count })
const successful = (count: number) => new RegExp(`\\b${count}\\s*${i18n.global.t('monitor.successful')}`)
const logReads = () => requests.filter(path => path === '/ai/provider/logs').length
const refresh = () => wrapper!.get('header button')

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  requests = []
  pathRejected = vi.fn()
  metricsUnavailable = false
  release = []
  logReply = () => ({ logs: events })
  axiosInstance.defaults.adapter = async config => {
    requests.push(config.url ?? '')
    let data: unknown
    if (config.method !== 'get') {
      pathRejected(config.method, config.url)
      throw new Error('测试只允许合成监控 GET')
    }
    switch (config.url) {
      case '/ai/provider/logs':
        data = await logReply(config)
        break
      case '/ai/provider/metrics':
        if (metricsUnavailable) throw unavailable(config)
        data = { metrics: { SYNTHETIC_A: { calls: 2, failures: 1, maxLatencyMillis: 100 } } }
        break
      case '/workflow/runtime/metrics':
        data = { currentWorkflowCount: 1 }
        break
      default:
        pathRejected(config.url)
        throw new Error(`监控呈现不允许请求其他路径：${config.url}`)
    }
    return { data: { code: 200, message: 'ok', data }, status: 200, statusText: 'OK', headers: {}, config }
  }
})

afterEach(async () => {
  wrapper?.unmount()
  wrapper = undefined
  for (const finish of release) finish()
  await flushPromises()
  axiosInstance.defaults.adapter = defaultAdapter
  i18n.global.locale.value = initialLocale
  expect(pathRejected).not.toHaveBeenCalled()
})

describe('平台状态：服务事件读取可信度', () => {
  it('首次读取等待，事件流不虚报零事件或零成功', async () => {
    const pending = holdLogs()
    await render()
    try {
      expect(logReads()).toBe(2)
      expect(stream().text()).not.toContain(eventCount(0))
      expect(streamHeader()).not.toMatch(successful(0))
      expect(stream().text()).toContain('正在获取服务事件')
    } finally { pending.setSuccess([]); await flushPromises() }
  })

  it('日志 503 重试耗尽后明确未知，显式刷新收到空列表才报零', async () => {
    logReply = config => { throw unavailable(config) }
    await render()
    await vi.waitFor(() => expect(refresh().attributes('disabled')).toBeUndefined(), { timeout: 1700 })
    expect(logReads()).toBe(6)
    expect(stream().text()).not.toContain(eventCount(0))
    expect(streamHeader()).not.toMatch(successful(0))
    expect(stream().text()).toContain('服务事件暂时无法确认，请使用“刷新平台状态”重试')
    expect(stream().text()).not.toContain('当前没有服务事件')
    logReply = () => ({ logs: [] })
    await refresh().trigger('click')
    await flushPromises()
    expect(logReads()).toBe(8)
    expect(stream().text()).toContain(eventCount(0))
    expect(streamHeader()).toMatch(successful(0))
    expect(stream().text()).toContain('当前没有服务事件')
  })

  it('刷新等待保留原条目和 Trace，旧数量有上次读取标记；失败后和成功空分开', async () => {
    const page = await render()
    const oldB = page.get('[data-event-id="event-b"]')
    ;(oldB.element as HTMLButtonElement).focus()
    await oldB.trigger('click')
    expect(page.get('#monitor-selected-trace').text()).toContain('event-b')
    const pending = holdLogs()
    await refresh().trigger('click')
    await flushPromises()
    try {
      expect(stream().text()).toContain(eventCount(2))
      expect(stream().text()).toContain('上次读取')
      expect(stream().text()).toContain('正在获取服务事件')
      expect(page.get('[data-event-id="event-b"]').element).toBe(oldB.element)
      expect(document.activeElement).toBe(oldB.element)
      expect(page.get('#monitor-selected-trace').text()).toContain('event-b')
    } finally {
      pending.setFailure()
      await vi.waitFor(() => expect(refresh().attributes('disabled')).toBeUndefined(), { timeout: 1700 })
    }
    expect(logReads()).toBe(8)
    expect(stream().text()).not.toContain(eventCount(0))
    expect(stream().text()).not.toContain('当前没有服务事件')
    expect(page.find('#monitor-selected-trace').exists()).toBe(false)
    logReply = () => ({ logs: events })
    await refresh().trigger('click')
    await flushPromises()
    expect(logReads()).toBe(10)
    expect(stream().text()).toContain(eventCount(2))
    expect(stream().text()).not.toContain('上次读取')
    expect(page.get('#monitor-selected-trace').text()).toContain('event-b')
  })

  it('旧空快照刷新时明确其零是上次结果，确认后才恢复现在的空状态', async () => {
    logReply = () => ({ logs: [] })
    await render()
    expect(stream().text()).toContain(eventCount(0))
    const pending = holdLogs()
    await refresh().trigger('click')
    await flushPromises()
    try {
      expect(stream().text()).toContain(eventCount(0))
      expect(stream().text()).toContain('上次读取')
      expect(stream().text()).not.toContain('当前没有服务事件')
    } finally { pending.setSuccess([]) }
    await flushPromises()
    expect(stream().text()).toContain('当前没有服务事件')
    expect(stream().text()).not.toContain('上次读取')
  })

  it('独立指标读取失败时，有效事件数、成功数与 Trace 仍然可用', async () => {
    metricsUnavailable = true
    const page = await render()
    await vi.waitFor(() => expect(refresh().attributes('disabled')).toBeUndefined(), { timeout: 1700 })
    expect(logReads()).toBe(2)
    expect(stream().text()).toContain(eventCount(2))
    expect(streamHeader()).toMatch(successful(1))
    expect(page.get('#monitor-selected-trace').text()).toContain('event-b')
    expect(page.text()).toContain('部分服务遥测暂时不可用')
  })

  it.each([
    ['en-US', 'Count not confirmed', 'Service events are not confirmed'],
    ['ja-JP', '件数は未確認', 'サービスイベントの状態は未確認'],
  ] as const)('日志失败使用 %s 本地化未知与重试提示', async (locale, unknown, help) => {
    i18n.global.locale.value = locale
    logReply = config => { throw unavailable(config) }
    await render()
    await vi.waitFor(() => expect(refresh().attributes('disabled')).toBeUndefined(), { timeout: 1700 })
    expect(stream().text()).toContain(unknown)
    expect(stream().text()).toContain(help)
    expect(stream().text()).not.toContain(eventCount(0))
  })
})
