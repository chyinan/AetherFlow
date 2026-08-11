import type { RunNodeState, WorkflowRun } from '@/types/run'

type WorkflowRunStateSnapshot = Pick<WorkflowRun, 'status' | 'backendStatus'> & {
  workflowId?: WorkflowRun['workflowId']
  definitionId?: WorkflowRun['definitionId']
  nodeStates?: Array<Pick<RunNodeState, 'approval'>>
}

const ACTIVE_BACKEND_STATUSES = new Set(['PENDING', 'RUNNING', 'RETRYING', 'WAITING'])

function normalizedBackendStatus(run: WorkflowRunStateSnapshot) {
  const value = String(run.backendStatus ?? '').trim().toUpperCase()
  return value || undefined
}

function hasPendingApproval(run: WorkflowRunStateSnapshot) {
  return run.nodeStates?.some((node) => node.approval?.approvalStatus === 'pending') ?? false
}

export function workflowRunBelongsToWorkflow(
  run: WorkflowRunStateSnapshot,
  workflowId: string,
  backendDefinitionId?: number | null,
) {
  return run.workflowId === workflowId
    || (typeof backendDefinitionId === 'number'
      && backendDefinitionId > 0
      && run.definitionId === backendDefinitionId)
}

export function isWaitingWorkflowRun(run: WorkflowRunStateSnapshot | null | undefined) {
  if (!run) {
    return false
  }

  const backendStatus = normalizedBackendStatus(run)
  if (backendStatus) {
    return backendStatus === 'WAITING'
  }

  return run.status === 'paused' && hasPendingApproval(run)
}

export function isActiveWorkflowRun(run: WorkflowRunStateSnapshot | null | undefined) {
  if (!run) {
    return false
  }

  const backendStatus = normalizedBackendStatus(run)
  if (backendStatus) {
    return ACTIVE_BACKEND_STATUSES.has(backendStatus)
  }

  if (run.status === 'queued' || run.status === 'running') {
    return true
  }

  return run.status === 'paused' && hasPendingApproval(run)
}
