// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sseOptions: null as Record<string, any> | null,
  socketOptions: null as Record<string, any> | null,
  socketClose: vi.fn(),
}))

vi.mock('@/config/runtimeEnv', () => ({
  runtimeEnv: { notifyWebSocketFallback: true, mockFallback: false, runtimeWebSocketFallback: false, wsBase: '/ws' },
}))
vi.mock('@/api/modules/notify', () => ({
  buildNotifySseUrl: vi.fn(),
  issueNotifyStreamToken: vi.fn(),
  safeParseNotifyMessage: (value: unknown) => value,
}))
vi.mock('@/api/modules/runtime', () => ({ buildRuntimeSseUrl: vi.fn() }))
vi.mock('@/services/realtime/notificationSocket', () => ({
  createNotificationSocket: vi.fn((options: Record<string, any>) => {
    mocks.socketOptions = options
    return { connect: vi.fn(), close: mocks.socketClose }
  }),
}))
vi.mock('@/services/realtime/runtimeSocket', () => ({ createRuntimeSocket: vi.fn() }))
vi.mock('@/services/realtime/sseClient', () => ({
  createSseClient: vi.fn((options: Record<string, any>) => {
    mocks.sseOptions = options
    return { connect: vi.fn(), close: vi.fn() }
  }),
  SseHttpError: class SseHttpError extends Error {
    constructor(readonly status: number, readonly retryable = false) { super('synthetic') }
  },
}))

import { realtimeClient } from './realtimeClient'

describe('notification realtime open callbacks', () => {
  afterEach(() => {
    mocks.sseOptions = null
    mocks.socketOptions = null
    mocks.socketClose.mockClear()
    vi.restoreAllMocks()
  })

  it('reports transport opens, lets SSE take over, and ignores a stopped socket', async () => {
    const onOpen = vi.fn()
    const stop = realtimeClient.subscribeNotifications(7, { onOpen })
    await Promise.resolve()

    mocks.sseOptions!.onError(new Error('synthetic SSE interruption'))
    mocks.socketOptions!.onOpen()
    expect(onOpen).toHaveBeenLastCalledWith('websocket')

    mocks.sseOptions!.onOpen()
    expect(onOpen).toHaveBeenLastCalledWith('sse')
    expect(mocks.socketClose).toHaveBeenCalledTimes(1)

    mocks.socketOptions!.onOpen()
    expect(onOpen).toHaveBeenCalledTimes(2)

    stop()
    mocks.sseOptions!.onOpen()
    mocks.socketOptions!.onOpen()
    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
