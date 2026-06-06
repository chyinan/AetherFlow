import type {
  AIInferenceLog,
  AiProviderHealth,
  AiProviderType,
  AiServiceStatusResponse,
  ProviderCatalogModel,
  ProviderCatalogProvider,
  ProviderCatalogResponse,
  ProviderCircuitSnapshot,
  ProviderMetricsResponse,
  ProviderRuntimeLogEntry,
  ProviderRuntimeLogResponse,
  ProviderRoutingPolicy,
  ProviderStatusResponse,
} from '@/api/modules/ai'
import type { ModelCatalogItem, ModelKind, ModelProvider, ModelProviderStatus, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

export interface AiModelMappingInput {
  serviceStatus?: AiServiceStatusResponse | null
  providerStatus?: ProviderStatusResponse | null
  metricsResponse?: ProviderMetricsResponse | null
  catalogResponse?: ProviderCatalogResponse | null
  runtimeLogsResponse?: ProviderRuntimeLogResponse | null
  policy?: ProviderRoutingPolicy | null
}

export interface AiModelSnapshot {
  providers: ModelProvider[]
  models: ModelCatalogItem[]
  policies: ModelRoutingPolicy[]
  logs: ModelRuntimeLog[]
}

const providerMetadata: Record<string, { name: string; runtime: string; capabilities: string[] }> = {
  OPENAI: {
    name: 'OpenAI Gateway',
    runtime: 'cloud llm',
    capabilities: ['chat', 'summary', 'translate', 'subtitle', 'governed failover'],
  },
  OLLAMA: {
    name: 'Ollama Local',
    runtime: 'local llm',
    capabilities: ['chat', 'summary', 'local fallback', 'offline capable'],
  },
  LOCAL_MODEL: {
    name: 'Local Model Runtime',
    runtime: 'local runtime',
    capabilities: ['chat', 'private runtime'],
  },
}

function normalizeProvider(provider: AiProviderType | null | undefined) {
  const normalized = String(provider ?? '').trim().toUpperCase()
  return normalized || 'UNKNOWN'
}

function providerId(provider: string) {
  return `provider-${provider.toLowerCase().replace(/_/g, '-')}`
}

function providerFromId(id: string | null | undefined) {
  return String(id ?? '').replace(/^provider-/, '').replace(/-/g, '_').toUpperCase()
}

function modelId(provider: string, model: string) {
  return `model-${provider.toLowerCase().replace(/_/g, '-')}-${model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function textOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
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
    return '--'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function formatTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return '--'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function durationToMs(value: ProviderRoutingPolicy['requestTimeout']) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value))
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    const numericValue = Number(trimmed)
    if (Number.isFinite(numericValue)) {
      return Math.max(0, Math.round(numericValue))
    }

    const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(trimmed)
    if (match) {
      const hours = Number(match[1] ?? 0)
      const minutes = Number(match[2] ?? 0)
      const seconds = Number(match[3] ?? 0)
      return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000)
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const seconds = numberOrZero(record.seconds)
    const nanos = numberOrZero(record.nano ?? record.nanos)
    if (seconds > 0 || nanos > 0) {
      return Math.round(seconds * 1000 + nanos / 1_000_000)
    }
  }

  return 0
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
  const catalogProviders = input.catalogResponse?.providers ?? []
  const catalogModels = input.catalogResponse?.models ?? []
  const metricKeys = Object.keys(input.metricsResponse?.metrics ?? input.providerStatus?.metrics ?? {})
  const healthKeys = Object.keys(input.providerStatus?.healthStates ?? {})
  const circuitKeys = Object.keys(input.providerStatus?.circuitStates ?? {})

  for (const provider of [
    input.providerStatus?.activeProvider,
    input.serviceStatus?.defaultProvider,
    ...(policyProviders ?? []),
    ...(serviceProviders ?? []),
    ...catalogProviders.map((provider) => provider.provider ?? providerFromId(provider.id)),
    ...catalogModels.map((model) => model.provider ?? providerFromId(model.providerId)),
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

function catalogProviderFor(input: AiModelMappingInput, provider: string): ProviderCatalogProvider | undefined {
  return input.catalogResponse?.providers?.find((entry) => {
    const entryProvider = normalizeProvider(entry.provider ?? providerFromId(entry.id))
    return entryProvider === provider
  })
}

function hasCatalogModelsForProvider(input: AiModelMappingInput, provider: string) {
  return (input.catalogResponse?.models ?? []).some((model) => {
    const modelProvider = normalizeProvider(model.provider ?? providerFromId(model.providerId))
    return modelProvider === provider
  })
}

function mapProviderStatus(health?: AiProviderHealth, circuit?: ProviderCircuitSnapshot): ModelProviderStatus {
  const healthStatus = String(health?.status ?? '').toUpperCase()
  const circuitState = String(circuit?.state ?? '').toUpperCase()

  if (circuitState === 'OPEN' || healthStatus === 'DOWN') {
    return 'offline'
  }

  if (circuitState === 'HALF_OPEN' || healthStatus === 'DEGRADED' || healthStatus === 'UNKNOWN') {
    return 'degraded'
  }

  if (health?.healthy === false) {
    return 'degraded'
  }

  if (health?.healthy === true || healthStatus === 'UP' || circuitState === 'CLOSED') {
    return 'online'
  }

  return 'degraded'
}

function defaultModelForProvider(
  provider: string,
  input: AiModelMappingInput,
  logs: AIInferenceLog[],
  catalogProvider?: ProviderCatalogProvider,
) {
  const catalogDefault = catalogProvider?.defaultModel?.trim()
  if (catalogDefault) {
    return catalogDefault
  }

  if (catalogProvider && !hasCatalogModelsForProvider(input, provider)) {
    return ''
  }

  const serviceDefaultProvider = normalizeProvider(input.serviceStatus?.defaultProvider)
  const serviceDefaultModel = input.serviceStatus?.defaultModel?.trim()

  if (provider === serviceDefaultProvider && serviceDefaultModel) {
    return serviceDefaultModel
  }

  const logModel = logs.find((log) => normalizeProvider(log.provider) === provider && log.model?.trim())?.model?.trim()
  if (logModel) {
    return logModel
  }

  return 'runtime default'
}

function capabilitySet(
  provider: string,
  serviceStatus?: AiServiceStatusResponse | null,
  catalogProvider?: ProviderCatalogProvider,
) {
  const values = new Set(providerMetadata[provider]?.capabilities ?? ['provider managed'])

  for (const capability of catalogProvider?.capabilities ?? []) {
    const normalized = capability.trim()
    if (normalized) {
      values.add(normalized)
    }
  }

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
  const catalogProvider = catalogProviderFor(input, provider)
  const calls = Math.max(0, numberOrZero(metrics?.calls))
  const metadata = providerMetadata[provider]
  const active = normalizeProvider(input.providerStatus?.activeProvider) === provider
  const defaultModel = defaultModelForProvider(provider, input, logs, catalogProvider)

  return {
    id: catalogProvider?.id?.trim() || providerId(provider),
    providerType: provider,
    name: textOr(catalogProvider?.name, metadata?.name ?? provider.replace(/_/g, ' ')),
    runtime: textOr(catalogProvider?.runtime, metadata?.runtime ?? 'ai provider'),
    status: mapProviderStatus(health, circuit),
    active,
    endpoint: textOr(catalogProvider?.endpointLabel, textOr(catalogProvider?.endpoint, 'provider-managed')),
    defaultModel,
    latencyMs: positiveLatency(health?.latencyMillis, metrics?.lastLatencyMillis, metrics?.averageLatencyMillis),
    quotaUsed: calls,
    quotaLimit: undefined,
    capabilities: capabilitySet(provider, input.serviceStatus, catalogProvider),
    lastCheckedAt: formatDateTime(health?.checkedAt ?? metrics?.updatedAt ?? circuit?.updatedAt ?? input.serviceStatus?.time),
    healthStatus: textOr(health?.status, health?.healthy === true ? 'UP' : 'UNKNOWN'),
    circuitState: textOr(circuit?.state, 'UNKNOWN'),
    statusMessage: textOr(circuit?.reason, textOr(health?.message, active ? 'active provider route' : 'registered provider')),
  }
}

function normalizeKind(kind: unknown): ModelKind {
  const normalized = String(kind ?? '').toLowerCase()
  if (normalized.includes('asr') || normalized.includes('whisper')) return 'asr'
  if (normalized.includes('embedding')) return 'embedding'
  if (normalized.includes('media') || normalized.includes('image') || normalized.includes('video')) return 'media'
  return 'chat'
}

function normalizeModelStatus(status: unknown): ModelCatalogItem['status'] {
  const normalized = String(status ?? '').toLowerCase()
  if (['ready', 'online', 'enabled'].includes(normalized)) return 'ready'
  if (['warming', 'degraded', 'pending'].includes(normalized)) return 'warming'
  if (['disabled', 'offline', 'down'].includes(normalized)) return 'disabled'
  return 'ready'
}

function formatUsd(value: unknown) {
  const numericValue = numberOrZero(value)
  return numericValue > 0 ? `$${numericValue}/M` : ''
}

function priceHint(model: ProviderCatalogModel) {
  const explicitHint = model.pricing?.priceHint?.trim()
  if (explicitHint) {
    return explicitHint
  }

  const inputPrice = formatUsd(model.pricing?.inputUsdPerMillionTokens)
  const outputPrice = formatUsd(model.pricing?.outputUsdPerMillionTokens)
  if (inputPrice || outputPrice) {
    return `${inputPrice || '--'} input / ${outputPrice || '--'} output`
  }

  return 'runtime pricing'
}

function mapCatalogModel(model: ProviderCatalogModel, providers: ModelProvider[]): ModelCatalogItem {
  const provider = normalizeProvider(model.provider ?? providerFromId(model.providerId))
  const providerEntry = providers.find((entry) => entry.providerType === provider)
  const modelName = textOr(model.name, providerEntry?.defaultModel ?? 'runtime default')

  return {
    id: textOr(model.id, modelId(provider, modelName)),
    providerId: textOr(model.providerId, providerEntry?.id ?? providerId(provider)),
    name: modelName,
    kind: normalizeKind(model.kind),
    contextWindow: textOr(model.contextWindow, model.contextWindowTokens ? `${model.contextWindowTokens}` : 'runtime default'),
    priceHint: priceHint(model),
    status: normalizeModelStatus(model.status),
    tags: [
      ...(model.tags ?? []),
      ...(model.capabilities ?? []),
    ].filter((tag, index, tags) => Boolean(tag?.trim()) && tags.indexOf(tag) === index),
  }
}

function mapFallbackCatalogItem(provider: ModelProvider): ModelCatalogItem {
  const providerType = provider.providerType ?? providerFromId(provider.id)

  return {
    id: modelId(providerType, provider.defaultModel),
    providerId: provider.id,
    name: provider.defaultModel,
    kind: 'chat',
    contextWindow: 'runtime default',
    priceHint: 'runtime pricing',
    status: provider.status === 'online' ? 'ready' : provider.status === 'degraded' ? 'warming' : 'disabled',
    tags: ['governed provider', provider.runtime],
  }
}

function mapCatalog(input: AiModelMappingInput, providers: ModelProvider[]): ModelCatalogItem[] {
  const catalogModels = input.catalogResponse?.models ?? []
  if (input.catalogResponse) {
    return catalogModels.map((model) => mapCatalogModel(model, providers))
  }

  return providers.map(mapFallbackCatalogItem)
}

function mapPolicy(input: AiModelMappingInput, providers: ModelProvider[]): ModelRoutingPolicy {
  const policy = input.policy ?? input.providerStatus?.routingPolicy
  const orderedProviders = (policy?.providers ?? providers.map((provider) => provider.providerType))
    .map((provider) => normalizeProvider(provider))
    .filter((provider) => provider !== 'UNKNOWN')
  const orderedProviderEntries = orderedProviders
    .map((provider) => providers.find((entry) => entry.providerType === provider))
    .filter((provider): provider is ModelProvider => Boolean(provider))
  const orderedModels = orderedProviderEntries.map((provider) => provider.defaultModel)
  const failoverEnabled = policy?.enableFailover !== false
  const autoRecoverPrimary = policy?.autoRecoverPrimary !== false

  return {
    id: 'policy-ai-provider-routing',
    name: 'AI provider routing',
    description: [
      failoverEnabled ? 'Failover enabled' : 'Failover disabled',
      autoRecoverPrimary ? 'auto recovery' : 'manual recovery',
      orderedProviders.join(' -> '),
    ].filter(Boolean).join(', '),
    primaryModel: orderedModels[0] ?? providers[0]?.defaultModel ?? 'runtime default',
    fallbackModels: failoverEnabled ? orderedModels.slice(1) : [],
    timeoutMs: durationToMs(policy?.requestTimeout),
    retryCount: Math.max(0, Math.round(numberOrZero(policy?.maxRetries))),
    providerOrder: orderedProviders,
    failoverEnabled,
    autoRecoverPrimary,
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

function normalizeRuntimeLogLevel(level: unknown): ModelRuntimeLog['level'] {
  const normalized = String(level ?? '').toLowerCase()
  if (normalized === 'error') return 'error'
  if (normalized === 'warn' || normalized === 'warning') return 'warn'
  return 'info'
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

function mapRuntimeLogEntry(entry: ProviderRuntimeLogEntry, index = 0): ModelRuntimeLog {
  const provider = normalizeProvider(entry.provider)
  const eventType = entry.eventType?.trim() || 'AI_PROVIDER_EVENT'
  const fallbackMessage = `[${eventType}] ${provider}: ${eventType}`

  return {
    id: entry.id?.trim() || `model-runtime-log-${provider}-${index}-${entry.occurredAt ?? entry.time ?? Date.now()}`,
    time: formatTime(entry.occurredAt ?? entry.time),
    level: normalizeRuntimeLogLevel(entry.level),
    message: textOr(entry.message, fallbackMessage),
  }
}

function collectInferenceLogs(input: AiModelMappingInput) {
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

function collectLogs(input: AiModelMappingInput) {
  const runtimeLogs = (input.runtimeLogsResponse?.logs ?? []).map(mapRuntimeLogEntry)
  const inferenceLogs = collectInferenceLogs(input).map(mapAiInferenceLogToModelRuntimeLog)
  const seen = new Set<string>()

  return [...runtimeLogs, ...inferenceLogs]
    .filter((log, index) => {
      const key = log.id?.trim() || `${log.time}-${log.level}-${log.message}-${index}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .slice(0, 30)
}

export function mapAiProviderData(input: AiModelMappingInput): AiModelSnapshot {
  const inferenceLogs = collectInferenceLogs(input)
  const providers = collectProviders(input).map((provider) => mapProvider(provider, input, inferenceLogs))

  return {
    providers,
    models: mapCatalog(input, providers),
    policies: [mapPolicy(input, providers)],
    logs: collectLogs(input),
  }
}
