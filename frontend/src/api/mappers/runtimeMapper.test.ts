import { describe, expect, it } from 'vitest'

import type { RuntimeEvent } from '@/api/modules/runtime'
import {
  mapRuntimeEventToLogEntry,
  mapRuntimeEventToNodePatch,
  mapRuntimeStateToRunStatus,
} from '@/api/mappers/runtimeMapper'

describe('runtimeMapper waiting state', () => {
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
})
