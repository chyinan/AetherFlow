import {
  buildNotifyWebSocketUrl,
  issueNotifyStreamToken,
  safeParseNotifyMessage,
  type NotifyMessageDTO,
} from '@/api/modules/notify'
import type { RealtimeConnectionState } from '@/services/realtime/sseClient'

export interface NotificationSocketOptions {
  userId: number | string
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  maxReconnectAttempts?: number
  onOpen?: () => void
  onMessage?: (message: NotifyMessageDTO) => void
  onError?: (error: unknown) => void
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
const defaultMaxReconnectAttempts = 5

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
  let connecting = false
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

  async function openSocket() {
    connecting = true
    try {
      const streamToken = await issueNotifyStreamToken()
      if (closedManually) {
        return
      }

      const nextSocket = new WebSocket(buildNotifyWebSocketUrl(
        streamToken.token,
        streamToken.queryParam || 'streamToken',
      ))
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
    } catch (error) {
      options.onError?.(error)
      if (!closedManually) {
        scheduleReconnect()
      }
    } finally {
      connecting = false
    }
  }

  function connect() {
    if (closedManually || typeof WebSocket === 'undefined') {
      return
    }

    clearReconnectTimer()
    if (connecting || socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) {
      return
    }

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }

    void openSocket()
  }

  function close() {
    closedManually = true
    connecting = false
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
