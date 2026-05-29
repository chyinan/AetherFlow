import { buildNotifyWebSocketUrl, safeParseNotifyMessage, type NotifyMessageDTO } from '@/api/modules/notify'
import type { RealtimeConnectionState } from '@/services/realtime/sseClient'

export interface NotificationSocketOptions {
  userId: number | string
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  maxReconnectAttempts?: number
  onOpen?: () => void
  onMessage?: (message: NotifyMessageDTO) => void
  onError?: (error: Event | Error) => void
  onClose?: (event?: CloseEvent) => void
  onReconnect?: (attempt: number, delayMs: number) => void
  onConnectionChange?: (state: RealtimeConnectionState) => void
}

export interface NotificationSocketConnection {
  connect: () => void
  close: () => void
}

const defaultReconnectBaseMs = 600
const defaultReconnectMaxMs = 12_000
const defaultMaxReconnectAttempts = Number.POSITIVE_INFINITY

function jitteredDelay(baseMs: number, maxMs: number, attempt: number) {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
  const jitter = Math.round(exponential * (0.2 + Math.random() * 0.6))
  return Math.min(maxMs, exponential + jitter)
}

function parseSocketData(data: unknown) {
  if (typeof data === 'string') {
    return safeParseNotifyMessage(data)
  }

  if (data instanceof Blob) {
    return null
  }

  return safeParseNotifyMessage(data)
}

export function createNotificationSocket(options: NotificationSocketOptions): NotificationSocketConnection {
  let socket: WebSocket | null = null
  let closedManually = false
  let reconnectAttempt = 0
  let reconnectTimer: number | null = null

  const reconnectBaseMs = options.reconnectBaseMs ?? defaultReconnectBaseMs
  const reconnectMaxMs = options.reconnectMaxMs ?? defaultReconnectMaxMs
  const maxReconnectAttempts = options.maxReconnectAttempts ?? defaultMaxReconnectAttempts

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
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
    reconnectTimer = window.setTimeout(() => {
      connect()
    }, delayMs)
  }

  function connect() {
    if (closedManually || typeof WebSocket === 'undefined') {
      return
    }

    clearReconnectTimer()
    if (socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) {
      return
    }

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }

    const nextSocket = new WebSocket(buildNotifyWebSocketUrl(options.userId))
    socket = nextSocket

    nextSocket.onopen = () => {
      reconnectAttempt = 0
      options.onConnectionChange?.('online')
      options.onOpen?.()
    }

    nextSocket.onmessage = (event) => {
      const message = parseSocketData(event.data)
      if (message) {
        options.onMessage?.(message)
      }
    }

    nextSocket.onerror = (event) => {
      options.onError?.(event)
    }

    nextSocket.onclose = (event) => {
      options.onClose?.(event)
      if (!closedManually) {
        scheduleReconnect()
      }
    }
  }

  function close() {
    closedManually = true
    clearReconnectTimer()

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close()
    }

    socket = null
    options.onConnectionChange?.('offline')
  }

  return {
    connect,
    close,
  }
}
