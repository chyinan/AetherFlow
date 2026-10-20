// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
const runApiMocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  getRun: vi.fn(),
  getLogs: vi.fn(),
  recoverRuntime: vi.fn(),
}))

const realtimeMocks = vi.hoisted(() => ({
  subscribeRun: vi.fn(() => vi.fn()),
}))

vi.mock('@/services/api/runApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/api/runApi')>()
  return {
    ...original,
    runApi: {
      ...original.runApi,
      listRuns: runApiMocks.listRuns,
      getRun: runApiMocks.getRun,
      getLogs: runApiMocks.getLogs,
      recoverRuntime: runApiMocks.recoverRuntime,
    },
  }
})

vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: { subscribeRun: realtimeMocks.subscribeRun },
}))

import { useRunStore } from './runStore'
import type { RunLogEntry, WorkflowRun } from '@/types/run'

const BASE_MS = Date.UTC(2026, 0, 1, 0, 0, 0)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function eventLog(index: number): RunLogEntry {
  return {
    id: `e${index}`,
    time: '00:00:00',
    occurredAt: new Date(BASE_MS + index * 1000).toISOString(),
    level: 'info',
    message: `event ${index}`,
  }
}

function events(from: number, to: number): RunLogEntry[] {
  return Array.from({ length: to - from + 1 }, (_, offset) => eventLog(from + offset))
}

function ids(entries: RunLogEntry[]) {
  return entries.map((entry) => entry.id)
}

function run(id: string, patch: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    workflowId: `workflow-${id}`,
    workflowName: id,
    status: 'cancelled',
    backendStatus: 'CANCELLED',
    startedAt: '2026-08-30 00:00:00',
    durationMs: 1000,
    trigger: 'manual',
    owner: 'operator',
    traceId: `trace-${id}`,
    queueName: 'workflow-runtime',
    progress: 100,
    artifactCount: 0,
    artifactNames: [],
    nodeStates: [],
    backendInstanceId: id === 'run-a' ? 101 : 102,
    runtimeWorkflowId: id === 'run-a' ? '101' : '102',
    ...patch,
  }
}

