import { describe, expect, it } from 'vitest'
import type { RuntimeEvent } from '@/api/modules/runtime'
import { mapRuntimeEventToNodePatch, mapRuntimeEventsToNodePatches } from './runtimeMapper'

const event = (eventType: RuntimeEvent['eventType'], attributes: Record<string, unknown> = {}, nodeId = 'node-a'): RuntimeEvent => ({
  eventId: `${eventType}-${nodeId}`, eventType, workflowId: '101', traceId: 'trace-101', nodeId, runtimeState: 'RUNNING', attributes,
})
describe('运行重试次数映射', () => {
  it.each([1, 2, Number.MAX_SAFE_INTEGER])('只读取实际重试事件的有效序号 %s', attempt => {
    expect(mapRuntimeEventToNodePatch(event('NODE_RETRYING', { attempt }))?.retryCount).toBe(attempt)
  })
  it.each([undefined, null, '2', 0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('无效序号 %s 不伪造次数', attempt => {
    expect(mapRuntimeEventToNodePatch(event('NODE_RETRYING', { attempt }))?.retryCount).toBeUndefined()
  })
  it.each(['NODE_STARTED', 'NODE_COMPLETED', 'NODE_WAITING', 'WORKFLOW_FAILED', 'WORKFLOW_COMPLETED'] as const)('%s 业务属性不当成重试序号', type => {
    expect(mapRuntimeEventToNodePatch(event(type, { attempt: 9, retryCount: 9 }))?.retryCount).toBeUndefined()
  })
  it('完成回放、重复旧事件和无效重试保留各节点的最大已知序号', () => {
    const patches = mapRuntimeEventsToNodePatches([
      event('NODE_RETRYING', { attempt: 2 }), event('NODE_RETRYING', { attempt: 1 }),
      event('NODE_RETRYING', { attempt: 4 }, 'node-b'), event('NODE_COMPLETED', { attempt: 99 }),
      event('NODE_RETRYING', { attempt: '3' }, 'node-b'), event('NODE_COMPLETED', {}, 'node-b'),
    ])
    expect(patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'node-a', status: 'success', retryCount: 2 }),
      expect.objectContaining({ nodeId: 'node-b', status: 'success', retryCount: 4 }),
    ]))
  })
  it('没有重试事件的历史保持未知，不猜测为零', () => {
    expect(mapRuntimeEventsToNodePatches([event('NODE_STARTED'), event('NODE_COMPLETED')])[0]?.retryCount).toBeUndefined()
  })
})
