import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  issueToken: vi.fn(),
  buildUrl: vi.fn(),
}))

vi.mock('@/api/modules/notify', () => ({
  issueNotifyStreamToken: mocks.issueToken,
  buildNotifyWebSocketUrl: mocks.buildUrl,
  safeParseNotifyMessage: (value: unknown) => value,
}))

import { createNotificationSocket } from './notificationSocket'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event?: CloseEvent) => void) | null = null

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }
}

describe('notification websocket lifecycle', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    mocks.issueToken.mockReset().mockResolvedValue({ token: 'token-1', queryParam: 'streamToken' })
    mocks.buildUrl.mockReset().mockReturnValue('ws://localhost/notify/ws')
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ignores a delayed onopen after the socket has been manually closed', async () => {
    const onOpen = vi.fn()
    const socket = createNotificationSocket({ userId: 7, onOpen })
    socket.connect()
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))

    const transport = FakeWebSocket.instances[0]!
    socket.close()
    transport.open()

    expect(onOpen).not.toHaveBeenCalled()
  })
})
