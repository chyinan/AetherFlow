import { apiClient } from '@/api/client/apiClient'
import {
  getProviderConfigCatalog,
  updateProviderConfig,
  type ProviderConfigEntry,
  type ProviderConfigUpdatePayload,
} from '@/api/modules/ai'
import { modelApi } from '@/services/api/modelApi'
import type { ModelProvider } from '@/types/model'
import type {
  AuditEvent,
  ApiExtensionSetting,
  BillingSnapshot,
  DataSourceProvider,
  EnvironmentVariable,
  IntegrationSetting,
  SettingsModelProvider,
  TelegramIntegration,
  WorkspaceMember,
  WorkspaceSettings,
} from '@/types/settings'

import { mockSettingsModelProviders } from '../mock/settingsMock'

interface WorkspaceSettingsResponse {
  name?: string
  slug?: string
  region?: string
  environment?: string
  defaultTimeoutMin?: number
  retentionDays?: number
}

interface WorkspaceMemberResponse {
  id?: string
  name?: string
  email?: string
  role?: string
  status?: string
  lastSeen?: string
}

interface WorkspaceMemberCreateRequest {
  name: string
  email: string
  role: WorkspaceMember['role']
}

interface WorkspaceMemberUpdateRequest {
  name?: string
  email?: string
  role?: WorkspaceMember['role']
  status?: WorkspaceMember['status']
}

interface BillingSnapshotResponse {
  plan?: string
  aiCredits?: number
  monthlyBudget?: string
  currentSpend?: string
  renewalAt?: string
  seats?: string
}

interface AuditEventResponse {
  id?: string
  time?: string
  actor?: string
  action?: string
  target?: string
}

interface TelegramIntegrationResponse {
  enabled?: boolean
  botTokenConfigured?: boolean
  botTokenPreview?: string
  chatId?: string
  lastTestStatus?: string
}

interface TelegramIntegrationUpdateRequest {
  enabled: boolean
  botToken?: string | null
  chatId: string
}

export interface TelegramIntegrationTestResponse {
  success?: boolean
  message?: string
}

