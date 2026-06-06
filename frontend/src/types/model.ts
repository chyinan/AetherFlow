export type ModelProviderStatus = 'online' | 'degraded' | 'offline'
export type ModelKind = 'chat' | 'asr' | 'embedding' | 'media'

export interface ModelProvider {
  id: string
  providerType?: string
  name: string
  runtime: string
  status: ModelProviderStatus
  active?: boolean
  endpoint: string
  defaultModel: string
  latencyMs: number
  quotaUsed: number
  quotaLimit?: number
  capabilities: string[]
  lastCheckedAt: string
  healthStatus?: string
  circuitState?: string
  statusMessage?: string
}

export interface ModelCatalogItem {
  id: string
  providerId: string
  name: string
  kind: ModelKind
  contextWindow: string
  priceHint: string
  status: 'ready' | 'warming' | 'disabled'
  tags: string[]
}

export interface ModelRoutingPolicy {
  id: string
  name: string
  description: string
  primaryModel: string
  fallbackModels: string[]
  timeoutMs: number
  retryCount: number
  providerOrder?: string[]
  failoverEnabled?: boolean
  autoRecoverPrimary?: boolean
}

export interface ModelRuntimeLog {
  id: string
  time: string
  level: 'info' | 'warn' | 'error'
  message: string
}
