import { tokenManager } from '@/api/client/tokenManager'

export interface SseMessage {
  event?: string
  data: unknown
  id?: string
  retry?: number
  raw: string
}

export type RealtimeConnectionState = 'online' | 'reconnecting' | 'offline'

export interface SseClientOptions {
  url: string
  idleTimeoutMs?: number
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  maxReconnectAttempts?: number
  onOpen?: () => void
  onMessage?: (message: SseMessage) => void
  onError?: (error: unknown) => void
  onReconnect?: (attempt: number, delayMs: number) => void
  onConnectionChange?: (state: RealtimeConnectionState) => void
}

export interface SseConnection {
  connect: () => void
  close: () => void
}

interface ParsedFrame {
  event?: string
  data?: string
  id?: string
  retry?: number
}

const defaultIdleTimeoutMs = 30_000
const defaultReconnectBaseMs = 500
const defaultReconnectMaxMs = 10_000
const defaultMaxReconnectAttempts = Number.POSITIVE_INFINITY

export class SseHttpError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(status: number) {
    super(`SSE request failed with HTTP ${status}`)
    this.name = 'SseHttpError'
    this.status = status
    this.retryable = isRetryableHttpStatus(status)
  }
}

function isRetryableHttpStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function parseData(rawData: string) {
  const trimmed = rawData.trim()

  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return rawData
  }
}

function looksLikeRawJsonFrame(rawFrame: string) {
  const trimmed = rawFrame.trim()
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

function isRetryableSseError(error: unknown) {
  return !(error instanceof SseHttpError) || error.retryable
}

function parseFrame(rawFrame: string): ParsedFrame | null {
  const lines = rawFrame.split('\n')
  const frame: ParsedFrame = {}
  const dataLines: string[] = []
  const rawJsonLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    if (!line.includes(':')) {
      rawJsonLines.push(line)
      continue
    }

    const separatorIndex = line.indexOf(':')
    const field = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).replace(/^ /, '')

    if (field === 'event') {
      frame.event = value
    } else if (field === 'data') {
      dataLines.push(value)
    } else if (field === 'id') {
      frame.id = value
    } else if (field === 'retry') {
      const retry = Number(value)
      if (Number.isFinite(retry) && retry > 0) {
        frame.retry = retry
      }
    }
  }

  if (dataLines.length > 0) {
    frame.data = dataLines.join('\n')
  } else if (looksLikeRawJsonFrame(rawFrame)) {
    frame.data = rawFrame.trim()
  } else if (rawJsonLines.length > 0) {
    frame.data = rawJsonLines.join('\n')
  }

  return frame.data || frame.event || frame.id ? frame : null
}

function jitteredDelay(baseMs: number, maxMs: number, attempt: number) {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
  const jitter = Math.round(exponential * (0.25 + Math.random() * 0.5))
  return Math.min(maxMs, exponential + jitter)
}

export function createSseClient(options: SseClientOptions): SseConnection {
  let controller: AbortController | null = null
  let closed = false
  let reconnectAttempt = 0
  let reconnectTimer: number | null = null
  let heartbeatTimer: number | null = null
  let lastActivityAt = Date.now()
  let lastEventId: string | undefined
  let retryOverrideMs: number | null = null

  const idleTimeoutMs = options.idleTimeoutMs ?? defaultIdleTimeoutMs
  const reconnectBaseMs = options.reconnectBaseMs ?? defaultReconnectBaseMs
  const reconnectMaxMs = options.reconnectMaxMs ?? defaultReconnectMaxMs
  const maxReconnectAttempts = options.maxReconnectAttempts ?? defaultMaxReconnectAttempts

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function scheduleReconnect() {
    if (closed || reconnectAttempt >= maxReconnectAttempts) {
      options.onConnectionChange?.('offline')
      return
    }

    reconnectAttempt += 1
    const delayMs = retryOverrideMs ?? jitteredDelay(reconnectBaseMs, reconnectMaxMs, reconnectAttempt)

    options.onConnectionChange?.('reconnecting')
    options.onReconnect?.(reconnectAttempt, delayMs)
    clearReconnectTimer()
    reconnectTimer = window.setTimeout(() => {
      connect()
    }, delayMs)
  }

  function startHeartbeat() {
    clearHeartbeatTimer()
    heartbeatTimer = window.setInterval(() => {
      if (Date.now() - lastActivityAt > idleTimeoutMs) {
        controller?.abort()
      }
    }, Math.max(1000, Math.floor(idleTimeoutMs / 3)))
  }

  function handleFrame(rawFrame: string) {
    lastActivityAt = Date.now()

    const frame = parseFrame(rawFrame)
    if (!frame) {
      return
    }

    if (frame.retry) {
      retryOverrideMs = frame.retry
    }

    if (frame.id) {
      lastEventId = frame.id
    }

    if (!frame.data) {
      return
    }

    options.onMessage?.({
      event: frame.event,
      id: frame.id,
      retry: frame.retry,
      data: parseData(frame.data),
      raw: rawFrame,
    })
  }

  function drainCompleteFrames(currentBuffer: string) {
    let nextBuffer = currentBuffer
    let separatorIndex = nextBuffer.indexOf('\n\n')

    while (separatorIndex >= 0) {
      const rawFrame = nextBuffer.slice(0, separatorIndex)
      nextBuffer = nextBuffer.slice(separatorIndex + 2)
      handleFrame(rawFrame)
      separatorIndex = nextBuffer.indexOf('\n\n')
    }

    let lineSeparatorIndex = nextBuffer.indexOf('\n')
    while (lineSeparatorIndex >= 0) {
      const rawLine = nextBuffer.slice(0, lineSeparatorIndex).trim()
      if (!looksLikeRawJsonFrame(rawLine)) {
        break
      }

      handleFrame(rawLine)
      nextBuffer = nextBuffer.slice(lineSeparatorIndex + 1)
      lineSeparatorIndex = nextBuffer.indexOf('\n')
    }

    return nextBuffer
  }

  async function readStream(response: Response) {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('SSE response body is not readable')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      buffer = drainCompleteFrames(buffer)
    }

    const tail = buffer.trim()
    if (tail) {
      handleFrame(tail)
    }
  }

  async function connect() {
    if (closed) {
      return
    }

    controller?.abort()
    controller = new AbortController()
    lastActivityAt = Date.now()

    try {
      const token = tokenManager.getAccessToken()
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      }

      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId
      }

      const response = await fetch(options.url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new SseHttpError(response.status)
      }

      reconnectAttempt = 0
      options.onConnectionChange?.('online')
      options.onOpen?.()
      startHeartbeat()
      await readStream(response)

      if (!closed) {
        scheduleReconnect()
      }
    } catch (error) {
      if (!closed) {
        options.onError?.(error)
        if (isRetryableSseError(error)) {
          scheduleReconnect()
        } else {
          options.onConnectionChange?.('offline')
        }
      }
    } finally {
      clearHeartbeatTimer()
    }
  }

  function close() {
    closed = true
    clearReconnectTimer()
    clearHeartbeatTimer()
    controller?.abort()
    controller = null
    options.onConnectionChange?.('offline')
  }

  return {
    connect,
    close,
  }
}
