// pattern: Imperative Shell
import { isApiError, toApiError } from '@/api/client/apiError'
import { runtimeEnv } from '@/config/runtimeEnv'
import { ModelManagementRefreshError } from '@/utils/modelManagementRefreshError'
import { mockModelCatalog, mockModelProviders, mockModelRuntimeLogs, mockRoutingPolicies } from '../mock/modelMock'
import { mapAiProviderData, type AiModelSnapshot } from '@/api/mappers/aiMapper'
import {
  getAiStatus, getProviderCatalog, getProviderPolicy, getProviderStatus,
  recoverProvider as recoverProviderCircuit,
  updateProviderPolicy as updateProviderRoutingPolicy,
  type AiProviderType, type ProviderRoutingPolicy,
} from '@/api/modules/ai'
import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog, ModelProviderStatus } from '@/types/model'

export interface ModelApiSnapshot extends AiModelSnapshot {
  source: 'real' | 'mock'
}
export interface ModelSnapshotOptions { management?: boolean }

/** 默认只读取模型目录；管理快照必须显式请求，且由调用方检查当前身份。 */
async function loadRealSnapshot({ management = false }: ModelSnapshotOptions = {}): Promise<ModelApiSnapshot> {
  // 不保留跨账号缓存；所有能力和可用性必须来自本次服务端快照。
  const [catalogResponse, serviceStatus, policy, providerStatus] = await Promise.all([
    getProviderCatalog(),
    management ? getAiStatus() : undefined,
    management ? getProviderPolicy() : undefined,
    management ? getProviderStatus() : undefined,
  ])
  const snapshot = mapAiProviderData({ catalogResponse, serviceStatus, policy, providerStatus })
  const normalizeProvider = (value: unknown) => String(value ?? '').trim().toUpperCase()
  const providerFromId = (id: unknown) => normalizeProvider(String(id ?? '').replace(/^provider-/, '').replace(/-/g, '_'))
  const registered = new Set([
    ...(catalogResponse.providers ?? []).map((entry) => normalizeProvider(entry.provider) || providerFromId(entry.id)),
    ...(catalogResponse.models ?? []).map((entry) => normalizeProvider(entry.provider) || providerFromId(entry.providerId)),
    ...(serviceStatus?.providers ?? []).map(normalizeProvider),
    normalizeProvider(serviceStatus?.defaultProvider),
    normalizeProvider(providerStatus?.activeProvider),
    ...Object.keys(providerStatus?.healthStates ?? {}).map(normalizeProvider),
    ...Object.keys(providerStatus?.circuitStates ?? {}).map(normalizeProvider),
  ].filter(Boolean))
  return {
    ...snapshot,
    source: 'real',
    providers: snapshot.providers.filter((provider) => registered.has(provider.providerType ?? '')).map((provider) => {
      const catalog = catalogResponse.providers?.find((entry) => (normalizeProvider(entry.provider) || providerFromId(entry.id)) === provider.providerType)
      const health = Object.entries(providerStatus?.healthStates ?? {}).find(([key, value]) => normalizeProvider(value?.provider ?? key) === provider.providerType)?.[1]
      const circuit = Object.entries(providerStatus?.circuitStates ?? {}).find(([key, value]) => normalizeProvider(value?.provider ?? key) === provider.providerType)?.[1]
      const healthState = normalizeProvider(health?.status)
      const circuitState = normalizeProvider(circuit?.state)
      const status: ModelProviderStatus = circuitState === 'OPEN' || healthState === 'DOWN' ? 'offline'
        : circuitState === 'HALF_OPEN' || healthState === 'DEGRADED' ? 'degraded'
          : healthState === 'UNKNOWN' || !health || health.healthy === false ? 'unknown'
            : healthState === 'UP' || health.healthy === true ? 'online' : 'unknown'
      return {
        ...provider,
        status,
        // 展示能力只取服务端目录，避免历史展示文案变成能力承诺。
        capabilities: catalog?.capabilities ?? [],
        endpoint: management ? catalog?.endpointLabel || catalog?.endpoint || '' : '',
        ...(management ? {} : { active: undefined, circuitState: undefined, healthStatus: undefined, statusMessage: undefined, quotaUsed: 0, quotaLimit: undefined }),
      }
    }),
    models: snapshot.models.map((model, index) => ({
      ...model,
      status: ['ready', 'online', 'enabled', 'warming', 'degraded', 'pending', 'disabled', 'offline', 'down'].includes(String(catalogResponse.models?.[index]?.status ?? '').trim().toLowerCase()) ? model.status : 'unknown',
    })),
    policies: management && policy ? snapshot.policies : [],
    logs: management ? snapshot.logs : [],
  }
}

