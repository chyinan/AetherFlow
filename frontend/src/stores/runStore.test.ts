// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runApiMocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  getRun: vi.fn(),
  getLogs: vi.fn(),
  recoverRuntime: vi.fn(),
}))

const realtimeMocks = vi.hoisted(() => ({
  subscribeRun: vi.fn((_options: unknown, _handlers: {
    onLog?: (entry: unknown) => void
    onNodePatch?: (patch: unknown) => void
    onRunPatch?: (patch: unknown) => void
    onConnectionChange?: (state: 'online' | 'reconnecting' | 'offline') => void
  }) => vi.fn()),
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
  realtimeClient: {
    subscribeRun: realtimeMocks.subscribeRun,
  },
}))

import { useRunStore } from './runStore'
import { useWorkflowStore } from './workflowStore'
import type { RunLogEntry, WorkflowRun } from '@/types/run'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function run(id: string): WorkflowRun {
  return {
    id,
    workflowId: `workflow-${id}`,
    workflowName: id,
    status: 'running',
    startedAt: '2026-08-30 00:00:00',
    durationMs: 0,
    trigger: 'manual',
    owner: 'operator',
    traceId: `trace-${id}`,
    queueName: 'workflow-runtime',
    progress: 0,
    artifactCount: 0,
    artifactNames: [],
    nodeStates: [],
    backendInstanceId: id === 'run-a' ? 101 : 102,
    runtimeWorkflowId: id === 'run-a' ? '101' : '102',
  }
}

describe('真实运行初始化', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    runApiMocks.listRuns.mockReset()
    runApiMocks.getRun.mockReset()
    runApiMocks.getLogs.mockReset()
    runApiMocks.recoverRuntime.mockReset()
    realtimeMocks.subscribeRun.mockReset()
    realtimeMocks.subscribeRun.mockImplementation(() => vi.fn())
  })

  it('在后端产出前不展示示例输出和示例产物', () => {
    const runStore = useRunStore()

    const run = runStore.createRunFromWorkflow({
      runId: 'run-101',
      workflowId: 'workflow-1',
      workflowName: '真实工作流',
      nodes: [
        {
          id: 'node-1',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: '开始',
            description: '开始节点',
            kind: 'start',
            config: {},
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      backendInstanceId: 101,
      runtimeWorkflowId: '101',
      backendStatus: 'RUNNING',
    })

    expect(run.artifactCount).toBe(0)
    expect(run.artifactNames).toEqual([])
    expect(run.nodeStates[0]?.output).toBeUndefined()
  })

  it('在恢复请求前应用人工审批结果和运行快照', () => {
    const runStore = useRunStore()

    runStore.createRunFromWorkflow({
      runId: 'run-102',
      workflowId: 'workflow-2',
      workflowName: '需要审批的工作流',
      nodes: [
        {
          id: 'node-human',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: '人工审批',
            description: '等待人工审批',
            kind: 'human',
            config: {},
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
        {
          id: 'node-next',
          type: 'workflow',
          position: { x: 160, y: 0 },
          data: {
            label: '下一节点',
            description: '审批后继续执行',
            kind: 'output',
            config: {},
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      backendInstanceId: 102,
      runtimeWorkflowId: '102',
      backendStatus: 'WAITING',
    })

    runStore.patchNodeState({
      nodeId: 'node-human',
      label: '人工审批',
      status: 'paused',
      approval: {
        approved: false,
        approvalStatus: 'pending',
        reviewer: 'ops',
        method: 'webapp',
      },
    })

    runStore.applyHumanApprovalSnapshot({
      nodeId: 'node-human',
      approved: true,
      snapshot: {
        workflowId: '102',
        runtimeState: 'RUNNING',
        currentNodeId: 'node-next',
        currentNodeIds: ['node-next'],
      },
    })

    expect(runStore.currentRun?.nodeStates[0]).toMatchObject({
      nodeId: 'node-human',
      status: 'success',
      approval: {
        approved: true,
        approvalStatus: 'approved',
      },
    })
    expect(runStore.currentRun).toMatchObject({
      backendStatus: 'RUNNING',
      currentNodeId: 'node-next',
      runtimeWorkflowId: '102',
      status: 'running',
    })
  })

  it('不会把其他工作流的运行节点状态写入当前工作流画布', () => {
    const runStore = useRunStore()
    const workflowStore = useWorkflowStore()
    workflowStore.workflowId = 'workflow-a'
    workflowStore.nodes = [{
      id: 'shared-node-id',
      type: 'workflow',
      position: { x: 0, y: 0 },
      data: {
        label: '当前工作流节点',
        description: '',
        kind: 'start',
        config: {},
        inputs: [],
        outputs: [],
        status: 'idle',
      },
    }]

    runStore.createRunFromWorkflow({
      runId: 'run-103',
      workflowId: 'workflow-b',
      workflowName: '另一个工作流',
      nodes: workflowStore.nodes,
    })
    runStore.patchNodeState({
      nodeId: 'shared-node-id',
      label: '另一个工作流节点',
      status: 'success',
    })

    expect(workflowStore.nodes[0]?.data.status).toBe('idle')
  })

  it('快速切换运行时忽略较早请求的迟到日志', async () => {
    const runStore = useRunStore()
    const logsA = deferred<Array<RunLogEntry>>()
    const logsB = deferred<Array<RunLogEntry>>()
    runStore.runs = [run('run-a'), run('run-b')]
    runStore.initialized = true
    runApiMocks.getLogs.mockImplementation((runId: string) => runId === 'run-a' ? logsA.promise : logsB.promise)
    runApiMocks.recoverRuntime.mockImplementation(async (selectedRun: WorkflowRun) => ({
      nodePatches: [],
      runPatch: { currentNodeId: `node-${selectedRun.id}` },
      logs: [{ id: `recovery-${selectedRun.id}`, time: '00:00:00', level: 'info', message: selectedRun.id }],
    }))

    const selectingA = runStore.selectRun('run-a')
    const selectingB = runStore.selectRun('run-b')
    logsB.resolve([{ id: 'log-b', time: '00:00:00', level: 'info', message: 'B' }])
    await selectingB
    logsA.resolve([{ id: 'log-a', time: '00:00:01', level: 'info', message: 'A' }])
    await selectingA

    expect(runStore.currentRun?.id).toBe('run-b')
    expect(runStore.currentRun?.currentNodeId).toBe('node-run-b')
    expect(runStore.logs.map((entry) => entry.id)).toEqual(['log-b', 'recovery-run-b'])
    expect(runStore.logsByRunId['run-b']?.map((entry) => entry.id)).toEqual(['log-b', 'recovery-run-b'])
  })

  it('切换运行后日志加载失败时不保留上一个运行的日志', async () => {
    const runStore = useRunStore()
    runStore.runs = [run('run-a'), run('run-b')]
    runStore.currentRun = runStore.runs[0]!
    runStore.logs = [{ id: 'log-a', time: '00:00:00', level: 'info', message: 'A' }]
    runStore.initialized = true
    runApiMocks.getLogs.mockRejectedValue(new Error('logs unavailable'))

    await runStore.selectRun('run-b')

    expect(runStore.currentRun?.id).toBe('run-b')
    expect(runStore.logs).toEqual([])
    expect(runStore.error).toContain('logs unavailable')
  })

  it('清空运行时使未完成选择失效并复位加载与错误状态', async () => {
    const runStore = useRunStore()
    const logsA = deferred<Array<RunLogEntry>>()
    runStore.runs = [run('run-a')]
    runStore.initialized = true
    runStore.error = 'stale error'
    runApiMocks.getLogs.mockReturnValue(logsA.promise)

    const selectingA = runStore.selectRun('run-a')

    runStore.clearCurrentRun()
    logsA.resolve([{ id: 'log-a', time: '00:00:00', level: 'info', message: 'A' }])
    await selectingA

    expect(runStore.currentRun).toBeNull()
    expect(runStore.loading).toBe(false)
    expect(runStore.logsLoading).toBe(false)
    expect(runStore.error).toBeNull()
  })

  it('首次加载并快速选择时忽略较早的列表响应', async () => {
    const runStore = useRunStore()
    const listA = deferred<Array<WorkflowRun>>()
    const listB = deferred<Array<WorkflowRun>>()
    runApiMocks.listRuns
      .mockReturnValueOnce(listA.promise)
      .mockReturnValueOnce(listB.promise)
    runApiMocks.getLogs.mockResolvedValue([])
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: [] })

    const selectingA = runStore.selectRun('run-a')
    const selectingB = runStore.selectRun('run-b')
    listB.resolve([run('run-a'), run('run-b')])
    await selectingB
    listA.resolve([run('run-a')])
    await selectingA

    expect(runStore.currentRun?.id).toBe('run-b')
    expect(runStore.runs.map((item) => item.id)).toEqual(['run-a', 'run-b'])
    expect(runStore.loading).toBe(false)
  })

  it('创建新运行时使未完成的旧选择失效', async () => {
    const runStore = useRunStore()
    const logsA = deferred<Array<RunLogEntry>>()
    runStore.runs = [run('run-a')]
    runStore.initialized = true
    runApiMocks.getLogs.mockReturnValue(logsA.promise)

    const selectingA = runStore.selectRun('run-a')
    runStore.createRunFromWorkflow({
      runId: 'run-b',
      workflowId: 'workflow-b',
      workflowName: 'B',
      nodes: [],
      backendInstanceId: 102,
      runtimeWorkflowId: '102',
    })
    logsA.resolve([{ id: 'log-a', time: '00:00:00', level: 'info', message: 'A' }])
    await selectingA

    expect(runStore.currentRun?.id).toBe('run-b')
  })

  it('忽略旧运行详情请求的迟到响应', async () => {
    const runStore = useRunStore()
    const runA = deferred<WorkflowRun>()
    runStore.initialized = true
    runApiMocks.getRun
      .mockReturnValueOnce(runA.promise)
      .mockResolvedValueOnce(run('run-b'))
    runApiMocks.getLogs.mockResolvedValue([])
    runApiMocks.recoverRuntime.mockResolvedValue({ nodePatches: [], logs: [] })

    const selectingA = runStore.selectRun('run-a')
    await vi.waitFor(() => {
      expect(runApiMocks.getRun).toHaveBeenCalledWith('run-a')
    })
    const selectingB = runStore.selectRun('run-b')
    await selectingB
    runA.resolve(run('run-a'))
    await selectingA

    expect(runStore.currentRun?.id).toBe('run-b')
  })

  it('忽略较早运行恢复请求的迟到结果', async () => {
    const runStore = useRunStore()
    const recoveryA = deferred<{ nodePatches: []; runPatch: { currentNodeId: string }; logs: Array<RunLogEntry> }>()
    runStore.runs = [run('run-a'), run('run-b')]
    runStore.initialized = true
    runApiMocks.getLogs.mockResolvedValue([])
    runApiMocks.recoverRuntime.mockImplementation((selectedRun: WorkflowRun) => selectedRun.id === 'run-a'
      ? recoveryA.promise
      : Promise.resolve({ nodePatches: [], runPatch: { currentNodeId: 'node-run-b' }, logs: [] }))

    const selectingA = runStore.selectRun('run-a')
    await vi.waitFor(() => {
      expect(runApiMocks.recoverRuntime).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-a' }))
    })
    await runStore.selectRun('run-b')
    recoveryA.resolve({ nodePatches: [], runPatch: { currentNodeId: 'node-run-a' }, logs: [] })
    await selectingA

    expect(runStore.currentRun?.id).toBe('run-b')
    expect(runStore.currentRun?.currentNodeId).toBe('node-run-b')
  })

  it('忽略旧实时订阅迟到的连接状态', () => {
    const runStore = useRunStore()
    runStore.currentRun = run('run-a')
    runStore.subscribeCurrentRun()
    const oldHandlers = realtimeMocks.subscribeRun.mock.calls[0]?.[1]
    runStore.currentRun = run('run-b')
    runStore.subscribeCurrentRun()
    const newHandlers = realtimeMocks.subscribeRun.mock.calls[1]?.[1]

    newHandlers?.onConnectionChange?.('online')
    oldHandlers?.onConnectionChange?.('offline')

    expect(runStore.runRealtimeState).toBe('online')
  })

  it('同一运行重新订阅时忽略旧订阅代次的连接状态', () => {
    const runStore = useRunStore()
    runStore.currentRun = run('run-a')
    runStore.subscribeCurrentRun()
    const oldHandlers = realtimeMocks.subscribeRun.mock.calls[0]?.[1]
    runStore.subscribeCurrentRun()
    const newHandlers = realtimeMocks.subscribeRun.mock.calls[1]?.[1]

    newHandlers?.onConnectionChange?.('online')
    oldHandlers?.onConnectionChange?.('offline')

    expect(runStore.runRealtimeState).toBe('online')
  })

  it('忽略 SSE 重连带来的重复日志事件', () => {
    const runStore = useRunStore()
    const entry: RunLogEntry = {
      id: 'event-1',
      time: '12:00:00',
      level: 'info',
      message: 'node completed',
    }

    runStore.appendLog(entry)
    runStore.appendLog(entry)

    expect(runStore.logs).toHaveLength(1)
  })

  it('忽略迟到的节点运行事件，避免终态回退', () => {
    const runStore = useRunStore()
    runStore.currentRun = run('run-a')
    runStore.currentRun.nodeStates = [{ nodeId: 'node-a', label: 'A', status: 'success', retryCount: 0 }]

    runStore.patchNodeState({ nodeId: 'node-a', label: 'A', status: 'running', retryCount: 0 })

    expect(runStore.currentRun.nodeStates[0]?.status).toBe('success')
  })
})
