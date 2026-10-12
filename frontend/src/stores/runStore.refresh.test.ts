// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRecovery } from '@/services/api/runApi'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'

type RunHandlers = {
  onLog?: (entry: RunLogEntry) => void
  onNodePatch?: (patch: RunNodeState) => void
  onRunPatch?: (patch: Partial<WorkflowRun>) => void
}

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(), getRun: vi.fn(), getLogs: vi.fn(), recoverRuntime: vi.fn(),
  cancelWorkflowInstance: vi.fn(),
  subscribeRun: vi.fn((_options: unknown, _handlers: RunHandlers) => vi.fn()),
  markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn(),
  startNotificationStream: vi.fn(), stopNotificationStream: vi.fn(),
}))

vi.mock('@/services/api/runApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/api/runApi')>()
  return { ...original, runApi: { ...original.runApi,
    listRuns: mocks.listRuns, getRun: mocks.getRun, getLogs: mocks.getLogs, recoverRuntime: mocks.recoverRuntime,
  } }
})
vi.mock('@/services/api/workflowApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/api/workflowApi')>(),
  cancelWorkflowInstance: mocks.cancelWorkflowInstance,
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribeRun } }))
vi.mock('./fileStore', () => ({ useFileStore: () => ({
  markRunArtifactsReady: mocks.markRunArtifactsReady, refreshArtifactsFromBackend: mocks.refreshArtifactsFromBackend,
}) }))
vi.mock('./uiStore', () => ({ useUiStore: () => ({
  startNotificationStream: mocks.startNotificationStream, stopNotificationStream: mocks.stopNotificationStream,
}) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'run-a' } }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import { i18n } from '@/i18n'
import RunsPage from '@/pages/runs/RunsPage.vue'
import { useRunStore } from './runStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function log(id: string, message = id): RunLogEntry {
  return { id, time: '12:00:00', level: 'info', message }
}

function run(id = 'run-a', patch: Partial<WorkflowRun> = {}): WorkflowRun {
  const instanceId = id === 'run-a' ? 101 : 102
  return {
    id, workflowId: `workflow-${id}`, workflowName: id,
    backendInstanceId: instanceId, runtimeWorkflowId: String(instanceId),
    status: 'running', backendStatus: 'RUNNING', startedAt: '2026-10-11 12:00:00',
    durationMs: 100, trigger: 'manual', owner: 'operator', traceId: `trace-${id}`,
    queueName: 'workflow-runtime', progress: 40, artifactCount: 0, artifactNames: [],
    nodeStates: [{ nodeId: 'node-a', label: '节点 A', status: 'running', retryCount: 2 }],
    ...patch,
  }
}

function setupStore() {
  const store = useRunStore()
  // 详情与列表刻意分开，避免依赖共享引用偶然通过。
  store.runs = [run()]
  store.currentRun = run()
  store.initialized = true
  store.logs = [log('local')]
  store.logsByRunId['run-a'] = store.logs
  store.subscribeCurrentRun()
  return store
}

function handlers(index = 0) {
  return mocks.subscribeRun.mock.calls[index]![1]
}

