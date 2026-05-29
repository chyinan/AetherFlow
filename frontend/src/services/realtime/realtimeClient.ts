import { runtimeEnv } from '@/config/runtimeEnv'
import {
  buildNotifySseUrl,
  safeParseNotifyMessage,
  type NotifyMessageDTO,
} from '@/api/modules/notify'
import type { RunLogEntry, RunNodeState } from '@/types/run'
import { createNotificationSocket, type NotificationSocketConnection } from './notificationSocket'
import { createSseClient, SseHttpError, type SseConnection } from './sseClient'

type RunHandlers = {
  onLog?: (entry: RunLogEntry) => void
  onNodePatch?: (patch: RunNodeState) => void
  onConnectionChange?: (state: 'online' | 'reconnecting' | 'offline') => void
}

type NotificationHandlers = {
  onMessage?: (message: NotifyMessageDTO) => void
  onConnectionChange?: (state: 'online' | 'reconnecting' | 'offline') => void
  onError?: (error: unknown) => void
  onReconnect?: (transport: 'sse' | 'websocket', attempt: number, delayMs: number) => void
}

const script = [
  { nodeId: 'node-whisper', label: 'Whisper', status: 'running' as const, message: 'Whisper received segment 5/8.' },
  { nodeId: 'node-whisper', label: 'Whisper', status: 'success' as const, message: 'Transcript completed and emitted transcript.text.' },
  { nodeId: 'node-translate', label: 'Translate', status: 'running' as const, message: 'Translate node started for target en-US.' },
  { nodeId: 'node-translate', label: 'Translate', status: 'success' as const, message: 'Translate node emitted translated.text.' },
  { nodeId: 'node-summary', label: 'Summary', status: 'running' as const, message: 'Summary node composing operator brief.' },
  { nodeId: 'node-summary', label: 'Summary', status: 'success' as const, message: 'Artifacts summary.md and actions.json are ready.' },
]

export const realtimeClient = {
  subscribeRun(runId: string, handlers: RunHandlers) {
    let index = 0
    const streamIdPrefix = `${runId}-${runtimeEnv.wsBase.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    handlers.onConnectionChange?.('online')

    const timer = window.setInterval(() => {
      const item = script[index % script.length]
      const time = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })

      handlers.onNodePatch?.({
        nodeId: item.nodeId,
        label: item.label,
        status: item.status,
        durationMs: 1200 + index * 930,
      })
      handlers.onLog?.({
        id: `${streamIdPrefix}-stream-${Date.now()}-${index}`,
        time,
        level: item.status === 'running' ? 'info' : 'debug',
        nodeId: item.nodeId,
        message: item.message,
      })

      index += 1
      if (index === 3) {
        handlers.onConnectionChange?.('reconnecting')
        window.setTimeout(() => handlers.onConnectionChange?.('online'), 460)
      }
    }, 1800)

    return () => {
      window.clearInterval(timer)
      handlers.onConnectionChange?.('offline')
    }
  },
  subscribeNotifications(userId: number | string, handlers: NotificationHandlers) {
    let closed = false
    let sseOnline = false
    let ssePermanentlyUnavailable = false
    let socket: NotificationSocketConnection | null = null

    const startSocket = () => {
      if (closed || socket) {
        return
      }

      socket = createNotificationSocket({
        userId,
        onMessage: (message) => handlers.onMessage?.(message),
        onConnectionChange: (state) => {
          if (!sseOnline) {
            handlers.onConnectionChange?.(state)
          }
        },
        onError: (error) => handlers.onError?.(error),
        onReconnect: (attempt, delayMs) => handlers.onReconnect?.('websocket', attempt, delayMs),
      })
      socket.connect()
    }

    const sse: SseConnection = createSseClient({
      url: buildNotifySseUrl(userId),
      idleTimeoutMs: 30_000,
      onOpen: () => {
        sseOnline = true
        socket?.close()
        socket = null
      },
      onMessage: (message) => {
        const notifyMessage = safeParseNotifyMessage(message.data)
        if (notifyMessage) {
          handlers.onMessage?.(notifyMessage)
        }
      },
      onConnectionChange: (state) => {
        sseOnline = state === 'online'
        handlers.onConnectionChange?.(state)
      },
      onError: (error) => {
        handlers.onError?.(error)
        ssePermanentlyUnavailable = error instanceof SseHttpError && !error.retryable
        if (!sseOnline && !ssePermanentlyUnavailable) {
          startSocket()
        }
      },
      onReconnect: (attempt, delayMs) => {
        handlers.onReconnect?.('sse', attempt, delayMs)
        if (attempt >= 2) {
          startSocket()
        }
      },
    })

    sse.connect()

    const fallbackTimer = window.setTimeout(() => {
      if (!sseOnline && !ssePermanentlyUnavailable) {
        startSocket()
      }
    }, 3000)

    return () => {
      closed = true
      window.clearTimeout(fallbackTimer)
      sse.close()
      socket?.close()
      socket = null
      handlers.onConnectionChange?.('offline')
    }
  },
}
