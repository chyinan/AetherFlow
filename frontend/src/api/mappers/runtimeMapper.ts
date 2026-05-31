import type { RuntimeEvent, RuntimeObservation, RuntimeState } from '@/api/modules/runtime'
import type { RunLogEntry, RunNodeState, RunStatus, WorkflowRun } from '@/types/run'
import type { WorkflowNodeStatus } from '@/types/workflow'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatTime(value?: string) {
  if (!value) {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

export function mapRuntimeStateToRunStatus(state?: RuntimeState): RunStatus {
  switch (state) {
    case 'PENDING':
      return 'queued'
    case 'RUNNING':
    case 'RETRYING':
      return 'running'
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'paused'
    default:
      return 'running'
  }
}

export function mapRuntimeStateToNodeStatus(state?: RuntimeState): WorkflowNodeStatus {
  switch (state) {
    case 'PENDING':
      return 'queued'
    case 'RUNNING':
    case 'RETRYING':
      return 'running'
    case 'SUCCESS':
      return 'success'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'paused'
    default:
      return 'queued'
  }
}

export function mapObservationProgress(progress?: number) {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) {
    return undefined
  }

  return Math.round(clamp(progress, 0, 1) * 100)
}

export function mapObservationToRunPatch(
  observation: RuntimeObservation | null | undefined,
): Partial<WorkflowRun> {
  const patch: Partial<WorkflowRun> = {}

  if (!observation) {
    return patch
  }

  const progress = mapObservationProgress(observation.progress)

  if (progress !== undefined) {
    patch.progress = progress
  }
  if (observation.runtimeState) {
    patch.status = mapRuntimeStateToRunStatus(observation.runtimeState)
  }
  if (observation.traceId) {
    patch.traceId = observation.traceId
  }
  if (observation.currentNodeId) {
    patch.currentNodeId = observation.currentNodeId
  }
  if (observation.workflowId) {
    patch.runtimeWorkflowId = observation.workflowId
  }

  return patch
}

function mapRuntimeEventToNodeStatus(event: RuntimeEvent): WorkflowNodeStatus {
  switch (event.eventType) {
    case 'NODE_STARTED':
      return 'running'
    case 'NODE_COMPLETED':
      return 'success'
    case 'NODE_RETRYING':
      return 'running'
    case 'WORKFLOW_FAILED':
      return 'failed'
    case 'WORKFLOW_CANCELLED':
      return 'paused'
    default:
      return mapRuntimeStateToNodeStatus(event.runtimeState)
  }
}

function eventLevel(event: RuntimeEvent): RunLogEntry['level'] {
  if (event.eventType === 'WORKFLOW_FAILED' || event.runtimeState === 'FAILED') {
    return 'error'
  }
  if (event.eventType === 'NODE_RETRYING' || event.runtimeState === 'RETRYING') {
    return 'warn'
  }
  if (event.eventType === 'NODE_COMPLETED') {
    return 'debug'
  }

  return 'info'
}

function eventMessage(event: RuntimeEvent) {
  const target = event.nodeId ? `node ${event.nodeId}` : `workflow ${event.workflowId}`

  switch (event.eventType) {
    case 'WORKFLOW_STARTED':
      return `Workflow ${event.workflowId} started.`
    case 'NODE_STARTED':
      return `Runtime started ${target}.`
    case 'NODE_COMPLETED':
      return `Runtime completed ${target}.`
    case 'NODE_RETRYING':
      return `Runtime retrying ${target}.`
    case 'WORKFLOW_COMPLETED':
      return `Workflow ${event.workflowId} completed.`
    case 'WORKFLOW_FAILED':
      return `Workflow ${event.workflowId} failed.`
    case 'WORKFLOW_CANCELLED':
      return `Workflow ${event.workflowId} cancelled.`
    default:
      return `${event.eventType} for ${target}.`
  }
}

function durationBetween(startedAt?: string, completedAt?: string) {
  if (!startedAt || !completedAt) {
    return undefined
  }

  const started = new Date(startedAt)
  const completed = new Date(completedAt)
  if (Number.isNaN(started.getTime()) || Number.isNaN(completed.getTime()) || completed < started) {
    return undefined
  }

  return completed.getTime() - started.getTime()
}

export function mapRuntimeEventToLogEntry(event: RuntimeEvent): RunLogEntry {
  return {
    id: event.eventId || `${event.workflowId}-${event.eventType}-${event.occurredAt ?? Date.now()}`,
    time: formatTime(event.occurredAt),
    level: eventLevel(event),
    message: eventMessage(event),
    nodeId: event.nodeId,
  }
}

export function mapRuntimeEventToNodePatch(event: RuntimeEvent): RunNodeState | null {
  if (!event.nodeId) {
    return null
  }

  return {
    nodeId: event.nodeId,
    label: event.nodeId,
    status: mapRuntimeEventToNodeStatus(event),
    output: event.eventType,
  }
}

export function mapRuntimeEventsToNodePatches(events: RuntimeEvent[]) {
  const patches = new Map<string, RunNodeState>()
  const startedAtByNode = new Map<string, string>()

  events.forEach((event) => {
    if (event.nodeId && event.eventType === 'NODE_STARTED' && event.occurredAt) {
      startedAtByNode.set(event.nodeId, event.occurredAt)
    }

    const patch = mapRuntimeEventToNodePatch(event)
    if (patch) {
      const durationMs = durationBetween(startedAtByNode.get(patch.nodeId), event.occurredAt)
      if (durationMs !== undefined && ['success', 'failed', 'paused'].includes(patch.status)) {
        patch.durationMs = durationMs
      }
      patches.set(patch.nodeId, patch)
    }
  })

  return [...patches.values()]
}
