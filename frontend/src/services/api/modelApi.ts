import { isApiError, toApiError } from '@/api/client/apiError'
import { mapAiProviderData, type AiModelSnapshot } from '@/api/mappers/aiMapper'
import {
  getAiStatus,
  getProviderCatalog,
  getProviderLogs,
  getProviderMetrics,
  getProviderPolicy,
  getProviderStatus,
  recoverProvider as recoverProviderCircuit,
  updateProviderPolicy as updateProviderRoutingPolicy,
  type AiProviderType,
  type ProviderRoutingPolicy,
} from '@/api/modules/ai'
import { runtimeEnv } from '@/config/runtimeEnv'
import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

import { mockModelCatalog, mockModelProviders, mockModelRuntimeLogs, mockRoutingPolicies } from '../mock/modelMock'
import { delay } from '../mock/timing'

const unavailableStatuses = new Set([0, 404, 502, 503, 504])
const unavailableCodeTokens = ['GATEWAY', 'UNAVAILABLE', 'TIMEOUT', 'NETWORK', 'ECONNREFUSED', 'ECONNABORTED', 'ERR_NETWORK']

export interface ModelApiSnapshot extends AiModelSnapshot {
  source: 'real' | 'mock'
}

let snapshotPromise: Promise<AiModelSnapshot> | null = null
let cachedSnapshot: AiModelSnapshot | null = null

function mockSnapshot(): AiModelSnapshot {
  return {
    providers: mockModelProviders,
    models: mockModelCatalog,
    policies: mockRoutingPolicies,
    logs: mockModelRuntimeLogs,
  }
}

function shouldUseMockFallback(error: unknown) {
  if (!runtimeEnv.mockFallback) {
    return false
  }

  const apiError = isApiError(error) ? error : toApiError(error, 'ai')
  const status = apiError.status
  const numericCode = typeof apiError.code === 'number' ? apiError.code : Number(apiError.code)
  const codeText = String(apiError.code ?? '').trim().toUpperCase()
  const messageText = apiError.message.trim().toUpperCase()
  const codeIndicatesUnavailable =
    (Number.isFinite(numericCode) && unavailableStatuses.has(numericCode)) ||
    unavailableCodeTokens.some((token) => codeText.includes(token) || messageText.includes(token))

  if ([400, 401, 403, 409, 422].includes(status ?? 0) || apiError.source === 'auth') {
    return false
  }

  if (apiError.source === 'network') {
    return true
  }

  return (
    (status !== undefined && unavailableStatuses.has(status)) ||
    (status === undefined && codeIndicatesUnavailable)
  )
}

async function loadRealSnapshot(force = false) {
  if (snapshotPromise) {
    return snapshotPromise
  }

  if (force) {
    cachedSnapshot = null
  }

  if (!force && cachedSnapshot) {
    return cachedSnapshot
  }

  const currentPromise = (async () => {
    const [serviceStatus, providerStatus, metricsResponse, catalogResponse, runtimeLogsResponse, policy] = await Promise.all([
      getAiStatus(),
      getProviderStatus(),
      getProviderMetrics(),
      getProviderCatalog(),
      getProviderLogs(50),
      getProviderPolicy(),
    ])
    const snapshot = mapAiProviderData({
      serviceStatus,
      providerStatus,
      metricsResponse,
      catalogResponse,
      runtimeLogsResponse,
      policy,
    })

    cachedSnapshot = snapshot
    return snapshot
  })()
  snapshotPromise = currentPromise

  try {
    return await currentPromise
  } catch (error) {
    throw error
  } finally {
    if (snapshotPromise === currentPromise) {
      snapshotPromise = null
    }
  }
}

async function loadSnapshot(force = false): Promise<ModelApiSnapshot> {
  try {
    const snapshot = await loadRealSnapshot(force)
    return { ...snapshot, source: 'real' }
  } catch (error) {
    if (!shouldUseMockFallback(error)) {
      throw error
    }

    const snapshot = await delay<AiModelSnapshot>(mockSnapshot(), 260)
    return { ...snapshot, source: 'mock' }
  }
}

export const modelApi = {
  async listProviders() {
    const snapshot = await loadSnapshot()
    return snapshot.providers
  },
  async listModels() {
    const snapshot = await loadSnapshot()
    return snapshot.models
  },
  async listRoutingPolicies() {
    const snapshot = await loadSnapshot()
    return snapshot.policies
  },
  async listRuntimeLogs() {
    const snapshot = await loadSnapshot()
    return snapshot.logs
  },
  refreshSnapshot() {
    cachedSnapshot = null
    snapshotPromise = null
    return loadSnapshot(true)
  },
  updateProviderPolicy(policy: ProviderRoutingPolicy) {
    cachedSnapshot = null
    snapshotPromise = null
    return updateProviderRoutingPolicy(policy)
  },
  async recoverProvider(provider: AiProviderType) {
    cachedSnapshot = null
    snapshotPromise = null
    await recoverProviderCircuit(provider)
    return loadSnapshot(true)
  },
  async switchPrimaryProvider(provider: AiProviderType) {
    cachedSnapshot = null
    snapshotPromise = null
    const policy = await getProviderPolicy()
    const normalizedProvider = String(provider).trim().toUpperCase()
    const providers = [
      normalizedProvider,
      ...(policy.providers ?? ['OPENAI', 'OLLAMA']).map((entry) => String(entry).trim().toUpperCase()),
    ].filter((entry, index, entries) => entry && entries.indexOf(entry) === index) as AiProviderType[]

    await updateProviderRoutingPolicy({
      ...policy,
      providers,
    })

    return loadSnapshot(true)
  },
}

export type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog }
