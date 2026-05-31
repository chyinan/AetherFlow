type EnvValue = string | boolean | number | undefined

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

export const runtimeEnv = {
  apiBase: normalizeBase(import.meta.env.VITE_API_BASE, '/api'),
  wsBase: normalizeBase(import.meta.env.VITE_WS_BASE, '/ws'),
  sseBase: normalizeBase(import.meta.env.VITE_SSE_BASE, '/sse'),
  openApiBase: normalizeBase(import.meta.env.VITE_OPENAPI_BASE, '/api'),
  mockFallback: normalizeBoolean(import.meta.env.VITE_MOCK_FALLBACK, false),
  notifyWebSocketFallback: normalizeBoolean(import.meta.env.VITE_NOTIFY_WS_FALLBACK, false),
  requestTimeoutMs: normalizeNumber(import.meta.env.VITE_API_TIMEOUT_MS, 15000),
} as const
