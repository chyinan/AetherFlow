import { apiClient } from '@/api/client/apiClient'
import { runtimeEnv } from '@/config/runtimeEnv'

export interface NotifyMessageDTO {
  userId?: number | string
  channel?: string
  eventType?: string
  payload: Record<string, unknown>
  occurredAt?: string
}

export interface NotifyStreamTokenResponse {
  token: string
  tokenType?: string
  userId?: number | string
  expiresAt?: string
  expiresInSeconds?: number
  transports?: string[]
  queryParam?: string
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}

function resolveUrl(base: string, path: string) {
  const normalizedPath = `/${trimSlashes(path)}`

  if (/^https?:\/\//i.test(base)) {
    return `${base.replace(/\/+$/, '')}${normalizedPath}`
  }

  if (typeof window === 'undefined') {
    return `${base.replace(/\/+$/, '')}${normalizedPath}`
  }

  return `${base.replace(/\/+$/, '')}${normalizedPath}`
}

function toWebSocketUrl(url: string) {
  if (/^wss?:\/\//i.test(url)) {
    return url
  }

  if (/^https?:\/\//i.test(url)) {
    return url.replace(/^http/i, 'ws')
  }

  if (typeof window === 'undefined') {
    return url
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${url.startsWith('/') ? url : `/${url}`}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildNotifySseUrl(userId: number | string) {
  return resolveUrl(runtimeEnv.sseBase, `/notify/sse/${encodeURIComponent(String(userId))}`)
}

export function issueNotifyStreamToken() {
  return apiClient.post<NotifyStreamTokenResponse>('/notify/stream-token', undefined, {
    source: 'notify',
  })
}

export function buildNotifyWebSocketUrl(streamToken: string, queryParam = 'streamToken') {
  const baseUrl = resolveUrl(runtimeEnv.wsBase, '/notify/ws')
  const separator = baseUrl.includes('?') ? '&' : '?'
  return toWebSocketUrl(`${baseUrl}${separator}${encodeURIComponent(queryParam)}=${encodeURIComponent(streamToken)}`)
}

export function safeParseNotifyMessage(value: unknown): NotifyMessageDTO | null {
  const parsed = typeof value === 'string'
    ? safeJsonParse(value)
    : value

  if (!isRecord(parsed)) {
    return null
  }

  const payload = isRecord(parsed.payload) ? parsed.payload : {}
  const occurredAt = typeof parsed.occurredAt === 'string' ? parsed.occurredAt : undefined

  return {
    userId:
      typeof parsed.userId === 'string' || typeof parsed.userId === 'number'
        ? parsed.userId
        : undefined,
    channel: typeof parsed.channel === 'string' ? parsed.channel : undefined,
    eventType: typeof parsed.eventType === 'string' ? parsed.eventType : undefined,
    payload,
    occurredAt,
  }
}

export function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}