function shouldUseMockFallback(error: unknown) {
  if (!runtimeEnv.mockFallback) return false
  const apiError = isApiError(error) ? error : toApiError(error, 'ai')
  if ([400, 401, 403, 409, 422].includes(apiError.status ?? 0) || apiError.source === 'auth') return false
  const unavailableStatuses = new Set([0, 404, 502, 503, 504])
  const text = `${apiError.code ?? ''} ${apiError.message}`.toUpperCase()
  return apiError.source === 'network'
    || apiError.status !== undefined && unavailableStatuses.has(apiError.status)
    || apiError.status === undefined && (unavailableStatuses.has(Number(apiError.code))
      || ['GATEWAY', 'UNAVAILABLE', 'TIMEOUT', 'NETWORK', 'ECONNREFUSED', 'ECONNABORTED', 'ERR_NETWORK'].some((token) => text.includes(token)))
}

async function loadSnapshot(options: ModelSnapshotOptions = {}): Promise<ModelApiSnapshot> {
  try { return await loadRealSnapshot(options) }
  catch (error) {
    if (!shouldUseMockFallback(error)) throw error
    // 只保留部署者显式启用的演示模式；普通服务能力目录独立读取真实能力 API。
    return {
      source: 'mock', models: mockModelCatalog,
      providers: options.management ? mockModelProviders : mockModelProviders.map((provider) => ({ ...provider, endpoint: '', active: undefined, healthStatus: undefined, circuitState: undefined, statusMessage: undefined, quotaUsed: 0, quotaLimit: undefined })),
      policies: options.management ? mockRoutingPolicies : [], logs: options.management ? mockModelRuntimeLogs : [],
    }
  }
}

export const modelApi = {
  async listProviders() { return (await loadSnapshot()).providers },
  async listModels() { return (await loadSnapshot()).models },
  async listRoutingPolicies() { return (await loadSnapshot({ management: true })).policies },
  async listRuntimeLogs() { return (await loadSnapshot({ management: true })).logs },
  refreshSnapshot(options: ModelSnapshotOptions = {}) { return loadSnapshot(options) },
  updateProviderPolicy(policy: ProviderRoutingPolicy) { return updateProviderRoutingPolicy(policy) },
  async recoverProvider(provider: AiProviderType, isCurrent: () => boolean = () => true) {
    if (!isCurrent()) throw new Error('Management context changed')
    await recoverProviderCircuit(provider)
    if (!isCurrent()) throw new Error('Management context changed')
    try { return await loadRealSnapshot({ management: true }) }
    catch (error) { throw new ModelManagementRefreshError(error) }
  },
  async switchPrimaryProvider(provider: AiProviderType, isCurrent: () => boolean = () => true) {
    if (!isCurrent()) throw new Error('Management context changed')
    const policy = await getProviderPolicy()
    if (!isCurrent()) throw new Error('Management context changed')
    const normalizedProvider = String(provider).trim().toUpperCase()
    const providers = [normalizedProvider, ...(policy.providers ?? []).map((entry) => String(entry).trim().toUpperCase())]
      .filter((entry, index, entries) => entry && entries.indexOf(entry) === index) as AiProviderType[]
    await updateProviderRoutingPolicy({ ...policy, providers })
    if (!isCurrent()) throw new Error('Management context changed')
    try { return await loadRealSnapshot({ management: true }) }
    catch (error) { throw new ModelManagementRefreshError(error) }
  },
}
export type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog }
