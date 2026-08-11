// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: {
    subscribeRun: vi.fn(() => vi.fn()),
  },
}))

import { useRunStore } from './runStore'
import { useWorkflowStore } from './workflowStore'

describe('真实运行初始化', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
