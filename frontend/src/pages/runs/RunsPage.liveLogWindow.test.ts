// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import type { AxiosAdapter } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import LogStream from '@/components/run/LogStream.vue'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import type { RunLogEntry } from '@/types/run'
import RunsPage from './RunsPage.vue'

const { subscribeRun } = vi.hoisted(() => ({
  subscribeRun: vi.fn((_selection: { runId: string }, _callbacks: { onLog: (record: RunLogEntry) => void }) => vi.fn()),
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun } }))
vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }),
}))
vi.mock('@/stores/uiStore', () => ({
  useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }),
}))

let wrapper: ReturnType<typeof mount> | undefined
let archiveCount: number
const originalAdapter = axiosInstance.defaults.adapter
const archiveCalls: string[] = []
const at = (number: number) => new Date(Date.UTC(2025, 0, 1, 0, 0, number)).toISOString()
const run = (id: number) => ({ id, definitionId: 7, workflowName: `运行 ${id}`, status: 'RUNNING', nodes: [] })
function liveLog(number: number): RunLogEntry {
  return { id: `live-${number}`, time: '', occurredAt: at(number), level: 'info', message: `新的普通实时日志 ${number}` }
}

beforeEach(() => {
  subscribeRun.mockClear()
  archiveCalls.length = 0
  i18n.global.locale.value = 'zh-CN'
  archiveCount = 130
  const adapter: AxiosAdapter = async config => {
    if (config.method !== 'get') throw new Error(`unexpected write: ${config.method} ${config.url}`)
    const url = config.url!
    const id = url.includes('/102') ? 102 : 101
    let data: unknown
    if (url === '/workflow-instances') {
      data = { total: 2, items: [run(101), run(102)] }
    } else if (url === `/workflow-instances/${id}`) {
      data = run(id)
    } else if (url === `/workflow-instances/${id}/logs`) {
      archiveCalls.push(url)
      data = id === 101 ? Array.from({ length: archiveCount }, (_, index) => ({
        id: `saved-${index + 1}`, message: `已保存的普通日志 #${index + 1}#`, level: 'info', occurredAt: at(index + 1),
      })) : [{ id: 'other', message: '另一运行的日志', level: 'info', occurredAt: at(1) }]
    } else if (url === `/workflow/runtime/observability/${id}`) {
      data = { workflowId: String(id), runtimeState: 'RUNNING', progress: 0.42 }
    } else if (url === `/workflow/runtime/events/${id}`) {
      data = []
    } else {
      throw new Error(`unexpected read: ${url}`)
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: { code: 0, success: true, data } }
  }
  axiosInstance.defaults.adapter = adapter
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  useRunStore().stopRealtime()
  axiosInstance.defaults.adapter = originalAdapter
})

async function open() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/runs/:id', name: 'run-detail', component: RunsPage },
      { path: '/files', name: 'files', component: { template: '<div />' } },
    ],
  })
  await router.push('/runs/run-101')
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  const store = useRunStore()
  await flushPromises()
  expect(store.currentRun?.id).toBe('run-101')
  expect(store.logsLoading).toBe(false)
  expect(store.error).toBeNull()
  const panel = wrapper.getComponent(LogStream)
  const receive = (id: string) => subscribeRun.mock.calls.filter(([run]) => run.runId === id).at(-1)![1].onLog
  return { router, store, panel, receive }
}

it('收到一条实时日志只淘汰 100 条窗口的最旧一条，筛选、去重及重新进入仍读同一窗口', async () => {
  const { router, store, panel, receive } = await open()
  const input = panel.get('input')
  const archived = store.logs.map(log => log.id)
  expect(archived).toHaveLength(100)
  expect(archived.slice(0, 2)).toEqual(['saved-31', 'saved-32'])
  await input.setValue('#32#')
  expect(panel.text()).toContain('已保存的普通日志 #32#')

  const event = liveLog(131)
  const deliver = receive('run-101')
  deliver(event)
  deliver(event)
  await flushPromises()
  const expected = [...archived.slice(1), event.id]
  expect.soft(store.logs.map(log => log.id)).toEqual(expected)
  expect.soft(panel.text()).toContain('已保存的普通日志 #32#')
  expect.soft(panel.text()).not.toContain('没有符合当前筛选条件的日志')
  expect.soft(store.logsByRunId['run-101']?.map(log => log.id)).toEqual(expected)
  expect(input.element.value).toBe('#32#')
  expect(archiveCalls).toEqual(['/workflow-instances/101/logs'])

  // 更新订阅后旧运行的回调不会写入当前运行，返回也不需再读取归档。
  await router.push('/runs/run-102')
  await flushPromises()
  deliver(liveLog(132))
  expect(store.logs.map(log => log.id)).toEqual(['other'])
  await router.push('/runs/run-101')
  await flushPromises()
  expect.soft(store.logs.map(log => log.id)).toEqual(expected)
  expect.soft(panel.text()).toContain('已保存的普通日志 #32#')
  expect(archiveCalls).toEqual(['/workflow-instances/101/logs', '/workflow-instances/102/logs'])
})

it('归档不足 100 条时新增日志不提前丢弃任何可见记录', async () => {
  archiveCount = 90
  const { store, panel, receive } = await open()
  expect(store.logs).toHaveLength(90)
  await panel.get('input').setValue('#1#')
  expect(panel.text()).toContain('已保存的普通日志 #1#')
  const archived = store.logs.map(log => log.id)
  receive('run-101')(liveLog(91))
  await flushPromises()
  expect.soft(store.logs.map(log => log.id)).toEqual([...archived, 'live-91'])
  expect.soft(panel.text()).toContain('已保存的普通日志 #1#')
  expect.soft(panel.text()).not.toContain('没有符合当前筛选条件的日志')
})
