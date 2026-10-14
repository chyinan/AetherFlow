// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'
import type { RuntimeRecovery } from '@/services/api/runApi'

type RunHandlers = {
  onLog?: (entry: RunLogEntry) => void
  onNodePatch?: (patch: RunNodeState) => void
  onRunPatch?: (patch: Partial<WorkflowRun>) => void
  onConnectionChange?: (state: 'online' | 'reconnecting' | 'offline') => void
}

const mocks = vi.hoisted(() => ({
  cancelWorkflowInstance: vi.fn(),
  getLogs: vi.fn(),
  recoverRuntime: vi.fn(),
  subscribeRun: vi.fn((_options: unknown, _handlers: RunHandlers) => vi.fn()),
  markRunArtifactsReady: vi.fn(),
  refreshArtifactsFromBackend: vi.fn(),
  startNotificationStream: vi.fn(),
  stopNotificationStream: vi.fn(),
}))

vi.mock('@/services/api/workflowApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/api/workflowApi')>(),
  cancelWorkflowInstance: mocks.cancelWorkflowInstance,
}))
vi.mock('@/services/api/runApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/api/runApi')>()
  return {
    ...original,
    runApi: { ...original.runApi, getLogs: mocks.getLogs, recoverRuntime: mocks.recoverRuntime },
  }
})
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribeRun } }))
vi.mock('./fileStore', () => ({
  useFileStore: () => ({
    markRunArtifactsReady: mocks.markRunArtifactsReady,
    refreshArtifactsFromBackend: mocks.refreshArtifactsFromBackend,
  }),
}))
vi.mock('./uiStore', () => ({
  useUiStore: () => ({
    startNotificationStream: mocks.startNotificationStream,
    stopNotificationStream: mocks.stopNotificationStream,
  }),
}))

import { useRunStore } from './runStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function log(id: string): RunLogEntry {
  return { id, time: '12:00:00', level: 'info', message: id }
}

