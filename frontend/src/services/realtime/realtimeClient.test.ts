import { describe, expect, it, vi } from 'vitest'

import { realtimeClient } from './realtimeClient'

describe('正式运行实时订阅', () => {
  it('缺少运行时 ID 时不启动演示事件流', () => {
    const onConnectionChange = vi.fn()
    const onNodePatch = vi.fn()

    const stop = realtimeClient.subscribeRun({ runId: 'run-without-runtime-id' }, {
      onConnectionChange,
      onNodePatch,
    })

    expect(onConnectionChange).toHaveBeenCalledWith('offline')
    expect(onNodePatch).not.toHaveBeenCalled()
    expect(stop).toBeTypeOf('function')
  })
})
