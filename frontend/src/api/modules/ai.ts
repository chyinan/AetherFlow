import { apiClient } from '@/api/client/apiClient'

export type AiProviderType = 'OPENAI' | 'OLLAMA' | 'LOCAL_MODEL' | string
export type ProviderCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN' | string
export type ProviderHealthStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN' | string

export interface AiServiceStatusResponse {
  service?: string
  status?: string
  time?: string
  defaultProvider?: AiProviderType
  defaultModel?: string
  capabilities?: string[]
  providers?: AiProviderType[]
  mqConsumer?: string
  [key: string]: unknown
}

export interface ProviderRoutingPolicy {
  enableFailover?: boolean
  autoRecoverPrimary?: boolean
  providers?: AiProviderType[]
  maxRetries?: number
  retryInitialBackoff?: string | number | Record<string, unknown> | null
  retryMaxBackoff?: string | number | Record<string, unknown> | null
  circuitFailureThreshold?: number
  circuitOpenDuration?: string | number | Record<string, unknown> | null
  healthCheckInterval?: string | number | Record<string, unknown> | null
}

export interface ProviderMetricsSnapshot {
  provider?: AiProviderType
  calls?: number
  successes?: number
  failures?: number
  retries?: number
  failovers?: number
  circuitOpens?: number
  lastLatencyMillis?: number
  averageLatencyMillis?: number
  maxLatencyMillis?: number
  updatedAt?: string
}

export interface AiProviderHealth {
  provider?: AiProviderType
  status?: ProviderHealthStatus
  healthy?: boolean
  checkedAt?: string
  latencyMillis?: number
  message?: string
  metadata?: Record<string, unknown>
}

export interface ProviderCircuitSnapshot {
  provider?: AiProviderType
  state?: ProviderCircuitState
  consecutiveFailures?: number
  openUntil?: string | null
  updatedAt?: string
  reason?: string | null
}

export interface AIInferenceLog {
  eventId?: string
  eventType?: string
  provider?: AiProviderType
  fromProvider?: AiProviderType
  toProvider?: AiProviderType
  model?: string
  message?: string
  latencyMillis?: number
  attempt?: number
  errorMessage?: string
  occurredAt?: string
  metadata?: Record<string, unknown>
}

export interface ProviderStatusResponse {
  activeProvider?: AiProviderType
  routingPolicy?: ProviderRoutingPolicy | null
  circuitStates?: Record<string, ProviderCircuitSnapshot> | null
  healthStates?: Record<string, AiProviderHealth> | null
  metrics?: Record<string, ProviderMetricsSnapshot> | null
  recentLogs?: AIInferenceLog[] | null
}

export interface ProviderMetricsResponse {
  metrics?: Record<string, ProviderMetricsSnapshot> | null
  recentLogs?: AIInferenceLog[] | null
}

export function getAiStatus() {
  return apiClient.get<AiServiceStatusResponse>('/ai/status', { source: 'ai' })
}

export function getProviderStatus() {
  return apiClient.get<ProviderStatusResponse>('/ai/provider/status', { source: 'ai' })
}

export function getProviderPolicy() {
  return apiClient.get<ProviderRoutingPolicy>('/ai/provider/policy', { source: 'ai' })
}

export function updateProviderPolicy(policy: ProviderRoutingPolicy) {
  return apiClient.put<ProviderRoutingPolicy>('/ai/provider/policy', policy, { source: 'ai' })
}

export function recoverProvider(provider: AiProviderType) {
  return apiClient.post<ProviderStatusResponse>(
    `/ai/provider/policy/recover/${encodeURIComponent(String(provider))}`,
    undefined,
    { source: 'ai' },
  )
}

export function getProviderMetrics() {
  return apiClient.get<ProviderMetricsResponse>('/ai/provider/metrics', { source: 'ai' })
}

export const aiModuleApi = {
  getAiStatus,
  getProviderStatus,
  getProviderPolicy,
  updateProviderPolicy,
  recoverProvider,
  getProviderMetrics,
}