function run(id: string, backendInstanceId: number): WorkflowRun {
  return {
    id, workflowId: `workflow-${id}`, workflowName: id,
    status: 'running', backendStatus: 'RUNNING', backendInstanceId,
    runtimeWorkflowId: String(backendInstanceId), startedAt: '2026-10-11 12:00:00',
    durationMs: 25, trigger: 'manual', owner: 'operator', traceId: `trace-${id}`,
    queueName: 'workflow-runtime', progress: 20, artifactCount: 0, artifactNames: [],
    currentNodeId: `node-${id}`,
    nodeStates: [{ nodeId: `node-${id}`, label: id, status: 'running', retryCount: 0 }],
  }
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function subscription(index: number) {
  const call = mocks.subscribeRun.mock.calls[index]
  const result = mocks.subscribeRun.mock.results[index]
  if (!call || !result || result.type !== 'return') throw new Error(`未找到第 ${index + 1} 个运行订阅`)
  return { handlers: call[1], stop: result.value }
}

function setupStore() {
  const store = useRunStore()
  store.runs = [run('run-a', 101), run('run-b', 102)]
  // 详情与列表使用不同对象，避免只修改旧引用也能偶然通过。
  store.currentRun = run('run-a', 101)
  store.initialized = true
  store.logs = [log('run-a-initial')]
  store.logsByRunId['run-a'] = store.logs
  store.subscribeCurrentRun()
  subscription(0).handlers.onConnectionChange?.('online')
  return store
}

function sendLateCallbacks(handlers: RunHandlers) {
  handlers.onLog?.(log('late-log'))
  handlers.onNodePatch?.({ nodeId: 'late-node', label: '迟到节点', status: 'running' })
  handlers.onRunPatch?.({ status: 'running', backendStatus: 'RUNNING', progress: 12, traceId: 'late-trace' })
  handlers.onConnectionChange?.('online')
}

describe('取消运行的异步目标与订阅隔离', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    mocks.subscribeRun.mockImplementation(() => vi.fn())
    mocks.getLogs.mockImplementation(async (runId: string) => [log(`${runId}-initial`)])
    mocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: [] })
    mocks.refreshArtifactsFromBackend.mockResolvedValue(undefined)
  })
  afterEach(() => { useRunStore().stopRealtime() })

  it('正常取消在响应成功后同时更新独立的详情和列表并关闭订阅', async () => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const initial = snapshot(store.currentRun)
    const active = subscription(0)
    const pending = store.cancelCurrentRun()
    expect(mocks.cancelWorkflowInstance).toHaveBeenCalledExactlyOnceWith(101)
    expect(store.currentRun).toEqual(initial)
    expect(store.runs[0]).toEqual(initial)
    expect(active.stop).not.toHaveBeenCalled()
    expect(store.runRealtimeState).toBe('online')

    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)
    expect(store.currentRun).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
    expect(store.runs[0]).toEqual(store.currentRun)
    expect(active.stop).toHaveBeenCalledTimes(1)
    expect(mocks.stopNotificationStream).not.toHaveBeenCalled()
    expect(store.runRealtimeState).toBe('offline')
  })

  it('取消完成后让旧订阅的日志、节点、运行和连接回调全部失效', async () => {
    const store = setupStore()
    const active = subscription(0)
    mocks.cancelWorkflowInstance.mockResolvedValue(undefined)
    await store.cancelCurrentRun()
    const cancelledRun = snapshot(store.currentRun)
    const cancelledLogs = snapshot(store.logs)
    sendLateCallbacks(active.handlers)
    expect(store.currentRun).toEqual(cancelledRun)
    expect(store.runs[0]).toEqual(cancelledRun)
    expect(store.logs).toEqual(cancelledLogs)
    expect(store.logsByRunId['run-a']).toEqual(cancelledLogs)
    expect(store.runRealtimeState).toBe('offline')
  })

  it('取消 A 后切换到 B，仅更新 A 的最新列表记录且 B 订阅继续工作', async () => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    // 模拟列表刷新替换旧对象，响应必须按目标 ID 找到当前记录。
    store.runs = store.runs.map((item) => ({ ...snapshot(item), durationMs: 50 }))
    await store.selectRun('run-b')
    const activeB = subscription(1)
    activeB.handlers.onConnectionChange?.('online')
    const runB = snapshot(store.currentRun)
    const logsB = snapshot(store.logs)
    const generationB = store.realtimeSubscriptionId
    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)

    expect(store.currentRun).toEqual(runB)
    expect(store.runs[1]).toEqual(runB)
    expect(store.logs).toEqual(logsB)
    expect(store.logsByRunId['run-b']).toEqual(logsB)
    expect(store.runRealtimeState).toBe('online')
    expect(store.realtimeSubscriptionId).toBe(generationB)
    expect(activeB.stop).not.toHaveBeenCalled()
    expect(mocks.stopNotificationStream).not.toHaveBeenCalled()
    expect(store.runs[0]).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100, durationMs: 50 })

    activeB.handlers.onLog?.(log('run-b-next'))
    activeB.handlers.onNodePatch?.({ nodeId: 'node-run-b', label: 'B 最新节点', status: 'running', durationMs: 80 })
    activeB.handlers.onRunPatch?.({ progress: 45, currentNodeId: 'node-b-next' })
    activeB.handlers.onConnectionChange?.('reconnecting')
    expect(store.logs.at(-1)?.id).toBe('run-b-next')
    expect(store.currentRun?.nodeStates[0]).toMatchObject({ label: 'B 最新节点', status: 'running', durationMs: 80 })
    expect(store.currentRun).toMatchObject({ id: 'run-b', status: 'running', progress: 45, currentNodeId: 'node-b-next' })
    expect(store.runRealtimeState).toBe('reconnecting')
  })

  it('等待取消时清空选择，成功响应只更新列表且不会恢复详情或日志', async () => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    store.clearCurrentRun()
    const generationAfterClear = store.realtimeSubscriptionId
    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)
    sendLateCallbacks(subscription(0).handlers)
    expect(store.currentRun).toBeNull()
    expect(store.logs).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.logsLoading).toBe(false)
    expect(store.runRealtimeState).toBe('offline')
    expect(store.realtimeSubscriptionId).toBe(generationAfterClear)
    expect(subscription(0).stop).toHaveBeenCalledTimes(1)
    expect(store.runs[0]).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
  })

  it('A 到 B 再回到 A 时更新新的 A 详情并关闭当前 A 订阅', async () => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    await store.selectRun('run-b')
    await store.selectRun('run-a')
    const currentA = subscription(2)
    currentA.handlers.onConnectionChange?.('online')
    store.currentRun = { ...snapshot(store.currentRun!), durationMs: 90 }
    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)
    const cancelledA = snapshot(store.currentRun)
    const cancelledLogs = snapshot(store.logs)
    sendLateCallbacks(currentA.handlers)
    sendLateCallbacks(subscription(0).handlers)
    expect(store.currentRun).toEqual(cancelledA)
    expect(store.currentRun).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100, durationMs: 90 })
    expect(store.runs[0]).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
    expect(store.runs[1]).toMatchObject({ id: 'run-b', status: 'running', backendStatus: 'RUNNING', progress: 20 })
    expect(store.logs).toEqual(cancelledLogs)
    expect(currentA.stop).toHaveBeenCalledTimes(1)
    expect(store.runRealtimeState).toBe('offline')
  })

  it.each(['success', 'failed'] as const)('取消响应不覆盖当前 A 已到达的 %s 终态或关闭其订阅', async (status) => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    subscription(0).handlers.onRunPatch?.({ status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 75 })
    const terminal = snapshot(store.currentRun)
    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)
    expect(store.currentRun).toEqual(terminal)
    expect(store.runs[0]).toEqual(terminal)
    expect(subscription(0).stop).not.toHaveBeenCalled()
    expect(store.runRealtimeState).toBe('online')
  })

  it.each(['success', 'failed'] as const)('A 详情仍旧时取消响应不覆盖列表已刷新的 %s 终态', async (status) => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    store.runs[0] = { ...snapshot(store.runs[0]!), status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 95 }
    const stateWithTerminalList = snapshot(store.$state)

    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)

    expect(store.$state).toEqual(stateWithTerminalList)
    expect(subscription(0).stop).not.toHaveBeenCalled()
  })

  it.each(['success', 'failed'] as const)('切到 B 后取消响应保留 A 列表中已到达的 %s 终态', async (status) => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    await store.selectRun('run-b')
    store.runs[0] = { ...snapshot(store.runs[0]!), status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 75 }
    const terminalA = snapshot(store.runs[0])
    const runB = snapshot(store.currentRun)
    subscription(1).handlers.onConnectionChange?.('online')
    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)
    expect(store.runs[0]).toEqual(terminalA)
    expect(store.currentRun).toEqual(runB)
    expect(subscription(1).stop).not.toHaveBeenCalled()
    expect(store.runRealtimeState).toBe('online')
  })

  it.each(['running', 'cancelled'] as const)('取消响应保留独立列表中 %s 记录的较新元数据', async (status) => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    const originalDetail = snapshot(store.currentRun)
    store.runs[0] = {
      ...snapshot(store.runs[0]!),
      status,
      backendStatus: status === 'cancelled' ? 'CANCELLED' : 'RUNNING',
      progress: status === 'cancelled' ? 100 : 65,
      durationMs: 195,
      currentNodeId: 'node-next',
      traceId: 'refreshed-list-trace',
      nodeStates: [
        { nodeId: 'node-run-a', label: '已完成节点', status: 'success', durationMs: 120 },
        { nodeId: 'node-next', label: '较新节点', status: 'running', durationMs: 75 },
      ],
      artifactCount: 3,
      artifactNames: ['a.txt', 'b.txt', 'c.txt'],
    }
    const refreshedListRun = snapshot(store.runs[0])

    cancellation.resolve(undefined)
    await expect(pending).resolves.toBe(true)

    const cancelledPatch = { status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 }
    expect(store.currentRun).toEqual({ ...originalDetail, ...cancelledPatch })
    expect(store.runs[0]).toEqual(status === 'cancelled'
      ? refreshedListRun
      : { ...refreshedListRun, ...cancelledPatch })
    expect(subscription(0).stop).toHaveBeenCalledTimes(1)
    expect(store.runRealtimeState).toBe('offline')
  })

  it('取消失败时向调用方抛出原错误且不修改当前状态或订阅', async () => {
    const store = setupStore()
    const cancellation = deferred<void>()
    const error = new Error('取消请求失败')
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const initialState = snapshot(store.$state)
    const pending = store.cancelCurrentRun()
    const rejection = expect(pending).rejects.toBe(error)
    cancellation.reject(error)
    await rejection
    expect(store.$state).toEqual(initialState)
    expect(subscription(0).stop).not.toHaveBeenCalled()
    subscription(0).handlers.onLog?.(log('after-failure'))
    expect(store.logs.at(-1)?.id).toBe('after-failure')
  })

  it('切换到 B 后 A 的取消失败不修改任何运行或关闭 B 订阅', async () => {
    const store = setupStore()
    const cancellation = deferred<void>()
    const error = new Error('取消请求失败')
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    const rejection = expect(pending).rejects.toBe(error)
    await store.selectRun('run-b')
    subscription(1).handlers.onConnectionChange?.('online')
    const stateB = snapshot(store.$state)
    cancellation.reject(error)
    await rejection
    expect(store.$state).toEqual(stateB)
    expect(subscription(1).stop).not.toHaveBeenCalled()
  })

  it('同一运行的并发取消响应乱序到达时只关闭一次订阅', async () => {
    const store = setupStore()
    const first = deferred<void>()
    const second = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const pendingFirst = store.cancelCurrentRun()
    const pendingSecond = store.cancelCurrentRun()
    second.resolve(undefined)
    await expect(pendingSecond).resolves.toBe(true)
    const cancelledState = snapshot(store.$state)
    first.resolve(undefined)
    await expect(pendingFirst).resolves.toBe(true)
    expect(store.$state).toEqual(cancelledState)
    expect(subscription(0).stop).toHaveBeenCalledTimes(1)
    expect(mocks.subscribeRun).toHaveBeenCalledTimes(1)
  })

  it('重复的 A 取消成功响应不会影响第一次成功后建立的 B 订阅', async () => {
    const store = setupStore()
    const first = deferred<void>()
    const second = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const pendingFirst = store.cancelCurrentRun()
    const pendingSecond = store.cancelCurrentRun()
    first.resolve(undefined)
    await expect(pendingFirst).resolves.toBe(true)
    await store.selectRun('run-b')
    const activeB = subscription(1)
    activeB.handlers.onConnectionChange?.('online')
    const stateB = snapshot(store.$state)
    second.resolve(undefined)
    await expect(pendingSecond).resolves.toBe(true)
    expect(store.$state).toEqual(stateB)
    expect(activeB.stop).not.toHaveBeenCalled()
    activeB.handlers.onLog?.(log('run-b-after-duplicate'))
    expect(store.logs.at(-1)?.id).toBe('run-b-after-duplicate')
  })

  it('取消成功后忽略已经发出的运行恢复结果，不让旧节点或日志恢复运行中状态', async () => {
    const store = setupStore()
    const recovery = deferred<RuntimeRecovery>()
    mocks.recoverRuntime.mockReturnValue(recovery.promise)
    mocks.cancelWorkflowInstance.mockResolvedValue(undefined)
    const pendingRecovery = store.recoverCurrentRunRuntime()
    await store.cancelCurrentRun()
    const cancelledState = snapshot(store.$state)
    recovery.resolve({
      nodePatches: [{ nodeId: 'node-run-a', label: '旧恢复节点', status: 'running' }],
      runPatch: { status: 'running', backendStatus: 'RUNNING', progress: 30 },
      logs: [log('stale-recovery')],
    })
    await pendingRecovery
    expect(store.$state).toEqual(cancelledState)
  })

  it('取消完成后新发起的恢复可以读取历史日志但不能复活运行', async () => {
    const store = setupStore()
    mocks.cancelWorkflowInstance.mockResolvedValue(undefined)
    await store.cancelCurrentRun()
    const cancelledRun = snapshot(store.currentRun)
    const generation = store.realtimeSubscriptionId
    mocks.recoverRuntime.mockResolvedValue({
      nodePatches: [{ nodeId: 'node-run-a', label: '历史节点', status: 'running' }],
      runPatch: { status: 'running', backendStatus: 'RUNNING', progress: 30 },
      logs: [log('cancelled-history')],
    })

    await store.recoverCurrentRunRuntime()

    expect(store.currentRun).toEqual(cancelledRun)
    expect(store.runs[0]).toEqual(cancelledRun)
    expect(store.logs.map((entry) => entry.id)).toEqual(['run-a-initial', 'cancelled-history'])
    expect(store.logsByRunId['run-a']).toEqual(store.logs)
    expect(store.realtimeSubscriptionId).toBe(generation)
    expect(store.runRealtimeState).toBe('offline')
    expect(mocks.subscribeRun).toHaveBeenCalledTimes(1)
  })

  it('取消完成前发出的恢复请求迟到失败时不新增错误或警告日志', async () => {
    const store = setupStore()
    const recovery = deferred<RuntimeRecovery>()
    mocks.recoverRuntime.mockReturnValue(recovery.promise)
    mocks.cancelWorkflowInstance.mockResolvedValue(undefined)
    const pendingRecovery = store.recoverCurrentRunRuntime()
    await store.cancelCurrentRun()
    const cancelledState = snapshot(store.$state)

    recovery.reject(new Error('旧恢复失败'))
    await pendingRecovery

    expect(store.$state).toEqual(cancelledState)
  })

  it.each(['日志', '运行恢复'] as const)('取消完成后同一运行的待完成%s选择请求不会重新订阅', async (stage) => {
    const store = setupStore()
    const selectedLogs = deferred<RunLogEntry[]>()
    const recovery = deferred<RuntimeRecovery>()
    mocks.cancelWorkflowInstance.mockResolvedValue(undefined)
    if (stage === '日志') {
      delete store.logsByRunId['run-a']
      mocks.getLogs.mockReturnValue(selectedLogs.promise)
    } else {
      mocks.recoverRuntime.mockReturnValue(recovery.promise)
    }
    const selecting = store.selectRun('run-a')
    await vi.waitFor(() => {
      if (stage === '日志') expect(mocks.getLogs).toHaveBeenCalledWith('run-a')
      else expect(mocks.recoverRuntime).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-a' }))
    })
    await store.cancelCurrentRun()
    selectedLogs.resolve([log('loaded-after-cancel')])
    recovery.resolve({
      nodePatches: [{ nodeId: 'node-run-a', label: '旧节点', status: 'running' }],
      runPatch: { status: 'running', backendStatus: 'RUNNING', progress: 30 },
      logs: [],
    })
    await selecting

    expect(store.currentRun).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
    expect(store.runs[0]).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
    expect(mocks.subscribeRun).toHaveBeenCalledTimes(1)
    expect(subscription(0).stop).toHaveBeenCalledTimes(1)
    expect(store.runRealtimeState).toBe('offline')
    expect(store.loading).toBe(false)
    expect(store.logsLoading).toBe(false)
  })

  it('没有后端实例 ID 时可使用有效的数字运行时 ID 取消', async () => {
    const store = setupStore()
    store.currentRun!.backendInstanceId = undefined
    store.currentRun!.runtimeWorkflowId = '301'
    mocks.cancelWorkflowInstance.mockResolvedValue(undefined)
    await expect(store.cancelCurrentRun()).resolves.toBe(true)
    expect(mocks.cancelWorkflowInstance).toHaveBeenCalledExactlyOnceWith(301)
    expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
  })

  it.each([
    { name: '零', backendInstanceId: 0, runtimeWorkflowId: undefined },
    { name: '负数', backendInstanceId: -1, runtimeWorkflowId: undefined },
    { name: '小数', backendInstanceId: 1.5, runtimeWorkflowId: undefined },
    { name: '无穷大', backendInstanceId: Infinity, runtimeWorkflowId: undefined },
    { name: '非数值', backendInstanceId: NaN, runtimeWorkflowId: undefined },
    { name: '缺失', backendInstanceId: undefined, runtimeWorkflowId: undefined },
    { name: '非数字运行时 ID', backendInstanceId: undefined, runtimeWorkflowId: 'not-an-instance' },
    { name: '空白运行时 ID', backendInstanceId: undefined, runtimeWorkflowId: ' ' },
  ])('实例 ID 为 $name 时不发请求或修改状态', async (ids) => {
    const store = setupStore()
    store.currentRun!.backendInstanceId = ids.backendInstanceId
    store.currentRun!.runtimeWorkflowId = ids.runtimeWorkflowId
    const current = store.currentRun
    const generation = store.realtimeSubscriptionId
    await expect(store.cancelCurrentRun()).resolves.toBe(false)
    expect(mocks.cancelWorkflowInstance).not.toHaveBeenCalled()
    expect(store.currentRun).toBe(current)
    expect(store.currentRun).toMatchObject({ status: 'running', backendStatus: 'RUNNING', progress: 20 })
    expect(store.realtimeSubscriptionId).toBe(generation)
    expect(store.runRealtimeState).toBe('online')
    expect(subscription(0).stop).not.toHaveBeenCalled()
  })

  it('没有当前运行时返回 false 且不发取消请求', async () => {
    const store = useRunStore()
    await expect(store.cancelCurrentRun()).resolves.toBe(false)
    expect(mocks.cancelWorkflowInstance).not.toHaveBeenCalled()
    expect(store.currentRun).toBeNull()
    expect(store.realtimeSubscriptionId).toBe(0)
  })

  it.each(['success', 'failed'] as const)('取消确认覆盖节点局部推断的 %s，保留节点详情', async (status) => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const pending = store.cancelCurrentRun()
    subscription(0).handlers.onNodePatch?.({ nodeId: 'node-run-a', label: '局部节点', status, output: '保留具体输出' })
    expect(store.currentRun).toMatchObject({ status, backendStatus: 'RUNNING' })
    cancellation.resolve(undefined)
    await pending
    expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
    expect(store.runs[0]).toEqual(store.currentRun)
    expect(store.currentRun?.nodeStates[0]?.output).toBe('保留具体输出')
    expect(subscription(0).stop).toHaveBeenCalledTimes(1)
  })

  it.each(['SUCCESS', 'FAILED', 'CANCELLED'])('并发节点更新不阻止恢复后端权威终态 %s', async (backendStatus) => {
    const store = setupStore()
    const recovery = deferred<RuntimeRecovery>()
    mocks.recoverRuntime.mockReturnValue(recovery.promise)
    const pending = store.recoverCurrentRunRuntime()
    store.patchNodeState({ nodeId: 'node-run-a', label: '节点', status: 'running', durationMs: 60 })
    recovery.resolve({ nodePatches: [], logs: [], runPatch: { status: backendStatus.toLowerCase() as WorkflowRun['status'], backendStatus, progress: 100 } })
    await pending
    expect(store.currentRun).toMatchObject({ backendStatus, progress: 100 })
  })

  it('没有并发事件时允许 WAITING 恢复较低的实际运行进度', async () => {
    const store = setupStore()
    store.patchCurrentRun({ status: 'paused', backendStatus: 'WAITING', progress: 100 })
    mocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: [], runPatch: { status: 'running', backendStatus: 'RUNNING', progress: 25 } })
    await store.recoverCurrentRunRuntime()
    expect(store.currentRun).toMatchObject({ status: 'running', backendStatus: 'RUNNING', progress: 25 })
  })

  it('两个同运行恢复请求乱序返回时只采用较新请求', async () => {
    const store = setupStore()
    const older = deferred<RuntimeRecovery>()
    const newer = deferred<RuntimeRecovery>()
    mocks.recoverRuntime.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const first = store.recoverCurrentRunRuntime()
    const second = store.recoverCurrentRunRuntime()
    newer.resolve({ nodePatches: [], logs: [log('newer')], runPatch: { progress: 70, currentNodeId: 'new-node' } })
    await second
    older.resolve({ nodePatches: [], logs: [log('older')], runPatch: { progress: 20, currentNodeId: 'old-node' } })
    await first
    expect(store.currentRun).toMatchObject({ progress: 70, currentNodeId: 'new-node' })
    expect(store.logs.map(entry => entry.id)).not.toContain('older')
  })

  it.each(['RUNNING', 'SUCCESS'] as const)('并发更新 B 时仍补齐漏收的 A 历史节点，保留较新摘要或采用 %s 权威终态', async (backendStatus) => {
    const store = setupStore()
    const recovery = deferred<RuntimeRecovery>()
    mocks.recoverRuntime.mockReturnValue(recovery.promise)
    const pending = store.recoverCurrentRunRuntime()
    store.patchCurrentRun({ status: 'running', backendStatus: 'RUNNING', progress: 75, currentNodeId: 'node-b' })
    store.patchNodeState({ nodeId: 'node-b', label: '实时节点 B', status: 'running', retryCount: 2, output: '较新输出' })
    store.patchCurrentRun({ progress: 75 })
    recovery.resolve({
      logs: [log('history-a')],
      nodePatches: [
        { nodeId: 'node-run-a', label: '历史节点 A', status: 'success', output: '离线期间的输出' },
        { nodeId: 'node-b', label: '旧节点 B', status: 'paused', retryCount: 0, output: '旧输出' },
      ],
      runPatch: { status: backendStatus === 'SUCCESS' ? 'success' : 'running', backendStatus, progress: backendStatus === 'SUCCESS' ? 100 : 20 },
    })
    await pending
    expect(store.currentRun?.nodeStates[0]).toMatchObject({ status: 'success', output: '离线期间的输出' })
    expect(store.currentRun?.nodeStates[1]).toMatchObject({ status: 'running', retryCount: 2, output: '较新输出' })
    expect(store.currentRun).toMatchObject({ backendStatus, progress: backendStatus === 'SUCCESS' ? 100 : 75, currentNodeId: 'node-b' })
    expect(store.logs.map(entry => entry.id)).toContain('history-a')
  })
})
