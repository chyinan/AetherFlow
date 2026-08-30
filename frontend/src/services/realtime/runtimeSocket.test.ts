import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  issueToken: vi.fn(),
  buildUrl: vi.fn(),
}))

vi.mock('@/api/modules/runtime', () => ({
  issueRuntimeStreamToken: mocks.issueToken,
  buildRuntimeWebSocketUrl: mocks.buildUrl,
}))

import { createRuntimeSocket } from './runtimeSocket'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: Array<FakeWebSocket> = []

  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }

  serverClose(code = 1012) {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code })
  }
}

describe('runtime websocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    mocks.issueToken.mockReset().mockResolvedValue({ token: 'token-1', queryParam: 'streamToken' })
    mocks.buildUrl.mockReset().mockReturnValue('ws://localhost/workflow/runtime/ws/1001')
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses a short-lived token and advances the reconnect cursor from runtime frames', async () => {
    const onMessage = vi.fn()
    const socket = createRuntimeSocket({ workflowId: '1001', cursor: 'event-1', onMessage })

    socket.connect()
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const transport = FakeWebSocket.instances[0]
    transport.open()
    transport.message({ event: 'runtime-event', cursor: 'event-2', data: { eventId: 'event-2' } })

    expect(mocks.issueToken).toHaveBeenCalledWith('1001')
    expect(mocks.buildUrl).toHaveBeenCalledWith('1001', 'token-1', 'streamToken', 'event-1')
    expect(onMessage).toHaveBeenCalledWith({
      event: 'runtime-event',
      cursor: 'event-2',
      data: { eventId: 'event-2' },
    })
    expect(socket.cursor()).toBe('event-2')
  })

  it('gets a new token on reconnect and resumes after the last delivered cursor', async () => {
    vi.useFakeTimers()
    mocks.issueToken
      .mockResolvedValueOnce({ token: 'token-1', workflowId: '1001', queryParam: 'streamToken' })
      .mockResolvedValueOnce({ token: 'token-2', workflowId: '1001', queryParam: 'streamToken' })
    const socket = createRuntimeSocket({
      workflowId: '1001',
      cursor: 'event-1',
      reconnectBaseMs: 1,
      reconnectMaxMs: 1,
    })

    socket.connect()
    await Promise.resolve()
    await Promise.resolve()
    const first = FakeWebSocket.instances[0]
    first.open()
    first.message({ event: 'runtime-event', cursor: 'event-2', data: { eventId: 'event-2' } })
    first.serverClose()
    await vi.runAllTimersAsync()
    await Promise.resolve()

    expect(mocks.issueToken).toHaveBeenCalledTimes(2)
    expect(mocks.buildUrl).toHaveBeenLastCalledWith('1001', 'token-2', 'streamToken', 'event-2')
    socket.close()
  })
})
