import axios from 'axios'
import type { AxiosError, AxiosResponse } from 'axios'

import type { ApiErrorSource, NormalizedApiError, Result } from '@/types/api'

interface ErrorLike {
  message?: unknown
  name?: unknown
  code?: unknown
  status?: unknown
  response?: unknown
  config?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isResultFailure(value: unknown): value is Result<unknown> {
  return isRecord(value) && 'code' in value && ('message' in value || 'success' in value)
}

function isSuccessCode(code: unknown) {
  if (code === 0 || code === 200) {
    return true
  }

  if (typeof code === 'string') {
    const normalized = code.trim().toLowerCase()
    return ['0', '200', 'success', 'ok'].includes(normalized)
  }

  return false
}

function readHeader(headers: unknown, name: string) {
  if (!headers) {
    return undefined
  }

  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get: (key: string) => unknown }).get(name)
    return typeof value === 'string' ? value : undefined
  }

  if (!isRecord(headers)) {
    return undefined
  }

  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && typeof value === 'string') {
      return value
    }
  }

  return undefined
}

function inferSource(path: string | undefined, fallbackSource: ApiErrorSource): ApiErrorSource {
  if (!path) {
    return fallbackSource
  }

  if (path.includes('/auth')) return 'auth'
  if (path.includes('/workflow/runtime')) return 'runtime'
  if (path.includes('/workflows') || path.includes('/workflow')) return 'workflow'
  if (path.includes('/files')) return 'file'
  if (path.includes('/notify')) return 'notify'
  if (path.includes('/ai')) return 'ai'

  return fallbackSource
}

function retryableByHttpStatus(status: number | undefined) {
  return status === 0 || status === 408 || status === 429 || (typeof status === 'number' && status >= 500)
}

function retryableByTransportStatus(status: number | undefined) {
  return status === undefined || retryableByHttpStatus(status)
}

function retryableResultFailure(result: Result<unknown>, status: number | undefined) {
  if (retryableByHttpStatus(status)) {
    return true
  }

  const code = typeof result.code === 'string' ? Number(result.code) : result.code
  return inferSource(result.path, 'unknown') === 'gateway' && retryableByHttpStatus(code)
}

function toMessage(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function apiErrorFromResult(
  result: Result<unknown>,
  fallbackSource: ApiErrorSource,
  status?: number,
): NormalizedApiError {
  const path = result.path

  return {
    name: 'ApiError',
    message: toMessage(result.message, 'AetherFlow request failed'),
    status,
    code: result.code,
    traceId: result.traceId,
    path,
    source: inferSource(path, fallbackSource),
    retryable: retryableResultFailure(result, status),
    raw: result,
  }
}

function apiErrorFromAxios(
  error: AxiosError<unknown>,
  fallbackSource: ApiErrorSource,
): NormalizedApiError {
  const response = error.response as AxiosResponse<unknown> | undefined
  const status = response?.status
  const responseData = response?.data

  if (isResultFailure(responseData) && !isSuccessCode(responseData.code)) {
    const resultError = apiErrorFromResult(responseData, fallbackSource, status)
    return {
      ...resultError,
      traceId: resultError.traceId ?? readHeader(response?.headers, 'x-trace-id'),
      path:
        resultError.path ??
        (typeof response?.config?.url === 'string' ? response.config.url : undefined),
      retryable: retryableResultFailure(responseData, status),
      raw: error,
    }
  }

  const configUrl = typeof error.config?.url === 'string' ? error.config.url : undefined
  const path = isRecord(responseData) && typeof responseData.path === 'string'
    ? responseData.path
    : configUrl
  const code = isRecord(responseData) ? responseData.code : error.code
  const message = isRecord(responseData)
    ? toMessage(responseData.message, error.message)
    : error.message

  return {
    name: 'ApiError',
    message: toMessage(message, status ? `HTTP ${status} request failed` : 'Network request failed'),
    status,
    code: typeof code === 'string' || typeof code === 'number' ? code : undefined,
    traceId:
      (isRecord(responseData) && typeof responseData.traceId === 'string'
        ? responseData.traceId
        : undefined) ?? readHeader(response?.headers, 'x-trace-id'),
    path,
    source: status ? inferSource(path, fallbackSource) : 'network',
    retryable: retryableByTransportStatus(status),
    raw: error,
  }
}

export function isApiError(error: unknown): error is NormalizedApiError {
  return isRecord(error) && error.name === 'ApiError'
}

export function toApiError(
  error: unknown,
  fallbackSource: ApiErrorSource = 'unknown',
): NormalizedApiError {
  if (isApiError(error)) {
    return error
  }

  if (axios.isAxiosError(error)) {
    return apiErrorFromAxios(error, fallbackSource)
  }

  if (isResultFailure(error) && !isSuccessCode(error.code)) {
    return apiErrorFromResult(error, fallbackSource)
  }

  const errorLike = error as ErrorLike
  const status = typeof errorLike?.status === 'number' ? errorLike.status : undefined
  const message = toMessage(errorLike?.message, 'Unknown API error')

  return {
    name: 'ApiError',
    message,
    status,
    code:
      typeof errorLike?.code === 'string' || typeof errorLike?.code === 'number'
        ? errorLike.code
        : undefined,
    source: status ? fallbackSource : 'unknown',
    retryable: retryableByHttpStatus(status),
    raw: error,
  }
}

export function isSuccessfulResult(value: unknown): value is Result<unknown> {
  return isResultFailure(value) && (value.success === true || isSuccessCode(value.code))
}

export function isFailedResult(value: unknown): value is Result<unknown> {
  return isResultFailure(value) && value.success !== true && !isSuccessCode(value.code)
}
