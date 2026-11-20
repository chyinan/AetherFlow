// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RunLogEntry } from '@/types/run'

type SubscribeRun = typeof import('@/services/realtime/realtimeClient')['realtimeClient']['subscribeRun']
const transport = vi.hoisted(() => ({ subscribeRun: vi.fn<SubscribeRun>(() => vi.fn()) }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: transport }))

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunConsole from './RunConsole.vue'

const oldAdapter = axiosInstance.defaults.adapter
const logs101 = '/workflow-instances/101/logs'
const events101 = '/workflow/runtime/events/101'
const runDto = (id: number) => ({
  id, definitionId: 7, workflowId: 'workflow-7', workflowName: '普通工作流', status: 'RUNNING', nodes: [],
})
const occurredAt = '2026-11-19T20:00:00Z'
const warning = '[data-testid="run-console-saved-logs-unavailable"]'
const historyLink = '[data-testid="run-console-log-history"]'
let wrapper: ReturnType<typeof mount> | undefined
let requests: string[]
let unavailable: Set<string>
let savedLogs: Record<string, Array<{ id: string; message: string; level: string; occurredAt: string }>>
let pendingFirstLog: Promise<void> | undefined

function serviceUnavailable(config: InternalAxiosRequestConfig) {
  return new AxiosError('受控读取失败', 'ERR_BAD_RESPONSE', config, undefined, {
    config, data: { code: 503, message: '受控读取失败' }, status: 503, statusText: 'Service Unavailable', headers: {},
  })
}

beforeEach(() => {
  requests = []
  unavailable = new Set()
  savedLogs = {}
  pendingFirstLog = undefined
  transport.subscribeRun.mockClear()
  i18n.global.locale.value = 'zh-CN'
  // 只替换 HTTP 传输；保留真实 API、拦截器、Pinia 与组件。
  axiosInstance.defaults.adapter = async config => {
    const url = config.url ?? ''
    if (config.method !== 'get') throw new Error(`非预期写入 ${config.method} ${url}`)
    requests.push(url)
    if (url === logs101 && pendingFirstLog) await pendingFirstLog
    if (unavailable.has(url)) throw serviceUnavailable(config)
    const id = url.includes('/102') ? 102 : 101
    let data: unknown
    if (url === '/workflow-instances') data = { total: 1, items: [runDto(101)] }
    else if (url === `/workflow-instances/${id}`) data = runDto(id)
    else if (url === `/workflow-instances/${id}/logs`) data = savedLogs[url] ?? []
    else if (url === `/workflow/runtime/observability/${id}`) data = { workflowId: String(id), runtimeState: 'RUNNING', progress: 0.42 }
    else if (url === `/workflow/runtime/events/${id}`) data = []
    else throw new Error(`非预期读取 ${url}`)
    return { config, data: { code: 0, success: true, data }, status: 200, statusText: 'OK', headers: {} }
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  useRunStore().stopRunRealtime()
  axiosInstance.defaults.adapter = oldAdapter
  i18n.global.locale.value = 'zh-CN'
})

async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workflows/:id', component: blank },
      { path: '/runs/:id', name: 'run-detail', component: blank },
    ],
  })
  await router.push('/workflows/workflow-7')
  wrapper = mount(RunConsole, { global: { plugins: [pinia, router, i18n] } })
  return { panel: wrapper, store: useRunStore(), router }
}

it('已保存日志持续返回 503 时，不将未知状态显示成暂无运行日志', async () => {
  unavailable.add(logs101)
  const { panel, store } = await render()

  await store.selectRunForWorkflow('workflow-7', 7)
  await flushPromises()

  expect(requests.filter(url => url === logs101)).toHaveLength(3)
  expect(store.currentRun?.progress).toBe(42)
  expect(store.logs).toEqual([])
  expect(store.realtimeRunId).toBe('run-101')
  expect(panel.text()).not.toContain('暂无运行日志')
  expect(panel.get(warning).text()).toBe('暂时无法读取已保存的日志，当前显示的内容可能不完整。')
  expect(panel.get(historyLink).attributes('href')).toBe('/runs/run-101')
})

