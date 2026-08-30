// pattern: Imperative Shell
import {
  buildRuntimeWebSocketUrl,
  issueRuntimeStreamToken,
} from '@/api/modules/runtime'
import type { RealtimeConnectionState } from '@/services/realtime/sseClient'

export type RuntimeSocketFrame = {
  event: 'runtime-event' | 'heartbeat'
  cursor: string
  data: unknown
}

export type RuntimeSocketOptions = {
  workflowId: string
  cursor?: string
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  maxReconnectAttempts?: number
  onOpen?: () => void
  onMessage?: (frame: RuntimeSocketFrame) => void
  onError?: (error: unknown) => void
  onClose?: (event?: CloseEvent) => void
  onReconnect?: (attempt: number, delayMs: number) => void
  onConnectionChange?: (state: RealtimeConnectionState) => void
}

export type RuntimeSocketConnection = {
  connect: () => void
  close: () => void
  cursor: () => string | undefined
}

const DEFAULT_RECONNECT_BASE_MS = 600
const DEFAULT_RECONNECT_MAX_MS = 12_000
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5

function jitteredDelay(baseMs: number, maxMs: number, attempt: number) {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
  const jitter = Math.round(exponential * (0.2 + Math.random() * 0.6))
  return Math.min(maxMs, exponential + jitter)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFrame(value: unknown): RuntimeSocketFrame | null {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      return null
    }
  }
  if (!isRecord(parsed)
    || (parsed.event !== 'runtime-event' && parsed.event !== 'heartbeat')) {
    return null
  }
  return {
    event: parsed.event,
    cursor: typeof parsed.cursor === 'string' ? parsed.cursor : '',
    data: parsed.data,
  }
}

export function createRuntimeSocket(options: RuntimeSocketOptions): RuntimeSocketConnection {
  let socket: WebSocket | null = null
  let closedManually = false
  let connecting = false
  let reconnectAttempt = 0
  let reconnectTimer: number | null = null
  let lastCursor = options.cursor

  const reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS
  const reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS
  const maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      globalThis.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (closedManually || reconnectAttempt >= maxReconnectAttempts) {
      options.onConnectionChange?.('offline')
      return
    }
    reconnectAttempt += 1
    const delayMs = jitteredDelay(reconnectBaseMs, reconnectMaxMs, reconnectAttempt)
    options.onConnectionChange?.('reconnecting')
    options.onReconnect?.(reconnectAttempt, delayMs)
    clearReconnectTimer()
    reconnectTimer = globalThis.setTimeout(connect, delayMs) as unknown as number
  }

  async function openSocket() {
    connecting = true
    try {
      const streamToken = await issueRuntimeStreamToken(options.workflowId)
      if (closedManually) {
        return
      }
      if (!streamToken.token || (streamToken.workflowId && streamToken.workflowId !== options.workflowId)) {
        throw new Error('Workflow stream token scope mismatch')
      }
      const nextSocket = new WebSocket(buildRuntimeWebSocketUrl(
        options.workflowId,
        streamToken.token,
        streamToken.queryParam || 'streamToken',
        lastCursor,
      ))
      socket = nextSocket

      nextSocket.onopen = () => {
        if (socket !== nextSocket) return
        reconnectAttempt = 0
        options.onConnectionChange?.('online')
        options.onOpen?.()
      }
      nextSocket.onmessage = (event) => {
        if (socket !== nextSocket || event.data instanceof Blob) return
        const frame = parseFrame(event.data)
        if (!frame) return
        if (frame.cursor) lastCursor = frame.cursor
        options.onMessage?.(frame)
      }
      nextSocket.onerror = (event) => {
        if (socket === nextSocket) options.onError?.(event)
      }
      nextSocket.onclose = (event) => {
        if (socket !== nextSocket) return
        socket = null
        options.onClose?.(event)
        if (!closedManually) scheduleReconnect()
      }
    } catch (error) {
      options.onError?.(error)
      if (!closedManually) scheduleReconnect()
    } finally {
      connecting = false
    }
  }

  function connect() {
    if (closedManually || typeof WebSocket === 'undefined') {
      options.onConnectionChange?.('offline')
      return
    }
    clearReconnectTimer()
    if (connecting || socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) {
      return
    }
    void openSocket()
  }

  function close() {
    closedManually = true
    connecting = false
    clearReconnectTimer()
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.onclose = null
      socket.close()
    }
    socket = null
    options.onConnectionChange?.('offline')
  }

  return {
    connect,
    close,
    cursor: () => lastCursor,
  }
}
