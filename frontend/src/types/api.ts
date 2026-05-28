export interface Result<T> {
  code: number
  message: string
  data: T
  traceId?: string
  path?: string
}

export interface ServiceStatus {
  name: string
  state: 'online' | 'degraded' | 'offline'
  detail: string
}
