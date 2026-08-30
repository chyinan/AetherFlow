import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

  it('在正式运行订阅中接入 WebSocket 备用通道而不是演示流', () => {
    const source = readFileSync(fileURLToPath(new URL('./realtimeClient.ts', import.meta.url)), 'utf8')

    expect(source).toContain('runtimeWebSocketFallback')
    expect(source).toContain('createRuntimeSocket')
    expect(source).toContain('cursor: lastCursor')
  })
})