it('保留同次运行已读和实时日志，警告与详情入口不会自动请求或导航', async () => {
  const { panel, store, router } = await render()
  const log = { id: 'saved-101', time: '20:00', occurredAt, level: 'info', message: '此前已读的运行日志' } satisfies RunLogEntry
  savedLogs[logs101] = [log]
  await store.selectRunForWorkflow('workflow-7', 7)
  unavailable.add(logs101)
  await store.selectRun('run-101', { skipList: true, prefetchedRun: store.currentRun!, refreshLogs: true })

  expect(requests.filter(url => url === logs101)).toHaveLength(4)
  const onLog = transport.subscribeRun.mock.calls.at(-1)?.[1].onLog
  expect(onLog).toBeTypeOf('function')
  onLog!({ ...log, id: 'live-101', message: '控制台打开期间的实时日志' })
  const beforeClick = requests.slice()
  await flushPromises()

  expect(panel.text()).toContain(log.message)
  expect(panel.text()).toContain('控制台打开期间的实时日志')
  expect(panel.get(warning).attributes('role')).toBe('status')
  expect(requests).toEqual(beforeClick)
  expect(router.currentRoute.value.path).toBe('/workflows/workflow-7')

  await panel.get(historyLink).trigger('click')
  await flushPromises()

  expect(router.currentRoute.value.path).toBe('/runs/run-101')
  expect(requests).toEqual(beforeClick)
  expect(transport.subscribeRun).toHaveBeenCalledTimes(2)
})

it.each([
  ['en-US', 'Saved logs are temporarily unavailable. Any logs shown here may be incomplete.', 'Open run details to retry'],
  ['ja-JP', '保存済みログを一時的に取得できません。表示されているログは不完全な可能性があります。', '実行詳細を開いて再試行'],
] as const)('%s 的日志缺失提示和恢复入口明确区分读取失败与空数据', async (locale, message, link) => {
  unavailable.add(logs101)
  i18n.global.locale.value = locale
  const { panel, store } = await render()
  await store.selectRunForWorkflow('workflow-7', 7)

  expect(panel.get(warning).text()).toBe(message)
  expect(panel.get(historyLink).text()).toBe(link)
  expect(panel.text()).not.toContain(i18n.global.t('runs.noLogs'))
})

it('读取完成后的真实空状态不显示失败或恢复入口', async () => {
  const { panel, store } = await render()
  await store.selectRunForWorkflow('workflow-7', 7)

  expect(requests.filter(url => url === logs101)).toHaveLength(1)
  expect(panel.text()).toContain('暂无运行日志')
  expect(panel.find(warning).exists()).toBe(false)
  expect(panel.find(historyLink).exists()).toBe(false)
})

it('待读取期间显示加载，不将尚未取得的日志说成空或失败', async () => {
  const { panel, store } = await render()
  let release!: () => void
  pendingFirstLog = new Promise<void>(resolve => { release = resolve })
  const retrieval = store.selectRunForWorkflow('workflow-7', 7)
  try {
    await flushPromises()
    expect(requests).toContain(logs101)
    expect(panel.text()).toContain('加载中')
    expect(panel.text()).not.toContain('暂无运行日志')
    expect(panel.find(warning).exists()).toBe(false)
  } finally {
    release()
    await retrieval
  }
})

it('另一运行、非日志故障及成功重读不沿用本次历史日志警告', async () => {
  unavailable.add(logs101)
  const { panel, store } = await render()
  await store.selectRunForWorkflow('workflow-7', 7)
  expect(store.logHistoryRetryByRunId['run-101']).toBe(true)

  await store.selectRun('run-102', { skipList: true })
  expect(panel.text()).toContain('run-102')
  expect(panel.text()).toContain('暂无运行日志')
  expect(panel.find(warning).exists()).toBe(false)
  expect(panel.find(historyLink).exists()).toBe(false)
  expect(store.logHistoryRetryByRunId['run-101']).toBe(true)

  unavailable.delete(logs101)
  unavailable.add(events101)
  savedLogs[logs101] = [{ id: 'saved-101', message: '重读确认的已保存记录', occurredAt, level: 'info' }]
  await store.selectRunForWorkflow('workflow-7', 7)

  expect(store.logHistoryRetryByRunId['run-101']).toBeUndefined()
  expect(store.error).toContain('HTTP 503')
  expect(panel.text()).toContain('重读确认的已保存记录')
  expect(panel.find(warning).exists()).toBe(false)
  expect(panel.find(historyLink).exists()).toBe(false)
})
