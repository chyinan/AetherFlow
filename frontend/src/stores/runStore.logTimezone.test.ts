// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ recoverRuntime: vi.fn(), getLogs: vi.fn(), subscribeRun: vi.fn(() => vi.fn()) }))
vi.mock('@/services/api/runApi', async original => {
  const module = await original<typeof import('@/services/api/runApi')>()
  return { ...module, runApi: { ...module.runApi, recoverRuntime: api.recoverRuntime, getLogs: api.getLogs } }
})
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: api.subscribeRun } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ addArtifactsFromRun: vi.fn(), markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/workflowStore', () => ({ useWorkflowStore: () => ({ workflowId: 'another-workflow', updateNodeStatus: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import LogStream from '@/components/run/LogStream.vue'
import { mapRuntimeEventToLogEntry } from '@/api/mappers/runtimeMapper'
import { setStoredLocale, setStoredTimezone } from '@/i18n/locale'
import { useRunStore } from '@/stores/runStore'
import type { RunLogEntry } from '@/types/run'

const occurredAt = '2026-10-16T20:34:05.000Z'
const time = (zone: string) => new Date(occurredAt).toLocaleTimeString('zh-CN', { hour12: false, timeZone: zone })
let wrapper: VueWrapper | undefined
function render(logs: RunLogEntry[]) {
  wrapper = mount(LogStream, { props: { logs, runId: 'run-73' }, global: { plugins: [createI18n({
    legacy: false, locale: 'zh-CN', messages: {}, missingWarn: false, fallbackWarn: false,
  })] } })
}
function createRun() {
  const store = useRunStore()
  store.createRunFromWorkflow({ runId: 'run-73', workflowId: 'workflow-73', workflowName: '固定工作流',
    nodes: [], backendInstanceId: 73, runtimeWorkflowId: '73', backendStatus: 'RUNNING' })
  return store
}

beforeEach(() => {
  localStorage.clear(); setStoredLocale('zh-CN'); setStoredTimezone('UTC')
  setActivePinia(createPinia()); vi.useFakeTimers(); vi.setSystemTime(new Date(occurredAt))
  api.recoverRuntime.mockReset(); api.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: [] })
  api.getLogs.mockReset(); api.subscribeRun.mockClear()
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime(); vi.useRealTimers(); localStorage.clear() })

describe('本地日志时间与缓存合并保持兼容', () => {
  it('正常运行创建提示保留同一原始时刻，缓存跨时区展示无需重跑', () => {
    const store = createRun()
    expect.soft(store.logs[0]).toMatchObject({ occurredAt, time: time('UTC') })
    const snapshot = JSON.parse(JSON.stringify(store.logs))
    setStoredTimezone('Asia/Tokyo'); render(store.logs)
    expect.soft(wrapper!.text()).toContain(time('Asia/Tokyo'))
    expect(store.logs).toEqual(snapshot)
    expect(store.currentRun?.status).toBe('running')
    expect(api.subscribeRun).toHaveBeenCalledTimes(1)
  })

  it('运行恢复失败提示保留原始时刻及错误正文', async () => {
    const store = createRun()
    api.recoverRuntime.mockRejectedValue(new Error('固定恢复错误'))
    await store.recoverCurrentRunRuntime()
    const log = store.logs.at(-1)!
    expect.soft(log).toMatchObject({ occurredAt, time: time('UTC'), level: 'warn' })
    expect(log.message).toContain('固定恢复错误')
    setStoredTimezone('Asia/Tokyo'); render([log])
    expect.soft(wrapper!.text()).toContain(time('Asia/Tokyo'))
    expect(wrapper!.text()).toContain('固定恢复错误')
  })

  it('刷新期间同 ID 的实时日志继续优先，原始时刻不被旧 HTTP 覆盖', async () => {
    const store = createRun()
    const live = mapRuntimeEventToLogEntry({ eventId: 'same-id', eventType: 'NODE_STARTED', workflowId: '73',
      traceId: 'trace-73', runtimeState: 'RUNNING', occurredAt, attributes: { message: '实时来源' } })
    store.logs = []; store.logsByRunId['run-73'] = store.logs
    let resolve!: (logs: RunLogEntry[]) => void
    api.getLogs.mockReturnValue(new Promise<RunLogEntry[]>(done => { resolve = done }))
    const refresh = store.selectRun('run-73', { refreshLogs: true, skipList: true, prefetchedRun: store.currentRun! })
    store.appendLog(live)
    resolve([{ ...live, time: '旧 HTTP 时间', message: '旧 HTTP 正文' }])
    await refresh
    expect(store.logs.find(log => log.id === 'same-id')).toEqual(live)
    expect(store.logsByRunId['run-73']).toEqual(store.logs)
    setStoredTimezone('Asia/Tokyo'); render(store.logs)
    expect.soft(wrapper!.text()).toContain(time('Asia/Tokyo'))
    expect(wrapper!.text()).not.toContain('旧 HTTP 正文')
    expect(api.getLogs).toHaveBeenCalledTimes(1)
  })
})
