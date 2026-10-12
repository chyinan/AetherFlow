import { describe, expect, it } from 'vitest'

import type { RuntimeEvent } from '@/api/modules/runtime'
import {
  mapObservationToRunPatch,
  mapRuntimeEventToLogEntry,
  mapRuntimeEventToNodePatch,
  mapRuntimeStateToRunStatus,
} from '@/api/mappers/runtimeMapper'

describe('runtimeMapper waiting state', () => {
  it.each(['RUNNING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const)('保留 observation 的后端状态来源 %s', (runtimeState) => {
    expect(mapObservationToRunPatch({ workflowId: '101', traceId: 'trace-101', runtimeState })).toMatchObject({
      backendStatus: runtimeState,
      status: mapRuntimeStateToRunStatus(runtimeState),
    })
  })

  it('maps waiting workflow to paused instead of running', () => {
    expect(mapRuntimeStateToRunStatus('WAITING')).toBe('paused')
  })

  it('maps node waiting event to paused with an actionable message', () => {
    const event: RuntimeEvent = {
      eventId: 'event-1',
      eventType: 'NODE_WAITING',
      workflowId: '101',
      traceId: 'trace-101',
      nodeId: 'node-ai',
      runtimeState: 'RUNNING',
    }

    expect(mapRuntimeEventToNodePatch(event)?.status).toBe('paused')
    expect(mapRuntimeEventToLogEntry(event).message).toContain('waiting for an external result')
  })

  it('preserves human approval details from a waiting event', () => {
    const event: RuntimeEvent = {
      eventId: 'event-human-1',
      eventType: 'NODE_WAITING',
      workflowId: '101',
      traceId: 'trace-101',
      nodeId: 'node-human',
      runtimeState: 'WAITING',
      attributes: {
        approved: false,
        approvalStatus: 'pending',
        reviewer: 'ops',
        method: 'webapp',
      },
    }

    expect(mapRuntimeEventToNodePatch(event)?.approval).toEqual({
      approved: false,
      approvalStatus: 'pending',
      reviewer: 'ops',
      method: 'webapp',
    })
  })
})
