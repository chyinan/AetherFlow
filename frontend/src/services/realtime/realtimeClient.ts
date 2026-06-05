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
import { createNotificationSocket, type NotificationSocketConnection } from './notificationSocket'
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
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level: 'warn',
      message: reason,
    })
  }

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
}

export const realtimeClient = {
  subscribeRun(target: RunSubscriptionTarget, handlers: RunHandlers) {
    const runId = typeof target === 'string' ? target : target.runId
    const runtimeWorkflowId = typeof target === 'string' ? undefined : target.runtimeWorkflowId

    if (!runtimeWorkflowId) {
      return subscribeMockRun(runId, handlers)
    }

    let sse: SseConnection | null = null
    let fallbackStop: (() => void) | null = null
    let fallbackActive = false

    const activateFallback = () => {
      if (fallbackActive || !runtimeEnv.mockFallback) {
        return
      }

      fallbackActive = true
      sse?.close()
      fallbackStop = subscribeMockRun(
        runId,
        handlers,
        'Runtime SSE unavailable; using explicit demo fallback stream.',
      )
    }

    sse = createSseClient({
      url: buildRuntimeSseUrl(runtimeWorkflowId),
      idleTimeoutMs: 35_000,
      maxReconnectAttempts: runtimeEnv.mockFallback ? 2 : undefined,
      onMessage: (message) => {
        if (message.event === 'heartbeat') {
          return
        }

        const event = safeParseRuntimeEvent(message.data)
        if (!event) {
          return
        }

        handlers.onRunPatch?.(runPatchFromRuntimeEvent(event))
        handlers.onLog?.(mapRuntimeEventToLogEntry(event))

        const nodePatch = mapRuntimeEventToNodePatch(event)
        if (nodePatch) {
          handlers.onNodePatch?.(nodePatch)
        }

        if (isTerminalRuntimeEvent(event)) {
          sse?.close()
        }
      },
      onConnectionChange: (state) => {
        if (!fallbackActive) {
          handlers.onConnectionChange?.(state)
        }
      },
      onError: (error) => {
        if (error instanceof SseHttpError && !error.retryable) {
          activateFallback()
        }
      },
      onReconnect: (attempt) => {
        if (attempt >= 2) {
          activateFallback()
        }
      },
    })

    sse.connect()

    return () => {
      sse?.close()
      fallbackStop?.()
      handlers.onConnectionChange?.('offline')
    }
  },
  subscribeNotifications(userId: number | string, handlers: NotificationHandlers) {
    let closed = false
    let sseOnline = false
    let ssePermanentlyUnavailable = false
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
        const streamToken = await issueNotifyStreamToken()
        if (closed) {
          return
        }

        const streamUserId = streamToken.userId ?? userId
        sse = createSseClient({
          url: buildNotifySseUrl(
            streamUserId,
            streamToken.token,
            streamToken.queryParam || 'streamToken',
          ),
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