describe('运行日志合并的顺序与内容选择', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    runApiMocks.listRuns.mockReset()
    runApiMocks.getRun.mockReset()
    runApiMocks.getLogs.mockReset()
    runApiMocks.recoverRuntime.mockReset()
    realtimeMocks.subscribeRun.mockReset()
    realtimeMocks.subscribeRun.mockImplementation(() => vi.fn())
  })

  it('恢复完整事件历史后仍保留最新窗口与最终取消事件', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    // 后端日志接口返回最近 200 条，运行恢复接口返回完整 300 条历史。
    runApiMocks.getLogs.mockResolvedValue(events(101, 300))
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: events(1, 300) })

    await store.selectRun('run-a')

    expect(ids(store.logs)).toEqual(ids(events(201, 300)))
    expect(store.logs.at(-1)?.id).toBe('e300')
    expect(ids(store.logsByRunId['run-a'])).toEqual(ids(events(201, 300)))
  })

  it('200 条事件的取消运行在恢复历史后保留最后 100 条而不是最早的 100 条', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    runApiMocks.getLogs.mockResolvedValue(events(1, 200))
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: events(1, 200) })

    await store.selectRun('run-a')

    expect(ids(store.logs)).toEqual(ids(events(101, 200)))
    expect(store.logs.at(-1)?.message).toBe('event 200')
  })

  it('服务端日志与恢复历史重叠时按时间合并且不重复', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    runApiMocks.getLogs.mockResolvedValue(events(101, 200))
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: events(1, 200) })

    await store.selectRun('run-a')

    expect(ids(store.logs)).toEqual(ids(events(101, 200)))
    expect(new Set(ids(store.logs)).size).toBe(store.logs.length)
  })

  it('重复回放同一段历史保持幂等', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    runApiMocks.getLogs.mockResolvedValue(events(1, 200))
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: events(1, 200) })

    await store.selectRun('run-a')
    const first = ids(store.logs)
    await store.selectRun('run-a', { refreshLogs: true })
    const second = ids(store.logs)

    expect(first).toEqual(ids(events(101, 200)))
    expect(second).toEqual(first)
    expect(new Set(second).size).toBe(second.length)
  })

  it('刷新已取消运行仍然得到最新窗口', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    runApiMocks.getLogs.mockResolvedValue(events(1, 200))
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: events(1, 200) })

    await store.selectRun('run-a')
    await store.selectRun('run-a', { refreshLogs: true })

    expect(ids(store.logs)).toEqual(ids(events(101, 200)))
    expect(store.logs.at(-1)?.id).toBe('e200')
  })

  it('切换运行不会把上一个运行的日志带入当前运行', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a'), run('run-b')]
    runApiMocks.getLogs.mockImplementation(async (runId: string) => (
      runId === 'run-a' ? events(1, 200) : events(1, 5)
    ))
    runApiMocks.recoverRuntime.mockImplementation(async (selectedRun: WorkflowRun) => ({
      nodePatches: [],
      logs: selectedRun.id === 'run-a' ? events(1, 200) : events(1, 5),
    }))

    await store.selectRun('run-a')
    await store.selectRun('run-b')

    expect(ids(store.logs)).toEqual(ids(events(1, 5)))
    expect(ids(store.logsByRunId['run-b'])).toEqual(ids(events(1, 5)))
    expect(ids(store.logsByRunId['run-a'])).toEqual(ids(events(101, 200)))
  })

  it('相同时间戳的事件保持到达顺序且结果稳定', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    const sameTime = '2026-01-01T00:00:00.000Z'
    const legacy: RunLogEntry[] = [
      { id: 'same-1', time: '00:00:00', occurredAt: sameTime, level: 'info', message: 'first' },
      { id: 'same-2', time: '00:00:00', occurredAt: sameTime, level: 'info', message: 'second' },
    ]
    runApiMocks.getLogs.mockResolvedValue(legacy)
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: legacy })

    await store.selectRun('run-a')

    expect(ids(store.logs)).toEqual(['same-1', 'same-2'])
  })

  it('缺少时间戳的旧记录保留在窗口内且顺序确定', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    const legacy: RunLogEntry[] = [
      { id: 'legacy-1', time: '00:00:00', level: 'info', message: 'legacy first' },
      { id: 'legacy-2', time: '00:00:00', level: 'info', message: 'legacy second' },
      { id: 'timed-1', time: '00:00:01', occurredAt: '2026-01-01T00:00:01.000Z', level: 'info', message: 'timed' },
    ]
    runApiMocks.getLogs.mockResolvedValue(legacy)
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: legacy })

    await store.selectRun('run-a')

    expect(ids(store.logs)).toEqual(['legacy-1', 'legacy-2', 'timed-1'])
  })

  it('实时日志与恢复历史交错时保留最新事件且实时内容优先', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    runApiMocks.getLogs.mockResolvedValue(events(1, 3))
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: events(1, 3) })

    await store.selectRun('run-a')
    // 恢复流程返回后到达的实时日志必须仍在窗口末尾。
    store.appendLog(eventLog(4))

    expect(ids(store.logs)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(store.logs.at(-1)?.id).toBe('e4')
  })

  it('恢复请求进行中到达的实时日志不会被恢复历史挤掉', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    const recovery = deferred<{ nodePatches: never[]; logs: RunLogEntry[] }>()
    runApiMocks.getLogs.mockResolvedValue(events(1, 3))
    runApiMocks.recoverRuntime.mockReturnValue(recovery.promise)

    const selecting = store.selectRun('run-a')
    await flushPromises()
    // 恢复请求仍在等待时收到实时日志。
    store.appendLog(eventLog(4))
    recovery.resolve({ nodePatches: [], logs: events(1, 3) })
    await selecting
    await flushPromises()

    expect(ids(store.logs)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(store.logs.at(-1)?.id).toBe('e4')
  })

  it('重复执行历史恢复不会改变窗口内容', async () => {
    const store = useRunStore()
    store.initialized = true
    store.runs = [run('run-a')]
    runApiMocks.getLogs.mockResolvedValue(events(1, 200))
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: events(1, 200) })

    await store.selectRun('run-a')
    const first = ids(store.logs)
    await store.recoverCurrentRunRuntime()
    await store.recoverCurrentRunRuntime()

    expect(ids(store.logs)).toEqual(first)
    expect(new Set(ids(store.logs)).size).toBe(first.length)
  })
})
