import { describe, expect, it } from 'vitest'

import type { RuntimeEvent } from '@/api/modules/runtime'
import {
  mapObservationToRunPatch,
  mapRuntimeEventToLogEntry,
  mapRuntimeEventToNodePatch,
  mapRuntimeEventsToNodePatches,
  mapRuntimeStateToRunStatus,
} from '@/api/mappers/runtimeMapper'

describe('runtimeMapper waiting state', () => {
  it.each(['RUNNING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const)('保留 observation 的后端状态来源 %s', (runtimeState) => {
    expect(mapObservationToRunPatch({ workflowId: '101', traceId: 'trace-101', runtimeState })).toMatchObject({
      backendStatus: runtimeState,
      status: mapRuntimeStateToRunStatus(runtimeState),
    })
  })

  it('取消运行映射为 cancelled 终态，不能与 WAITING 混淆', () => {
    expect(mapRuntimeStateToRunStatus('CANCELLED')).toBe('cancelled')
    expect(mapObservationToRunPatch({ workflowId: '101', traceId: 'trace-101', runtimeState: 'CANCELLED' })).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED' })
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

  it('keeps ordinary external task waits separate from human approval', () => {
    const event: RuntimeEvent = {
      eventId: 'event-ai-wait', eventType: 'NODE_WAITING', workflowId: '101', traceId: 'trace-101',
      nodeId: 'node-ai', runtimeState: 'WAITING', attributes: { nodeType: 'LLM', externalTaskId: 712 },
    }

    const patch = mapRuntimeEventToNodePatch(event)
    expect(patch?.status).toBe('paused')
    expect(patch?.approval).toBeNull()
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

  it('mixed replay order lets the newest wait kind replace stale approval state', () => {
    const human: RuntimeEvent = {
      eventId: 'human', eventType: 'NODE_WAITING', workflowId: '101', traceId: 'trace-101',
      nodeId: 'node-shared', runtimeState: 'WAITING',
      attributes: { approved: false, approvalStatus: 'pending', reviewer: 'ops', method: 'webapp' },
    }
    const external: RuntimeEvent = {
      eventId: 'ai', eventType: 'NODE_WAITING', workflowId: '101', traceId: 'trace-101',
      nodeId: 'node-shared', runtimeState: 'WAITING', attributes: { nodeType: 'LLM', externalTaskId: 712 },
    }

    expect(mapRuntimeEventsToNodePatches([human, external])[0]?.approval).toBeNull()
    expect(mapRuntimeEventsToNodePatches([external, human])[0]?.approval).toMatchObject({ approvalStatus: 'pending' })
  })
})
