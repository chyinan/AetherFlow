import { describe, expect, it } from 'vitest'

import { isActiveWorkflowRun, isWaitingWorkflowRun, workflowRunBelongsToWorkflow } from './workflowRunState'

describe('工作流运行状态', () => {
  it('将 WAITING 运行视为活跃，阻止重复启动', () => {
    expect(isActiveWorkflowRun({ status: 'paused', backendStatus: 'WAITING' })).toBe(true)
    expect(isWaitingWorkflowRun({ status: 'paused', backendStatus: 'WAITING' })).toBe(true)
  })

  it('允许重新启动已取消的 paused 运行', () => {
    expect(isActiveWorkflowRun({ status: 'paused', backendStatus: 'CANCELLED' })).toBe(false)
    expect(isWaitingWorkflowRun({ status: 'paused', backendStatus: 'CANCELLED' })).toBe(false)
  })

  it('保留 queued/running 的活跃语义，并拒绝已结束状态', () => {
    expect(isActiveWorkflowRun({ status: 'queued' })).toBe(true)
    expect(isActiveWorkflowRun({ status: 'running' })).toBe(true)
    expect(isActiveWorkflowRun({ status: 'success', backendStatus: 'SUCCESS' })).toBe(false)
    expect(isActiveWorkflowRun({ status: 'failed', backendStatus: 'FAILED' })).toBe(false)
  })

  it('在旧快照缺少后端状态但仍有待审批节点时保持阻塞', () => {
    expect(isActiveWorkflowRun({
      status: 'paused',
      nodeStates: [{ approval: { approved: false, approvalStatus: 'pending' } }],
    })).toBe(true)
    expect(isWaitingWorkflowRun({
      status: 'paused',
      nodeStates: [{ approval: { approved: false, approvalStatus: 'pending' } }],
    })).toBe(true)
  })

  it('允许通过后端 definitionId 识别刷新后缺少本地 workflowId 的运行', () => {
    expect(workflowRunBelongsToWorkflow(
      { workflowId: 'wf-definition-42', definitionId: 42, status: 'paused', backendStatus: 'WAITING' },
      'workflow-42',
      42,
    )).toBe(true)
    expect(workflowRunBelongsToWorkflow(
      { workflowId: 'wf-definition-43', definitionId: 43, status: 'running' },
      'workflow-42',
      42,
    )).toBe(false)
  })
})
