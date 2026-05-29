import axios from 'axios'
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

import { runtimeEnv } from '@/config/runtimeEnv'
import type { ApiErrorSource } from '@/types/api'

import { isFailedResult, isSuccessfulResult, toApiError } from './apiError'
import { tokenManager } from './tokenManager'

const TRACE_HEADER = 'X-Trace-Id'
const RETRYABLE_METHODS = new Set(['get', 'head', 'options'])
const MAX_RETRIES = 2
const RETRY_META_KEY = '__aetherflowRetryCount'
const AUTH_RETRY_META_KEY = '__aetherflowAuthRetry'

type RetriableConfig = InternalAxiosRequestConfig & {
  [RETRY_META_KEY]?: number
  [AUTH_RETRY_META_KEY]?: boolean
  source?: ApiErrorSource
}

interface ApiAxiosOptions {
  unwrapResult: boolean
}

export interface ApiClientRequestConfig extends AxiosRequestConfig {
  source?: ApiErrorSource
}

type UnauthorizedSessionRefresher = () => Promise<boolean>

let unauthorizedSessionRefresher: UnauthorizedSessionRefresher | null = null

function hasHeader(config: InternalAxiosRequestConfig, name: string) {
  return config.headers.has(name) || config.headers.has(name.toLowerCase())
}

function createTraceId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `af-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isBrowserEventTargetAvailable() {
  return typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
}

function dispatchUnauthorized() {
  if (!isBrowserEventTargetAvailable()) {
    return
  }

  window.dispatchEvent(new CustomEvent('aetherflow:unauthorized'))
}

function isAuthRefreshRequest(config: RetriableConfig | undefined) {
  if (!config?.url) {
    return false
  }

  const url = config.url.toLowerCase()
  return url.includes('/auth/refresh') || url.includes('/auth/login')
}

async function refreshUnauthorizedSession(config: RetriableConfig | undefined) {
  if (!config || config[AUTH_RETRY_META_KEY] || isAuthRefreshRequest(config) || !unauthorizedSessionRefresher) {
    return false
  }

  config[AUTH_RETRY_META_KEY] = true

  try {
    return await unauthorizedSessionRefresher()
  } catch {
    return false
  }
}

function shouldRetry(error: AxiosError) {
  const config = error.config as RetriableConfig | undefined
  if (!config) {
    return false
  }

  const method = (config.method ?? 'get').toLowerCase()
  if (!RETRYABLE_METHODS.has(method)) {
    return false
  }

  const retryCount = config[RETRY_META_KEY] ?? 0
  if (retryCount >= MAX_RETRIES) {
    return false
  }

  return toApiError(error, config.source ?? 'gateway').retryable
}

function backoffMs(retryCount: number) {
  return 150 * 2 ** retryCount
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

function createApiAxiosInstance(options: ApiAxiosOptions) {
  const instance = axios.create({
    baseURL: runtimeEnv.apiBase,
    timeout: runtimeEnv.requestTimeoutMs,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  instance.interceptors.request.use((config) => {
    const token = tokenManager.getAccessToken()

    if (token && !hasHeader(config, 'Authorization')) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }

    if (!hasHeader(config, TRACE_HEADER)) {
      config.headers.set(TRACE_HEADER, createTraceId())
    }

    return config
  })

  instance.interceptors.response.use(
    (response: AxiosResponse<unknown>) => {
      const payload = response.data

      if (!options.unwrapResult) {
        return payload as AxiosResponse
      }

      if (isSuccessfulResult(payload)) {
        return payload.data as AxiosResponse
      }

      if (isFailedResult(payload)) {
        return Promise.reject(toApiError(payload, 'gateway'))
      }

      return payload as AxiosResponse
    },
    async (error: AxiosError) => {
      const config = error.config as RetriableConfig | undefined

      if (error.response?.status === 401) {
        const refreshed = await refreshUnauthorizedSession(config)
        const token = tokenManager.getAccessToken()

        if (refreshed && config && token) {
          config.headers.set('Authorization', `Bearer ${token}`)
          return instance.request(config)
        }

        dispatchUnauthorized()
      }

      if (shouldRetry(error) && config) {
        const retryCount = config[RETRY_META_KEY] ?? 0
        config[RETRY_META_KEY] = retryCount + 1
        await delay(backoffMs(retryCount))
        return instance.request(config)
      }

      return Promise.reject(toApiError(error, config?.source ?? 'gateway'))
    },
  )

  return instance
}

export const axiosInstance: AxiosInstance = createApiAxiosInstance({ unwrapResult: true })
export const rawAxiosInstance: AxiosInstance = createApiAxiosInstance({ unwrapResult: false })

export function setUnauthorizedSessionRefresher(refresher: UnauthorizedSessionRefresher | null) {
  unauthorizedSessionRefresher = refresher
}

export const apiClient = {
  instance: axiosInstance,
  request<T = unknown>(config: ApiClientRequestConfig): Promise<T> {
    return axiosInstance.request<unknown, T>(config)
  },
  get<T = unknown>(url: string, config?: ApiClientRequestConfig): Promise<T> {
    return axiosInstance.get<unknown, T>(url, config)
  },
  post<T = unknown>(url: string, data?: unknown, config?: ApiClientRequestConfig): Promise<T> {
    return axiosInstance.post<unknown, T>(url, data, config)
  },
  put<T = unknown>(url: string, data?: unknown, config?: ApiClientRequestConfig): Promise<T> {
    return axiosInstance.put<unknown, T>(url, data, config)
  },
  patch<T = unknown>(url: string, data?: unknown, config?: ApiClientRequestConfig): Promise<T> {
    return axiosInstance.patch<unknown, T>(url, data, config)
  },
  delete<T = unknown>(url: string, config?: ApiClientRequestConfig): Promise<T> {
    return axiosInstance.delete<unknown, T>(url, config)
  },
}

export function orvalMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  return rawAxiosInstance.request<unknown, T>({
    ...config,
    ...options,
    headers: {
      ...config.headers,
      ...options?.headers,
    },
  })
}

export default orvalMutator
