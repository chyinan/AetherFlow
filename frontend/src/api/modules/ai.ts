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
  requestTimeout?: string | number | Record<string, unknown> | null
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

export interface ProviderCatalogPricing {
  unit?: string | null
  inputUsdPerMillionTokens?: number | string | null
  outputUsdPerMillionTokens?: number | string | null
  priceHint?: string | null
  source?: string | null
}

export interface ProviderCatalogProvider {
  id?: string
  provider?: AiProviderType
  name?: string
  runtime?: string
  endpointLabel?: string
  endpoint?: string
  defaultModel?: string
  capabilities?: string[]
  metadata?: Record<string, unknown>
}

export interface ProviderCatalogModel {
  id?: string
  providerId?: string
  provider?: AiProviderType
  name?: string
  kind?: string
  contextWindow?: string
  contextWindowTokens?: number | null
  pricing?: ProviderCatalogPricing | null
  capabilities?: string[]
  tags?: string[]
  status?: string
}

export interface ProviderCatalogResponse {
  providers?: ProviderCatalogProvider[] | null
  models?: ProviderCatalogModel[] | null
}

export interface ProviderRuntimeLogEntry {
  id?: string
  level?: string
  time?: string
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

export interface ProviderRuntimeLogResponse {
  logs?: ProviderRuntimeLogEntry[] | null
}

export interface ProviderConfigEntry {
  id?: string
  name?: string
  providerType?: string
  baseUrl?: string
  defaultModel?: string
  configured?: boolean
  enabled?: boolean
  apiKeyConfigured?: boolean
  apiKeyPreview?: string
  tags?: string[]
  description?: string
  region?: string
}

export interface ProviderConfigCatalogResponse {
  providers?: ProviderConfigEntry[] | null
}

export interface ProviderConfigUpdatePayload {
  enabled?: boolean
  apiKey?: string | null
  baseUrl?: string | null
  defaultModel?: string | null
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

export function getProviderCatalog() {
  return apiClient.get<ProviderCatalogResponse>('/ai/provider/catalog', { source: 'ai' })
}

export function getProviderLogs(limit = 50) {
  return apiClient.get<ProviderRuntimeLogResponse>('/ai/provider/logs', {
    params: { limit },
    source: 'ai',
  })
}

export function getProviderConfigCatalog() {
  return apiClient.get<ProviderConfigCatalogResponse>('/ai/provider/config', { source: 'ai' })
}

export function updateProviderConfig(providerId: string, payload: ProviderConfigUpdatePayload) {
  return apiClient.put<ProviderConfigEntry>(
    `/ai/provider/config/${encodeURIComponent(providerId)}`,
    payload,
    { source: 'ai' },
  )
}

export const aiModuleApi = {
  getAiStatus,
  getProviderStatus,
  getProviderPolicy,
  updateProviderPolicy,
  recoverProvider,
  getProviderMetrics,
  getProviderCatalog,
  getProviderLogs,
  getProviderConfigCatalog,
  updateProviderConfig,
}
