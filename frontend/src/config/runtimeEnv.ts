// pattern: Imperative Shell
type EnvValue = string | boolean | number | undefined

// 契约脚本用 node --experimental-strip-types 直接引入本模块，此时没有 import.meta.env；
// 统一走这个读取口，缺失时仍然回落到默认值。
function readEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
  const value = env?.[name]
  return typeof value === 'string' ? value : undefined
}

function normalizeBase(value: EnvValue, fallback: string) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  const normalizedFallback = fallback.trim() || '/'
  const base = trimmed || normalizedFallback

  if (base === '/') {
    return base
  }

  return base.replace(/\/+$/, '')
}

function normalizeBoolean(value: EnvValue, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }

  return fallback
}

function normalizeNumber(value: EnvValue, fallback: number) {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback
}

/** 默认服务器偏移：后端历史时间是 LocalDateTime，按 +08:00 补齐成绝对时刻。 */
export const defaultServerTimezoneOffset = '+08:00'

/**
 * 归一化服务器时区偏移（`+08:00` / `+0800` 均可），非法或缺省时回落到 +08:00。
 * 只接受显式偏移，不接受 IANA 名称，避免依赖运行环境的时区数据库。
 */
export function normalizeServerTimezoneOffset(value?: string | null) {
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '')
  if (!match) {
    return defaultServerTimezoneOffset
  }

  const hours = Number(match[2])
  const minutes = Number(match[3])
  if (hours > 14 || minutes > 59) {
    return defaultServerTimezoneOffset
  }

  return `${match[1]}${match[2]}:${match[3]}`
}

export const runtimeEnv = {
  apiBase: normalizeBase(readEnv('VITE_API_BASE'), '/api'),
  wsBase: normalizeBase(readEnv('VITE_WS_BASE'), '/ws'),
  sseBase: normalizeBase(readEnv('VITE_SSE_BASE'), '/sse'),
  openApiBase: normalizeBase(readEnv('VITE_OPENAPI_BASE'), '/api'),
  mockFallback: normalizeBoolean(readEnv('VITE_MOCK_FALLBACK'), false),
  notifyWebSocketFallback: normalizeBoolean(readEnv('VITE_NOTIFY_WS_FALLBACK'), false),
  runtimeWebSocketFallback: normalizeBoolean(readEnv('VITE_RUNTIME_WS_FALLBACK'), false),
  requestTimeoutMs: normalizeNumber(readEnv('VITE_API_TIMEOUT_MS'), 15000),
  // 服务器时区偏移：历史通知的 LocalDateTime 用它补齐成绝对时刻。
  serverTimezoneOffset: normalizeServerTimezoneOffset(readEnv('VITE_SERVER_TIMEZONE_OFFSET')),
} as const
