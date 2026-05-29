export interface Result<T> {
  code: number | string
  message: string
  data: T
  success?: boolean
  traceId?: string
  path?: string
}

export type ApiMode = 'mock' | 'real' | 'fallback'

export interface ServiceStatus {
  name: string
  state: 'online' | 'degraded' | 'offline'
  detail: string
}

export type ApiErrorSource =
  | 'gateway'
  | 'auth'
  | 'workflow'
  | 'runtime'
  | 'file'
  | 'notify'
  | 'ai'
  | 'network'
  | 'unknown'

export interface NormalizedApiError {
  name: 'ApiError'
  message: string
  status?: number
  code?: number | string
  traceId?: string
  path?: string
  source: ApiErrorSource
  retryable: boolean
  raw?: unknown
}

export interface ApiRequestOptions {
  mode?: ApiMode
  source?: ApiErrorSource
  mockFallback?: boolean
  traceId?: string
  retry?: boolean | number
}
