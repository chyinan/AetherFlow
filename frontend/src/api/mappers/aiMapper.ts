import type {
  AIInferenceLog,
  AiProviderHealth,
  AiProviderType,
  AiServiceStatusResponse,
  ProviderCircuitSnapshot,
  ProviderMetricsResponse,
  ProviderRoutingPolicy,
  ProviderStatusResponse,
} from '@/api/modules/ai'
import type { ModelCatalogItem, ModelProvider, ModelProviderStatus, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

export interface AiModelMappingInput {
  serviceStatus?: AiServiceStatusResponse | null
  providerStatus?: ProviderStatusResponse | null
  metricsResponse?: ProviderMetricsResponse | null
  policy?: ProviderRoutingPolicy | null
}

export interface AiModelSnapshot {
  providers: ModelProvider[]
  models: ModelCatalogItem[]
  policies: ModelRoutingPolicy[]
  logs: ModelRuntimeLog[]
}

const providerMetadata: Record<string, { name: string; runtime: string; fallbackModel: string; capabilities: string[] }> = {
  OPENAI: {
    name: 'OpenAI Gateway',
    runtime: 'cloud llm',
    fallbackModel: 'gpt-4o-mini',
    capabilities: ['chat', 'summary', 'translate', 'subtitle', 'governed failover'],
  },
  OLLAMA: {
    name: 'Ollama Local',
    runtime: 'local llm',
    fallbackModel: 'llama3',
    capabilities: ['chat', 'summary', 'local fallback', 'offline capable'],
  },
  LOCAL_MODEL: {
    name: 'Local Model Runtime',
    runtime: 'local runtime',
    fallbackModel: 'runtime default',
    capabilities: ['chat', 'private runtime', 'contract pending'],
  },
}

function normalizeProvider(provider: AiProviderType | null | undefined) {
  const normalized = String(provider ?? '').trim().toUpperCase()
  return normalized || 'UNKNOWN'
}

function providerId(provider: string) {
  return `provider-${provider.toLowerCase().replace(/_/g, '-')}`
}

function modelId(provider: string, model: string) {
  return `model-${provider.toLowerCase().replace(/_/g, '-')}-${model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function numberOrZero(value: unknown) {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function positiveLatency(...values: unknown[]) {
  for (const value of values) {
    const numericValue = numberOrZero(value)
    if (numericValue > 0) {
      return Math.round(numericValue)
    }
  }

  return 0
}

function formatDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date().toLocaleString('zh-CN', { hour12: false })
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function formatTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function readMapValue<T extends { provider?: AiProviderType }>(
  map: Record<string, T> | null | undefined,
  provider: string,
) {
  if (!map) {
    return undefined
  }

  return map[provider] ?? Object.values(map).find((entry) => normalizeProvider(entry?.provider) === provider)
}

function collectProviders(input: AiModelMappingInput) {
  const providers = new Set<string>()
  const policyProviders = input.policy?.providers ?? input.providerStatus?.routingPolicy?.providers
  const serviceProviders = input.serviceStatus?.providers
  const metricKeys = Object.keys(input.metricsResponse?.metrics ?? input.providerStatus?.metrics ?? {})
  const healthKeys = Object.keys(input.providerStatus?.healthStates ?? {})
  const circuitKeys = Object.keys(input.providerStatus?.circuitStates ?? {})

  for (const provider of [
    input.providerStatus?.activeProvider,
    input.serviceStatus?.defaultProvider,
    ...(policyProviders ?? []),
    ...(serviceProviders ?? []),
    ...metricKeys,
    ...healthKeys,
    ...circuitKeys,
  ]) {
    const normalized = normalizeProvider(provider)
    if (normalized !== 'UNKNOWN') {
      providers.add(normalized)
    }
  }

  if (providers.size === 0) {
    providers.add('OPENAI')
    providers.add('OLLAMA')
  }

  return Array.from(providers)
}

function mapProviderStatus(health?: AiProviderHealth, circuit?: ProviderCircuitSnapshot): ModelProviderStatus {
  const healthStatus = String(health?.status ?? '').toUpperCase()
  const circuitState = String(circuit?.state ?? '').toUpperCase()

  if (circuitState === 'OPEN' || healthStatus === 'DOWN') {
    return 'offline'
  }

  if (circuitState === 'HALF_OPEN' || healthStatus === 'DEGRADED') {
    return 'degraded'
  }

  if (health?.healthy === false || healthStatus === 'UNKNOWN') {
    return 'offline'
  }

  if (health?.healthy === true || circuitState === 'CLOSED' || healthStatus === 'UP') {
    return 'online'
  }

  return 'degraded'
}

function defaultModelForProvider(
  provider: string,
  input: AiModelMappingInput,
  logs: AIInferenceLog[],
) {
  const serviceDefaultProvider = normalizeProvider(input.serviceStatus?.defaultProvider)
  const activeProvider = normalizeProvider(input.providerStatus?.activeProvider)
  const serviceDefaultModel = input.serviceStatus?.defaultModel?.trim()

  if ((provider === serviceDefaultProvider || provider === activeProvider) && serviceDefaultModel) {
    return serviceDefaultModel
  }

  const logModel = logs.find((log) => normalizeProvider(log.provider) === provider && log.model?.trim())?.model?.trim()
  if (logModel) {
    return logModel
  }

  return providerMetadata[provider]?.fallbackModel ?? 'runtime default'
}

function capabilitySet(provider: string, serviceStatus?: AiServiceStatusResponse | null) {
  const values = new Set(providerMetadata[provider]?.capabilities ?? ['contract pending'])

  for (const capability of serviceStatus?.capabilities ?? []) {
    const normalized = capability.trim().toLowerCase()
    if (normalized) {
      values.add(normalized)
    }
  }

  return Array.from(values)
}

function mapProvider(
  provider: string,
  input: AiModelMappingInput,
  logs: AIInferenceLog[],
): ModelProvider {
  const metrics = readMapValue(input.metricsResponse?.metrics ?? input.providerStatus?.metrics, provider)
  const health = readMapValue(input.providerStatus?.healthStates, provider)
  const circuit = readMapValue(input.providerStatus?.circuitStates, provider)
  const calls = Math.max(0, numberOrZero(metrics?.calls))
  const successes = Math.max(0, numberOrZero(metrics?.successes))
  const failures = Math.max(0, numberOrZero(metrics?.failures))
  const retries = Math.max(0, numberOrZero(metrics?.retries))
  const quotaLikeTotal = Math.max(calls, successes + failures, calls + retries, 1)
  const metadata = providerMetadata[provider]

  return {
    id: providerId(provider),
    name: metadata?.name ?? provider.replace(/_/g, ' '),
    runtime: metadata?.runtime ?? 'ai provider',
    status: mapProviderStatus(health, circuit),
    endpoint: 'contract pending',
    defaultModel: defaultModelForProvider(provider, input, logs),
    latencyMs: positiveLatency(health?.latencyMillis, metrics?.lastLatencyMillis, metrics?.averageLatencyMillis),
    quotaUsed: calls,
    quotaLimit: quotaLikeTotal,
    capabilities: capabilitySet(provider, input.serviceStatus),
    lastCheckedAt: formatDateTime(health?.checkedAt ?? metrics?.updatedAt ?? circuit?.updatedAt ?? input.serviceStatus?.time),
  }
}

function mapCatalogItem(provider: ModelProvider): ModelCatalogItem {
  return {
    id: modelId(provider.id, provider.defaultModel),
    providerId: provider.id,
    name: provider.defaultModel,
    kind: 'chat',
    contextWindow: 'runtime default',
    priceHint: 'contract pending',
    status: provider.status === 'online' ? 'ready' : provider.status === 'degraded' ? 'warming' : 'disabled',
    tags: ['governed provider', provider.runtime, 'catalog pending'],
  }
}

function mapPolicy(input: AiModelMappingInput, providers: ModelProvider[]): ModelRoutingPolicy {
  const policy = input.policy ?? input.providerStatus?.routingPolicy
  const orderedProviders = (policy?.providers ?? providers.map((provider) => provider.id.replace(/^provider-/, '').replace(/-/g, '_')))
    .map((provider) => normalizeProvider(provider))
    .filter((provider) => provider !== 'UNKNOWN')
  const orderedModels = orderedProviders
    .map((provider) => providers.find((entry) => entry.id === providerId(provider))?.defaultModel)
    .filter((model): model is string => Boolean(model))

  return {
    id: 'policy-ai-provider-routing',
    name: 'AI provider routing',
    description: [
      policy?.enableFailover === false ? 'Failover disabled' : 'Failover enabled',
      policy?.autoRecoverPrimary === false ? 'manual recovery' : 'auto recovery',
      'request timeout contract pending',
    ].join(', '),
    primaryModel: orderedModels[0] ?? providers[0]?.defaultModel ?? 'runtime default',
    fallbackModels: orderedModels.slice(1),
    timeoutMs: 0,
    retryCount: Math.max(0, Math.round(numberOrZero(policy?.maxRetries))),
  }
}

function mapLogLevel(log: AIInferenceLog): ModelRuntimeLog['level'] {
  const eventType = String(log.eventType ?? '').toUpperCase()
  if (eventType.includes('ERROR') || eventType.includes('FAIL') || eventType.includes('DOWN') || eventType === 'CIRCUIT_OPEN') {
    return 'error'
  }

  if (eventType.includes('RETRY') || eventType.includes('FAILOVER') || eventType.includes('SKIP') || eventType.includes('DEGRADED')) {
    return 'warn'
  }

  return log.errorMessage ? 'error' : 'info'
}

export function mapAiInferenceLogToModelRuntimeLog(log: AIInferenceLog, index = 0): ModelRuntimeLog {
  const provider = normalizeProvider(log.provider)
  const eventType = log.eventType?.trim() || 'AI_PROVIDER_EVENT'
  const message = log.errorMessage?.trim() || log.message?.trim() || eventType
  const model = log.model?.trim()
  const latency = numberOrZero(log.latencyMillis)
  const latencyText = latency > 0 ? ` (${Math.round(latency)}ms)` : ''
  const modelText = model ? ` / ${model}` : ''

  return {
    id: log.eventId?.trim() || `model-log-${provider}-${index}-${log.occurredAt ?? Date.now()}`,
    time: formatTime(log.occurredAt),
    level: mapLogLevel(log),
    message: `[${eventType}] ${provider}${modelText}: ${message}${latencyText}`,
  }
}

function collectLogs(input: AiModelMappingInput) {
  const logs = [...(input.providerStatus?.recentLogs ?? []), ...(input.metricsResponse?.recentLogs ?? [])]
  const seen = new Set<string>()

  return logs.filter((log, index) => {
    const key = log.eventId?.trim() || `${log.eventType ?? 'event'}-${log.provider ?? 'provider'}-${log.occurredAt ?? index}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function mapAiProviderData(input: AiModelMappingInput): AiModelSnapshot {
  const logs = collectLogs(input)
  const providers = collectProviders(input).map((provider) => mapProvider(provider, input, logs))

  return {
    providers,
    models: providers.map(mapCatalogItem),
    policies: [mapPolicy(input, providers)],
    logs: logs.map(mapAiInferenceLogToModelRuntimeLog).slice(0, 20),
  }
}