describe('运行历史刷新与所选详情协调', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    mocks.subscribeRun.mockImplementation(() => vi.fn())
    mocks.getLogs.mockResolvedValue([])
    mocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: [] })
    mocks.refreshArtifactsFromBackend.mockResolvedValue(undefined)
  })
  afterEach(() => { useRunStore().stopRealtime() })

  it.each(['success', 'failed'] as const)('连续刷新将同 ID 列表和详情恢复为 %s', async (status) => {
    const store = setupStore()
    mocks.listRuns.mockImplementation(async () => [run('run-a', {
      status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900,
    })])
    for (let index = 0; index < 2; index += 1) {
      await store.refreshRuns()
      expect(store.currentRun).toMatchObject({ id: 'run-a', status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900 })
      expect(store.runs[0]).toEqual(store.currentRun)
      expect(store.logs).toEqual([log('local')])
      expect(store.error).toBeNull()
    }
  })

  it.each(['success', 'failed'] as const)('页面刷新为 %s 后列表/详情一致且移除取消按钮', async (status) => {
    const store = setupStore()
    const wrapper = mount(RunsPage, { global: { plugins: [i18n], stubs: {
      HumanApprovalDialog: true, LogStream: true, RunTimeline: true,
      StatusBadge: { props: ['status'], template: '<span data-test-status>{{ status }}</span>' },
    } } })
    try {
      await flushPromises()
      mocks.listRuns.mockResolvedValue([run('run-a', { status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900 })])
      await wrapper.get('header button').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('[data-test-status]').map((element) => element.text())).toEqual([status, status])
      expect(wrapper.findAll('button').some((element) => element.text() === i18n.global.t('runs.cancel'))).toBe(false)
      expect(wrapper.text()).toContain('100%')
      expect(wrapper.text()).toContain('900ms')
      expect(store.statusCounts[status]).toBe(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('刷新进行中的运行可更新进度、当前节点和耗时', async () => {
    const store = setupStore()
    mocks.listRuns.mockResolvedValue([run('run-a', { progress: 70, durationMs: 700, currentNodeId: 'node-b' })])
    await store.refreshRuns()
    expect(store.currentRun).toMatchObject({ status: 'running', progress: 70, durationMs: 700, currentNodeId: 'node-b' })
    expect(store.runs[0]).toEqual(store.currentRun)
  })

  it('发起刷新前已到达的运行快照不会被较低进度的列表摘要回退', async () => {
    const store = setupStore()
    store.patchCurrentRun({ progress: 85, durationMs: 950, currentNodeId: 'node-new', traceId: 'runtime-trace' })
    const expected = JSON.parse(JSON.stringify(store.currentRun))
    // 后端列表可能尚无节点摘要，此时映射器会生成 8% 与默认跟踪 ID。
    mocks.listRuns.mockResolvedValue([run('run-a', { progress: 8, nodeStates: [], currentNodeId: 'node-old', traceId: 'trace-101' })])
    await store.refreshRuns()
    expect(store.currentRun).toEqual(expected)
    expect(store.runs[0]).toEqual(expected)
  })

  it('列表可推进运行状态，但默认跟踪和运行 ID 不能覆盖真实运行关联', async () => {
    const store = setupStore()
    store.patchCurrentRun({ runtimeWorkflowId: 'runtime-101', traceId: 'runtime-trace' })
    mocks.listRuns.mockResolvedValue([run('run-a', { progress: 70, durationMs: 700, runtimeWorkflowId: '101', traceId: 'trace-101' })])
    await store.refreshRuns()
    expect(store.currentRun).toMatchObject({ progress: 70, durationMs: 700, runtimeWorkflowId: 'runtime-101', traceId: 'runtime-trace' })
    expect(store.runs[0]).toEqual(store.currentRun)
  })

  it('WAITING 的占位 100% 不会阻止真正恢复为 RUNNING', async () => {
    const store = setupStore()
    store.currentRun = run('run-a', { status: 'paused', backendStatus: 'WAITING', progress: 100,
      nodeStates: [{ nodeId: 'node-a', label: '审批节点', status: 'paused', approval: { approved: false, approvalStatus: 'pending' } }],
    })
    store.runs = [store.currentRun]
    mocks.listRuns.mockResolvedValue([run('run-a', { progress: 20, durationMs: 700 })])
    await store.refreshRuns()
    expect(store.currentRun).toMatchObject({ status: 'running', backendStatus: 'RUNNING', progress: 20, durationMs: 700 })
    expect(store.currentRun?.nodeStates[0]?.approval).toBeUndefined()
    expect(store.runs[0]).toEqual(store.currentRun)
  })

  it('节点推导的终态仍可由列表补齐后端终态与耗时', async () => {
    const store = setupStore()
    store.patchNodeState({ nodeId: 'node-a', label: '节点 A', status: 'success' })
    expect(store.currentRun).toMatchObject({ status: 'success', backendStatus: 'RUNNING' })
    mocks.listRuns.mockResolvedValue([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 100, durationMs: 900 })])
    await store.refreshRuns()
    expect(store.currentRun).toMatchObject({ status: 'success', backendStatus: 'SUCCESS', progress: 100, durationMs: 900 })
  })

  it('列表缺少的节点详情、关联字段和产物仍保留，节点摘要按 ID 合并', async () => {
    const store = setupStore()
    store.currentRun = run('run-a', {
      definitionId: 12, currentNodeId: 'node-a', artifactCount: 1, artifactNames: ['result.txt'],
      nodeStates: [
        { nodeId: 'node-a', label: '已完成节点', status: 'success', durationMs: 90, output: '详细输出', retryCount: 2 },
        { nodeId: 'node-b', label: '人工审批', status: 'paused', approval: { approved: false, approvalStatus: 'pending', reviewer: 'ops' } },
        { nodeId: 'node-local', label: '仅本地节点', status: 'queued' },
      ],
    })
    mocks.listRuns.mockResolvedValue([run('run-a', {
      progress: 70, durationMs: 700, definitionId: undefined, currentNodeId: undefined,
      nodeStates: [
        { nodeId: 'node-a', label: 'node-a', status: 'running', durationMs: undefined, output: undefined },
        { nodeId: 'node-b', label: 'node-b', status: 'paused' },
        { nodeId: 'node-server', label: '服务端节点', status: 'queued' },
      ],
    })])
    await store.refreshRuns()
    expect(store.currentRun).toMatchObject({ definitionId: 12, currentNodeId: 'node-a', artifactCount: 1, artifactNames: ['result.txt'], progress: 70 })
    expect(store.currentRun?.nodeStates).toEqual([
      { nodeId: 'node-a', label: '已完成节点', status: 'success', durationMs: 90, output: '详细输出', retryCount: 2 },
      { nodeId: 'node-b', label: '人工审批', status: 'paused', approval: { approved: false, approvalStatus: 'pending', reviewer: 'ops' } },
      { nodeId: 'node-local', label: '仅本地节点', status: 'queued' },
      { nodeId: 'node-server', label: '服务端节点', status: 'queued' },
    ])
    expect(store.runs[0]).toEqual(store.currentRun)
  })

  it('空节点摘要不会清除已有时间线', async () => {
    const store = setupStore()
    mocks.listRuns.mockResolvedValue([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 100, nodeStates: [] })])
    await store.refreshRuns()
    expect(store.currentRun?.nodeStates).toEqual(run().nodeStates)
    expect(store.currentRun?.status).toBe('success')
  })

  it.each(['success', 'failed'] as const)('HTTP 同步 %s 后迟到节点事件不能让运行终态回退', async (status) => {
    const store = setupStore()
    mocks.listRuns.mockResolvedValue([run('run-a', {
      status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900, nodeStates: [],
    })])
    await store.refreshRuns()
    handlers().onNodePatch?.({ nodeId: 'node-a', label: '节点 A', status: 'running', durationMs: 110 })
    expect(store.currentRun).toMatchObject({ status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900 })
    // 终态已知时，后到的节点详情仍允许补齐，而不能重新推导运行状态。
    handlers().onNodePatch?.({ nodeId: 'node-a', label: '节点 A', status: 'success', output: '最终输出', durationMs: 800 })
    expect(store.currentRun?.nodeStates[0]).toMatchObject({ status: 'success', output: '最终输出', durationMs: 800 })
    expect(store.currentRun).toMatchObject({ status, backendStatus: status.toUpperCase(), progress: 100 })
    expect(store.runs[0]).toEqual(store.currentRun)
  })

  it('恢复节点的局部推导终态不会锁死仍在运行的完整快照', async () => {
    const store = setupStore()
    store.currentRun!.nodeStates = []
    mocks.recoverRuntime.mockResolvedValue({
      nodePatches: [
        { nodeId: 'node-a', label: '已完成节点', status: 'success' },
        { nodeId: 'node-b', label: '仍在运行的节点', status: 'running' },
      ],
      runPatch: { status: 'running', backendStatus: 'RUNNING', progress: 50, currentNodeId: 'node-b' },
      logs: [],
    })
    await store.recoverCurrentRunRuntime()
    expect(store.currentRun).toMatchObject({ status: 'running', backendStatus: 'RUNNING', progress: 50, currentNodeId: 'node-b' })
    expect(store.currentRun?.nodeStates.map((node) => node.status)).toEqual(['success', 'running'])
    expect(store.runs[0]).toEqual(store.currentRun)
  })

  it('真实 mapper 的非空节点摘要不能擦除已恢复的详细输出', async () => {
    const store = setupStore()
    store.currentRun!.nodeStates[0]!.output = '{"generatedImageUrl":"/files/result.png"}'
    mocks.listRuns.mockResolvedValue([run('run-a', {
      nodeStates: [{ nodeId: 'node-a', label: 'node-a', status: 'running', output: 'NODE_STARTED' }],
    })])
    await store.refreshRuns()
    expect(store.currentRun?.nodeStates[0]?.output).toBe('{"generatedImageUrl":"/files/result.png"}')
  })

  it.each(['NODE_STARTED', '{"progress":40}'])('列表中真实新终态属性可替换旧输出 %s', async (output) => {
    const store = setupStore()
    store.currentRun!.nodeStates[0]!.output = output
    mocks.listRuns.mockResolvedValue([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 100,
      nodeStates: [{ nodeId: 'node-a', label: 'node-a', status: 'success', output: '{"generatedImageUrl":"/files/new.png"}' }],
    })])
    await store.refreshRuns()
    expect(store.currentRun?.nodeStates[0]).toMatchObject({ status: 'success', output: '{"generatedImageUrl":"/files/new.png"}' })
  })

  it.each(['success', 'failed', 'cancelled'] as const)('旧列表不会让已知 %s 终态回退或丢失运行字段', async (status) => {
    const store = setupStore()
    store.patchCurrentRun({ status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900, currentNodeId: 'node-final' })
    const expected = JSON.parse(JSON.stringify(store.currentRun))
    mocks.listRuns.mockResolvedValue([run()])
    await store.refreshRuns()
    expect(store.currentRun).toEqual(expected)
    expect(store.runs[0]).toEqual(expected)
  })

  it('同终态摘要可补齐耗时，但不能降低已有进度和耗时', async () => {
    const store = setupStore()
    store.patchCurrentRun({ status: 'success', backendStatus: 'SUCCESS', progress: 100, durationMs: 900 })
    mocks.listRuns.mockResolvedValueOnce([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 100, durationMs: 1200 })])
      .mockResolvedValueOnce([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 80, durationMs: 800 })])
    await store.refreshRuns()
    expect(store.currentRun?.durationMs).toBe(1200)
    await store.refreshRuns()
    expect(store.currentRun).toMatchObject({ progress: 100, durationMs: 1200 })
    expect(store.runs[0]).toEqual(store.currentRun)
  })

  it.each(['running', 'success', 'failed'] as const)('列表等待期间到达的 SSE %s 快照优先于迟到 HTTP', async (status) => {
    const store = setupStore()
    const response = deferred<WorkflowRun[]>()
    mocks.listRuns.mockReturnValue(response.promise)
    const pending = store.refreshRuns()
    handlers().onNodePatch?.({ nodeId: 'node-a', label: '最新节点', status: 'running', durationMs: 850, output: '新输出' })
    handlers().onRunPatch?.({ status, backendStatus: status.toUpperCase(), progress: status === 'running' ? 85 : 100, durationMs: 950, currentNodeId: 'node-new', traceId: 'trace-new' })
    const expected = JSON.parse(JSON.stringify(store.currentRun))
    response.resolve([run()])
    await pending
    expect(store.currentRun).toEqual(expected)
    expect(store.runs[0]).toEqual(expected)
  })

  it('运行恢复在列表等待期间完成时保留其较新字段与日志', async () => {
    const store = setupStore()
    const response = deferred<WorkflowRun[]>()
    const recovery = deferred<RuntimeRecovery>()
    mocks.listRuns.mockReturnValue(response.promise)
    mocks.recoverRuntime.mockReturnValue(recovery.promise)
    const refreshing = store.refreshRuns()
    const recovering = store.recoverCurrentRunRuntime()
    recovery.resolve({ nodePatches: [], runPatch: { progress: 80, currentNodeId: 'node-new', traceId: 'runtime-trace' }, logs: [log('recovered')] })
    await recovering
    const expected = JSON.parse(JSON.stringify(store.currentRun))
    response.resolve([run()])
    await refreshing
    expect(store.currentRun).toEqual(expected)
    expect(store.runs[0]).toEqual(expected)
    expect(store.logs.map((entry) => entry.id)).toEqual(['local', 'recovered'])
  })

  it('刷新日志时保留已有日志与请求期间到达的 SSE，并由较新本地日志去重', async () => {
    const store = setupStore()
    const response = deferred<RunLogEntry[]>()
    mocks.listRuns.mockResolvedValue([run()])
    mocks.getLogs.mockReturnValue(response.promise)
    const pending = store.refreshRuns()
    await vi.waitFor(() => expect(mocks.getLogs).toHaveBeenCalled())
    expect(store.logs).toEqual([log('local')])
    handlers().onLog?.(log('sse', '最新日志'))
    response.resolve([log('history'), log('sse', '旧日志')])
    await pending
    expect(store.logs).toEqual([log('history'), log('sse', '最新日志'), log('local')])
    expect(store.logsByRunId['run-a']).toEqual(store.logs)
  })

  it('取消完成后迟到的列表不能复活运行或重新打开订阅', async () => {
    const store = setupStore()
    const response = deferred<WorkflowRun[]>()
    mocks.listRuns.mockReturnValue(response.promise)
    mocks.cancelWorkflowInstance.mockResolvedValue(undefined)
    const pending = store.refreshRuns()
    await store.cancelCurrentRun()
    response.resolve([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 100 })])
    await pending
    expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
    expect(store.runs[0]).toEqual(store.currentRun)
    expect(store.realtimeRunId).toBeNull()
    expect(mocks.subscribeRun).toHaveBeenCalledTimes(1)
    expect(mocks.subscribeRun.mock.results[0]!.value).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failed'] as const)('刷新先获得 %s 时迟到取消不覆盖列表或详情', async (status) => {
    const store = setupStore()
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const cancelling = store.cancelCurrentRun()
    mocks.listRuns.mockResolvedValue([run('run-a', { status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900 })])
    await store.refreshRuns()
    cancellation.resolve(undefined)
    await cancelling
    expect(store.currentRun).toMatchObject({ status, backendStatus: status.toUpperCase(), progress: 100, durationMs: 900 })
    expect(store.runs[0]).toEqual(store.currentRun)
    expect(mocks.subscribeRun.mock.results[0]!.value).not.toHaveBeenCalled()
  })

  it('刷新发现服务端已取消时关闭该运行订阅并忽略旧回调', async () => {
    const store = setupStore()
    const oldHandlers = handlers()
    mocks.listRuns.mockResolvedValue([run('run-a', { status: 'paused', backendStatus: 'CANCELLED', progress: 100 })])
    await store.refreshRuns()
    oldHandlers.onLog?.(log('late'))
    oldHandlers.onRunPatch?.({ status: 'running', backendStatus: 'RUNNING', progress: 10 })
    expect(store.currentRun).toMatchObject({ backendStatus: 'CANCELLED', progress: 100 })
    expect(store.runs[0]).toEqual(store.currentRun)
    expect(store.realtimeRunId).toBeNull()
    expect(store.logs).toEqual([log('local')])
    expect(mocks.subscribeRun.mock.results[0]!.value).toHaveBeenCalledTimes(1)
  })

  it('A 的取消确认在 B 刷新等待期间到达，只保护 A 且不阻碍 B 更新', async () => {
    const store = setupStore()
    store.runs.push(run('run-b'))
    const cancellation = deferred<void>()
    mocks.cancelWorkflowInstance.mockReturnValue(cancellation.promise)
    const cancelling = store.cancelCurrentRun()
    await store.selectRun('run-b')
    const response = deferred<WorkflowRun[]>()
    mocks.listRuns.mockReturnValue(response.promise)
    const refreshing = store.refreshRuns()
    cancellation.resolve(undefined)
    await cancelling
    response.resolve([run(), run('run-b', { progress: 80, durationMs: 800 })])
    await refreshing
    expect(store.runs[0]).toMatchObject({ id: 'run-a', status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
    expect(store.currentRun).toMatchObject({ id: 'run-b', status: 'running', progress: 80, durationMs: 800 })
    expect(store.realtimeRunId).toBe('run-b')
    expect(mocks.subscribeRun.mock.results[1]!.value).not.toHaveBeenCalled()
  })

  it('刷新中切到 B 后丢弃 A 的旧列表响应', async () => {
    const store = setupStore()
    store.runs.push(run('run-b'))
    const response = deferred<WorkflowRun[]>()
    mocks.listRuns.mockReturnValueOnce(response.promise).mockResolvedValueOnce([run(), run('run-b', { progress: 80 })])
    const refreshing = store.refreshRuns()
    await store.selectRun('run-b')
    response.resolve([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 100 })])
    await refreshing
    expect(store.currentRun).toMatchObject({ id: 'run-b', progress: 80 })
    expect(store.runs.map((item) => item.id)).toEqual(['run-a', 'run-b'])
    expect(store.realtimeRunId).toBe('run-b')
  })

  it('刷新日志等待期间切到 B 再回到 A，旧日志不能覆盖新的选择', async () => {
    const store = setupStore()
    const response = deferred<RunLogEntry[]>()
    mocks.listRuns.mockResolvedValue([run(), run('run-b')])
    mocks.getLogs.mockReturnValueOnce(response.promise).mockResolvedValue([])
    const refreshing = store.refreshRuns()
    await vi.waitFor(() => expect(mocks.getLogs).toHaveBeenCalledWith('run-a'))
    await store.selectRun('run-b')
    await store.selectRun('run-a')
    store.appendLog(log('new-selection'))
    response.resolve([log('stale-selection')])
    await refreshing
    expect(store.currentRun?.id).toBe('run-a')
    expect(store.logs.map((entry) => entry.id)).toEqual(['local', 'new-selection'])
    expect(store.logsByRunId['run-a']).toEqual(store.logs)
  })

  it('A 的刷新日志返回时不能清除 B 尚未完成的加载标记', async () => {
    const store = setupStore()
    const logsA = deferred<RunLogEntry[]>()
    const logsB = deferred<RunLogEntry[]>()
    mocks.listRuns.mockResolvedValue([run(), run('run-b')])
    mocks.getLogs.mockImplementation((id: string) => id === 'run-a' ? logsA.promise : logsB.promise)
    const refreshing = store.refreshRuns()
    await vi.waitFor(() => expect(mocks.getLogs).toHaveBeenCalledWith('run-a'))
    const selecting = store.selectRun('run-b')
    await vi.waitFor(() => expect(mocks.getLogs).toHaveBeenCalledWith('run-b'))
    logsA.resolve([log('late-a')])
    await refreshing
    expect(store.currentRun?.id).toBe('run-b')
    expect(store.logsLoading).toBe(true)
    expect(store.logs).toEqual([])
    logsB.resolve([log('b')])
    await selecting
    expect(store.logsLoading).toBe(false)
    expect(store.logs).toEqual([log('b')])
  })

  it('日志刷新失败保留已协调的详情与已有日志', async () => {
    const store = setupStore()
    mocks.listRuns.mockResolvedValue([run('run-a', { status: 'success', backendStatus: 'SUCCESS', progress: 100 })])
    mocks.getLogs.mockRejectedValue(new Error('日志暂时不可用'))
    await store.refreshRuns()
    expect(store.currentRun?.status).toBe('success')
    expect(store.logs).toEqual([log('local')])
    expect(store.error).toContain('日志暂时不可用')
    expect(store.loading).toBe(false)
    expect(store.logsLoading).toBe(false)
  })

  it('初次加载仍可默认选中首项并读取其日志', async () => {
    const store = useRunStore()
    mocks.listRuns.mockResolvedValue([run()])
    mocks.getLogs.mockResolvedValue([log('history')])
    await store.loadRuns()
    expect(store.currentRun).toEqual(store.runs[0])
    expect(store.logs).toEqual([log('history')])
    expect(store.initialized).toBe(true)
  })

  it('刷新期间清空选择后不会恢复旧详情或日志', async () => {
    const store = setupStore()
    const response = deferred<WorkflowRun[]>()
    mocks.listRuns.mockReturnValue(response.promise)
    const pending = store.refreshRuns()
    store.clearCurrentRun()
    response.resolve([run()])
    await pending
    expect(store.currentRun).toBeNull()
    expect(store.logs).toEqual([])
    expect(store.realtimeRunId).toBeNull()
  })
})