interface ModelProviderConfigUpdate {
  enabled: boolean
  apiKey?: string | null
  baseUrl: string
  defaultModel: string
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberOr(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function environmentOr(value: unknown): WorkspaceSettings['environment'] {
  return value === 'prod' || value === 'staging' || value === 'dev' ? value : 'dev'
}

function roleOr(value: unknown): WorkspaceMember['role'] {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'owner') return 'Owner'
  if (normalized === 'admin') return 'Admin'
  if (normalized === 'viewer') return 'Viewer'
  return 'Operator'
}

function memberStatusOr(value: unknown): WorkspaceMember['status'] {
  return value === 'invited' ? 'invited' : 'active'
}

function mapWorkspace(workspace: WorkspaceSettingsResponse): WorkspaceSettings {
  return {
    name: stringOr(workspace.name, 'AetherFlow Lab'),
    slug: stringOr(workspace.slug, 'aetherflow-lab'),
    region: stringOr(workspace.region, 'cn-dev-01'),
    environment: environmentOr(workspace.environment),
    defaultTimeoutMin: numberOr(workspace.defaultTimeoutMin, 45),
    retentionDays: numberOr(workspace.retentionDays, 30),
  }
}

function mapMember(member: WorkspaceMemberResponse): WorkspaceMember {
  return {
    id: stringOr(member.id, 'member-unknown'),
    name: stringOr(member.name, 'AetherFlow User'),
    email: stringOr(member.email, '-'),
    role: roleOr(member.role),
    status: memberStatusOr(member.status),
    lastSeen: stringOr(member.lastSeen, '-'),
  }
}

function mapBilling(billing: BillingSnapshotResponse): BillingSnapshot {
  return {
    plan: stringOr(billing.plan, '-'),
    aiCredits: numberOr(billing.aiCredits),
    monthlyBudget: stringOr(billing.monthlyBudget, '-'),
    currentSpend: stringOr(billing.currentSpend, '-'),
    renewalAt: stringOr(billing.renewalAt, '-'),
    seats: stringOr(billing.seats, '-'),
  }
}

function mapAudit(event: AuditEventResponse): AuditEvent {
  return {
    id: stringOr(event.id, `audit-${Date.now()}`),
    time: stringOr(event.time, '-'),
    actor: stringOr(event.actor, 'system'),
    action: stringOr(event.action, ''),
    target: stringOr(event.target, ''),
  }
}

function mapTelegramIntegration(value: TelegramIntegrationResponse): TelegramIntegration {
  return {
    enabled: Boolean(value.enabled),
    botTokenConfigured: Boolean(value.botTokenConfigured),
    botTokenPreview: stringOr(value.botTokenPreview, ''),
    chatId: stringOr(value.chatId, ''),
    lastTestStatus: stringOr(value.lastTestStatus, 'untested'),
  }
}

function providerKeyFromRuntime(provider: ModelProvider) {
  const providerType = String(provider.providerType ?? provider.id ?? provider.name).trim().toLowerCase()
  if (providerType.includes('ollama')) return 'ollama'
  if (providerType.includes('openai')) return 'openai'
  return providerType.replace(/^provider-/, '').replace(/_/g, '-')
}

function mapModelProvider(config: ProviderConfigEntry, runtimeProvider?: ModelProvider): SettingsModelProvider {
  const providerKey = stringOr(config.id, 'provider')
  const region = config.region === 'domestic' ? 'domestic' : 'global'
  const configured = Boolean(config.configured)
  const enabled = Boolean(config.enabled)
  const installed = configured || providerKey === 'ollama' || Boolean(runtimeProvider)
  const tags = Array.isArray(config.tags) ? config.tags : []
  return {
    id: `provider-${providerKey}`,
    providerKey,
    providerType: stringOr(config.providerType, 'openai-compatible'),
    name: stringOr(config.name, providerKey),
    maintainer: 'AetherFlow Runtime',
    region,
    status: installed ? 'installed' : 'available',
    description: stringOr(config.description, runtimeProvider?.runtime ?? 'Provider preset'),
    defaultModel: stringOr(runtimeProvider?.defaultModel, stringOr(config.defaultModel, '-')),
    baseUrl: stringOr(config.baseUrl, '-'),
    enabled,
    configured,
    apiKeyConfigured: Boolean(config.apiKeyConfigured),
    apiKeyPreview: stringOr(config.apiKeyPreview, ''),
    installCount: installed ? '1' : 'preset',
    tags,
  }
}

function availablePresetProviders() {
  return mockSettingsModelProviders.map((provider) => ({
    ...provider,
    status: 'available' as const,
    enabled: false,
    configured: false,
    apiKeyConfigured: false,
    apiKeyPreview: '',
    tags: [...provider.tags],
  }))
}

function runtimeProviderToInstalledProvider(provider: ModelProvider): SettingsModelProvider {
  const providerKey = providerKeyFromRuntime(provider)
  const isOllama = providerKey === 'ollama'

  return {
    id: `provider-${providerKey}`,
    providerKey,
    providerType: provider.providerType ?? providerKey,
    name: isOllama ? 'Ollama' : provider.name,
    maintainer: 'AetherFlow Runtime',
    region: 'domestic',
    status: 'installed',
    description: isOllama
      ? '本地 Ollama 运行时，适合私有化推理、摘要和工作流节点调用。'
      : provider.runtime,
    defaultModel: provider.defaultModel,
    baseUrl: provider.endpoint,
    enabled: true,
    configured: true,
    apiKeyConfigured: false,
    apiKeyPreview: '',
    installCount: 'local',
    tags: isOllama ? ['local', 'chat', 'private-runtime'] : [...provider.capabilities],
  }
}

function fallbackModelProviders(runtimeProviders: ModelProvider[]) {
  const installedRuntimeProviders = runtimeProviders
    .filter((provider) => providerKeyFromRuntime(provider) === 'ollama')
    .map(runtimeProviderToInstalledProvider)
  const installedKeys = new Set(installedRuntimeProviders.map((provider) => provider.providerKey))
  const presets = availablePresetProviders().filter((provider) => !installedKeys.has(provider.providerKey))

  return [...installedRuntimeProviders, ...presets]
}

export const settingsApi = {
  async getWorkspace() {
    return mapWorkspace(await apiClient.get<WorkspaceSettingsResponse>('/settings/profile', { source: 'auth' }))
  },
  async listMembers() {
    const members = await apiClient.get<WorkspaceMemberResponse[]>('/settings/members', { source: 'auth' })
    return members.map(mapMember)
  },
  async createMember(payload: WorkspaceMemberCreateRequest) {
    return mapMember(await apiClient.post<WorkspaceMemberResponse>('/settings/members', payload, { source: 'auth' }))
  },
  async updateMember(memberId: string, payload: WorkspaceMemberUpdateRequest) {
    return mapMember(await apiClient.patch<WorkspaceMemberResponse>(
      `/settings/members/${encodeURIComponent(memberId)}`,
      payload,
      { source: 'auth' },
    ))
  },
  async deleteMember(memberId: string) {
    await apiClient.delete(`/settings/members/${encodeURIComponent(memberId)}`, { source: 'auth' })
  },
  async listModelProviders() {
    const [runtimeProviders, configCatalog] = await Promise.all([
      modelApi.listProviders().catch(() => [] as ModelProvider[]),
      getProviderConfigCatalog().catch(() => ({ providers: [] })),
    ])
    const runtimeByProviderKey = new Map(runtimeProviders.map((provider) => [providerKeyFromRuntime(provider), provider]))
    const configProviders = configCatalog.providers ?? []

    if (configProviders.length === 0) {
      return fallbackModelProviders(runtimeProviders)
    }

    return configProviders.map((config) => mapModelProvider(
      config,
      runtimeByProviderKey.get(stringOr(config.id, '')),
    ))
  },
  async updateModelProviderConfig(providerKey: string, payload: ModelProviderConfigUpdate) {
    const updated = await updateProviderConfig(providerKey, {
      enabled: payload.enabled,
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
      defaultModel: payload.defaultModel,
    } satisfies ProviderConfigUpdatePayload)
    const runtimeProviders = await modelApi.refreshSnapshot().then((snapshot) => snapshot.providers)
    const runtimeByProviderKey = new Map(runtimeProviders.map((provider) => [providerKeyFromRuntime(provider), provider]))
    return mapModelProvider(updated, runtimeByProviderKey.get(providerKey))
  },
  async listDataSources() {
    return [] as DataSourceProvider[]
  },
  async listApiExtensions() {
    return [] as ApiExtensionSetting[]
  },
  async getBillingSnapshot() {
    return mapBilling(await apiClient.get<BillingSnapshotResponse>('/settings/billing', { source: 'auth' }))
  },
  async listEnvironmentVariables() {
    return [] as EnvironmentVariable[]
  },
  async listIntegrations() {
    return [] as IntegrationSetting[]
  },
  async listAuditEvents() {
    const events = await apiClient.get<AuditEventResponse[]>('/settings/audit-events', {
      params: { limit: 20 },
      source: 'auth',
    })
    return events.map(mapAudit)
  },
  async getTelegramIntegration() {
    return mapTelegramIntegration(await apiClient.get<TelegramIntegrationResponse>(
      '/settings/integrations/telegram',
      { source: 'auth' },
    ))
  },
  async updateTelegramIntegration(payload: TelegramIntegrationUpdateRequest) {
    return mapTelegramIntegration(await apiClient.put<TelegramIntegrationResponse>(
      '/settings/integrations/telegram',
      payload,
      { source: 'auth' },
    ))
  },
  async testTelegramIntegration() {
    return apiClient.post<TelegramIntegrationTestResponse>(
      '/settings/integrations/telegram/test',
      undefined,
      { source: 'auth' },
    )
  },
}
