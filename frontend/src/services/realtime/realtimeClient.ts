import { runtimeEnv } from '@/config/runtimeEnv'
import {
  mapRuntimeEventToLogEntry,
  mapRuntimeEventToNodePatch,
  mapRuntimeStateToRunStatus,
} from '@/api/mappers/runtimeMapper'
import {
  buildNotifySseUrl,
  issueNotifyStreamToken,
  safeParseNotifyMessage,
  type NotifyMessageDTO,
} from '@/api/modules/notify'
import { buildRuntimeSseUrl, type RuntimeEvent } from '@/api/modules/runtime'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'
import { formatTime } from '@/utils/localeFormat'
import { createNotificationSocket, type NotificationSocketConnection } from './notificationSocket'
import { createRuntimeSocket, type RuntimeSocketConnection } from './runtimeSocket'
import { createSseClient, SseHttpError, type SseConnection } from './sseClient'

type RunHandlers = {
  onLog?: (entry: RunLogEntry) => void
  onNodePatch?: (patch: RunNodeState) => void
  onRunPatch?: (patch: Partial<WorkflowRun>) => void
  onConnectionChange?: (state: 'online' | 'reconnecting' | 'offline') => void
}

type RunSubscriptionTarget = string | {
  runId: string
  runtimeWorkflowId?: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function safeParseRuntimeEvent(value: unknown): RuntimeEvent | null {
  const parsed = typeof value === 'string' ? safeParseJson(value) : value

  if (!isRecord(parsed)) {
    return null
  }

  const eventId = typeof parsed.eventId === 'string' ? parsed.eventId : ''
  const eventType = typeof parsed.eventType === 'string' ? parsed.eventType : ''
  const workflowId = typeof parsed.workflowId === 'string' ? parsed.workflowId : ''
  const traceId = typeof parsed.traceId === 'string' ? parsed.traceId : ''
  const runtimeState = typeof parsed.runtimeState === 'string' ? parsed.runtimeState : ''

  if (!eventType || !workflowId || !runtimeState) {
    return null
  }

  return {
    eventId,
    eventType: eventType as RuntimeEvent['eventType'],
    workflowId,
    traceId,
    taskId: typeof parsed.taskId === 'string' ? parsed.taskId : undefined,
    nodeId: typeof parsed.nodeId === 'string' ? parsed.nodeId : undefined,
    runtimeState: runtimeState as RuntimeEvent['runtimeState'],
    occurredAt: typeof parsed.occurredAt === 'string' ? parsed.occurredAt : undefined,
    attributes: isRecord(parsed.attributes) ? parsed.attributes : undefined,
  }
}

function isTerminalRuntimeEvent(event: RuntimeEvent) {
  return ['WORKFLOW_COMPLETED', 'WORKFLOW_FAILED', 'WORKFLOW_CANCELLED'].includes(event.eventType)
}

function runPatchFromRuntimeEvent(event: RuntimeEvent): Partial<WorkflowRun> {
  const patch: Partial<WorkflowRun> = {
    runtimeWorkflowId: event.workflowId,
    backendStatus: event.runtimeState,
    status: mapRuntimeStateToRunStatus(event.runtimeState),
  }

  if (event.runtimeState === 'SUCCESS') {
    patch.progress = 100
  }
  if (event.nodeId) {
    patch.currentNodeId = event.nodeId
  }
  if (event.traceId) {
    patch.traceId = event.traceId
  }

  return patch
}

function subscribeMockRun(runId: string, handlers: RunHandlers, reason?: string) {
  let index = 0
  const streamIdPrefix = `${runId}-${runtimeEnv.wsBase.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  handlers.onConnectionChange?.('online')

  if (reason) {
    handlers.onLog?.({
      id: `${streamIdPrefix}-fallback-${Date.now()}`,
      time: formatTime(new Date()),
      level: 'warn',
      message: reason,
    })
  }

  const timer = window.setInterval(() => {
    const item = script[index % script.length]
    const time = formatTime(new Date(), undefined, {
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
}

export const realtimeClient = {
  subscribeRun(target: RunSubscriptionTarget, handlers: RunHandlers) {
    const runId = typeof target === 'string' ? target : target.runId
    const runtimeWorkflowId = typeof target === 'string' ? undefined : target.runtimeWorkflowId

    if (!runtimeWorkflowId) {
      if (runtimeEnv.mockFallback) {
        return subscribeMockRun(runId, handlers)
      }
      handlers.onConnectionChange?.('offline')
      handlers.onLog?.({
        id: `${runId}-runtime-id-missing`,
        time: formatTime(new Date()),
        level: 'error',
        message: 'Runtime stream is unavailable because the run has no runtime workflow id.',
      })
      return () => undefined
    }

    let sse: SseConnection | null = null
    let socket: RuntimeSocketConnection | null = null
    let fallbackStop: (() => void) | null = null
    let fallbackActive = false
    let socketActive = false
    let lastCursor: string | undefined
    let socketErrorLogged = false
    let terminalReached = false
    let subscriptionClosed = false

    const applyRuntimeEvent = (value: unknown) => {
      const event = safeParseRuntimeEvent(value)
      if (!event) {
        return
      }
      if (event.eventId) {
        lastCursor = event.eventId
      }
      handlers.onRunPatch?.(runPatchFromRuntimeEvent(event))
      handlers.onLog?.(mapRuntimeEventToLogEntry(event))

      const nodePatch = mapRuntimeEventToNodePatch(event)
      if (nodePatch) {
        handlers.onNodePatch?.(nodePatch)
      }

      if (isTerminalRuntimeEvent(event)) {
        terminalReached = true
        sse?.close()
        socket?.close()
      }
    }

    const activateMockFallback = () => {
      if (subscriptionClosed || terminalReached || fallbackActive || !runtimeEnv.mockFallback) {
        return
      }

      fallbackActive = true
      sse?.close()
      socket?.close()
      fallbackStop = subscribeMockRun(
        runId,
        handlers,
        'Runtime SSE and WebSocket unavailable; using explicit demo fallback stream.',
      )
    }

    const activateWebSocket = () => {
      if (subscriptionClosed || terminalReached || socketActive || fallbackActive || !runtimeEnv.runtimeWebSocketFallback) {
        return false
      }
      socketActive = true
      sse?.close()
      socket = createRuntimeSocket({
        workflowId: runtimeWorkflowId,
        cursor: lastCursor,
        maxReconnectAttempts: 5,
        onMessage: (frame) => {
          if (frame.event !== 'heartbeat') {
            applyRuntimeEvent(frame.data)
          }
        },
        onConnectionChange: (state) => {
          if (!fallbackActive) {
            handlers.onConnectionChange?.(state)
          }
          if (state === 'offline' && !terminalReached && !subscriptionClosed) {
            activateMockFallback()
          }
        },
        onError: (error) => {
          if (socketErrorLogged) {
            return
          }
          socketErrorLogged = true
          handlers.onLog?.({
            id: `${runId}-runtime-websocket-error-${Date.now()}`,
            time: formatTime(new Date()),
            level: 'warn',
            message: error instanceof Error
              ? `Runtime WebSocket unavailable: ${error.message}`
              : 'Runtime WebSocket unavailable.',
          })
        },
      })
      socket.connect()
      return true
    }

    const activatePreferredFallback = () => {
      if (!activateWebSocket()) {
        activateMockFallback()
      }
    }

    sse = createSseClient({
      url: buildRuntimeSseUrl(runtimeWorkflowId),
      idleTimeoutMs: 35_000,
      maxReconnectAttempts: runtimeEnv.mockFallback ? 2 : undefined,
      onMessage: (message) => {
        if (message.event === 'heartbeat') {
          return
        }

        applyRuntimeEvent(message.data)
      },
      onConnectionChange: (state) => {
        if (!fallbackActive) {
          handlers.onConnectionChange?.(state)
        }
      },
      onError: (error) => {
        if (error instanceof SseHttpError && !error.retryable) {
          activatePreferredFallback()
        }
      },
      onReconnect: (attempt) => {
        if (attempt >= 2) {
          activatePreferredFallback()
        }
      },
    })

    sse.connect()

    return () => {
      subscriptionClosed = true
      sse?.close()
      socket?.close()
      fallbackStop?.()
      handlers.onConnectionChange?.('offline')
    }
  },
  subscribeNotifications(userId: number | string, handlers: NotificationHandlers) {
    let closed = false
    let sseOnline = false
    let ssePermanentlyUnavailable = false
    let sseRefreshingToken = false
    let sse: SseConnection | null = null
    let socket: NotificationSocketConnection | null = null

    const startSocket = () => {
      if (closed || socket || !runtimeEnv.notifyWebSocketFallback) {
        return
      }

      socket = createNotificationSocket({
        userId,
        maxReconnectAttempts: 5,
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

    const startSse = async () => {
      try {
        sse = createSseClient({
          url: async () => {
            const streamToken = await issueNotifyStreamToken()
            const streamUserId = streamToken.userId ?? userId
            return buildNotifySseUrl(
              streamUserId,
              streamToken.token,
              streamToken.queryParam || 'streamToken',
            )
          },
          refreshOnUnauthorized: true,
          idleTimeoutMs: 30_000,
          onOpen: () => {
            sseOnline = true
            sseRefreshingToken = false
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
            const shouldRefreshToken = error instanceof SseHttpError
              && (error.status === 401 || error.status === 403)
            sseRefreshingToken = shouldRefreshToken
            ssePermanentlyUnavailable = error instanceof SseHttpError
              && !error.retryable
              && !shouldRefreshToken
            if (!sseOnline && !ssePermanentlyUnavailable && !shouldRefreshToken) {
              startSocket()
            }
          },
          onReconnect: (attempt, delayMs) => {
            handlers.onReconnect?.('sse', attempt, delayMs)
            if (attempt >= 2 && !sseRefreshingToken) {
              startSocket()
            }
          },
        })
        sse.connect()
      } catch (error) {
        handlers.onError?.(error)
        if (!closed) {
          handlers.onConnectionChange?.('offline')
        }
      }
    }

    void startSse()

    const fallbackTimer = window.setTimeout(() => {
      if (!sseOnline && !ssePermanentlyUnavailable) {
        startSocket()
      }
    }, 3000)

    return () => {
      closed = true
      window.clearTimeout(fallbackTimer)
      sse?.close()
      socket?.close()
      socket = null
      handlers.onConnectionChange?.('offline')
    }
  },
}
