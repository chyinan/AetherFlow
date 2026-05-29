import axios from 'axios'
import type { AxiosError, AxiosInstance, AxiosResponse } from 'axios'

import { runtimeEnv } from '@/config/runtimeEnv'
import type { Result } from '@/types/api'

const httpClient: AxiosInstance = axios.create({
  baseURL: runtimeEnv.apiBase,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

httpClient.interceptors.request.use((config) => {
  const token = window.localStorage.getItem('af_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

httpClient.interceptors.response.use(
  (response: AxiosResponse<Result<unknown>>) => {
    const payload = response.data
    if (payload && typeof payload === 'object' && 'code' in payload) {
      if (payload.code === 0 || payload.code === 200) {
        return payload.data as AxiosResponse
      }
      return Promise.reject(new Error(payload.message || 'AetherFlow request failed'))
    }
    return response
  },
  (error: AxiosError) => {
    const status = error.response?.status
    const traceId = error.response?.headers?.['x-trace-id']
    if (status === 401) {
      window.dispatchEvent(new CustomEvent('aetherflow:unauthorized'))
    }
    return Promise.reject(
      new Error(`${error.message}${traceId ? ` (traceId: ${traceId})` : ''}`),
    )
  },
)

export { httpClient }
