// pattern: Imperative Shell
import { defineStore } from 'pinia'
import { computed, reactive, toRefs, watch } from 'vue'

import { settingsApi } from '@/services/api/settingsApi'
import { useAuthStore } from '@/stores/authStore'
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

export class SettingsAccessError extends Error {}
export class SettingsSessionChangedError extends Error {}

function initialState() {
  return {
    workspace: null as WorkspaceSettings | null,
    members: [] as WorkspaceMember[],
    modelProviders: [] as SettingsModelProvider[],
    providerCatalogState: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    dataSources: [] as DataSourceProvider[],
    apiExtensions: [] as ApiExtensionSetting[],
    billing: null as BillingSnapshot | null,
    environmentVariables: [] as EnvironmentVariable[],
    integrations: [] as IntegrationSetting[],
    telegramIntegration: null as TelegramIntegration | null,
    auditEvents: [] as AuditEvent[],
    loading: false,
    loadErrorCount: 0,
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const authStore = useAuthStore()
  const state = reactive(initialState())
  let sessionGeneration = 0
  let loadGeneration = 0
  const sessionScope = computed(() => JSON.stringify([
    authStore.isAuthenticated,
    authStore.user?.id,
    authStore.user?.userId,
    authStore.user?.username,
    authStore.isAdmin,
  ]))

  function $reset() {
    sessionGeneration += 1
    loadGeneration += 1
    Object.assign(state, initialState())
  }

  // 降权、退出或切换账号时立即清空；旧请求不能重新写回管理数据。
  watch(sessionScope, $reset, { flush: 'sync' })

  function requireAdmin() {
    if (!authStore.isAuthenticated || !authStore.isAdmin) {
      throw new SettingsAccessError('Administrator settings access is required')
    }
    const generation = sessionGeneration
    return () => {
      if (generation !== sessionGeneration || !authStore.isAuthenticated || !authStore.isAdmin) {
        throw new SettingsSessionChangedError('Settings session changed')
      }
    }
  }

  async function loadSettings(options: { includeAdmin?: boolean } = {}) {
    if (!authStore.isAuthenticated) {
      $reset()
      return
    }
    // 调用方不能通过 includeAdmin 提升权限；默认只加载普通设置目录。
    const includeAdmin = options.includeAdmin === true && authStore.isAuthenticated && authStore.isAdmin
    const session = sessionGeneration
    const request = ++loadGeneration
    const isCurrent = () => session === sessionGeneration && request === loadGeneration
    state.loading = true
    state.loadErrorCount = 0
    state.providerCatalogState = includeAdmin ? 'loading' : 'idle'
    if (!includeAdmin) {
      state.members = []
      state.billing = null
      state.environmentVariables = []
      state.integrations = []
      state.telegramIntegration = null
      state.auditEvents = []
      state.modelProviders = []
    }
    try {
      const results = await Promise.allSettled([
        settingsApi.getWorkspace(),
        includeAdmin ? settingsApi.listMembers() : Promise.resolve(undefined),
        includeAdmin ? settingsApi.listModelProviders({ includeConfig: true }) : Promise.resolve(undefined),
        settingsApi.listDataSources(),
        settingsApi.listApiExtensions(),
        includeAdmin ? settingsApi.getBillingSnapshot() : Promise.resolve(undefined),
        includeAdmin ? settingsApi.listEnvironmentVariables() : Promise.resolve(undefined),
        includeAdmin ? settingsApi.listIntegrations() : Promise.resolve(undefined),
        includeAdmin ? settingsApi.getTelegramIntegration() : Promise.resolve(undefined),
        includeAdmin ? settingsApi.listAuditEvents() : Promise.resolve(undefined),
      ])
      if (!isCurrent()) return
      state.loadErrorCount = results.filter((result) => result.status === 'rejected').length
      const keys = ['workspace', 'members', 'modelProviders', 'dataSources', 'apiExtensions', 'billing', 'environmentVariables', 'integrations', 'telegramIntegration', 'auditEvents'] as const
      results.forEach((result, index) => {
        // 失败的区块必须置空，避免旧成功快照掩盖当前失败。
        const value = result.status === 'fulfilled' ? result.value : undefined
        const key = keys[index]!
        if (value !== undefined) Object.assign(state, { [key]: value })
        else Object.assign(state, { [key]: initialState()[key] })
      })
      state.providerCatalogState = includeAdmin
        ? results[2]!.status === 'fulfilled' ? 'ready' : 'error'
        : 'idle'
    } finally {
      if (isCurrent()) state.loading = false
    }
  }

  async function saveWorkspace(payload: WorkspaceSettings) {
    const assertCurrent = requireAdmin()
    const workspace = await settingsApi.updateWorkspace(payload)
    assertCurrent()
    state.workspace = workspace
    return workspace
  }

  async function createWorkspaceMember(payload: { name: string; email: string; role: WorkspaceMember['role'] }) {
    const assertCurrent = requireAdmin()
    const member = await settingsApi.createMember(payload)
    assertCurrent()
    state.members = [...state.members, member]
    return member
  }

  async function updateWorkspaceMember(memberId: string, payload: { role?: WorkspaceMember['role']; status?: WorkspaceMember['status'] }) {
    const assertCurrent = requireAdmin()
    const member = await settingsApi.updateMember(memberId, payload)
    assertCurrent()
    const index = state.members.findIndex((item) => item.id === member.id)
    if (index >= 0) state.members[index] = member
    return member
  }

  async function deleteWorkspaceMember(memberId: string) {
    const assertCurrent = requireAdmin()
    await settingsApi.deleteMember(memberId)
    assertCurrent()
    state.members = state.members.filter((item) => item.id !== memberId)
  }

  async function configureModelProvider(payload: { providerKey: string; enabled: boolean; apiKey?: string | null; baseUrl: string; defaultModel: string }) {
    const assertCurrent = requireAdmin()
    const provider = await settingsApi.updateModelProviderConfig(payload.providerKey, {
      enabled: payload.enabled,
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
      defaultModel: payload.defaultModel,
    })
    assertCurrent()
    const index = state.modelProviders.findIndex((item) => item.providerKey === provider.providerKey)
    if (index >= 0) state.modelProviders[index] = provider
    else state.modelProviders.push(provider)
    return provider
  }

  async function configureTelegramIntegration(payload: { enabled: boolean; botToken?: string | null; chatId: string }) {
    const assertCurrent = requireAdmin()
    const integration = await settingsApi.updateTelegramIntegration(payload)
    assertCurrent()
    state.telegramIntegration = integration
    return integration
  }

  async function testTelegramIntegration() {
    const assertCurrent = requireAdmin()
    const response = await settingsApi.testTelegramIntegration()
    assertCurrent()
    const integration = await settingsApi.getTelegramIntegration()
    assertCurrent()
    state.telegramIntegration = integration
    return response
  }

  return {
    ...toRefs(state),
    configuredVariableCount: computed(() => state.environmentVariables.filter((item) => item.status === 'configured').length),
    activeMemberCount: computed(() => state.members.filter((member) => member.status === 'active').length),
    installedModelProviderCount: computed(() => state.modelProviders.filter((provider) => provider.status === 'installed').length),
    connectedDataSourceCount: computed(() => state.dataSources.filter((source) => source.status === 'connected').length),
    configuredApiExtensionCount: computed(() => state.apiExtensions.filter((extension) => extension.status === 'connected' || extension.status === 'configured').length),
    connectedIntegrationCount: computed(() => state.integrations.filter((integration) => integration.status === 'connected').length),
    $reset,
    loadSettings,
    saveWorkspace,
    createWorkspaceMember,
    updateWorkspaceMember,
    deleteWorkspaceMember,
    configureModelProvider,
    configureTelegramIntegration,
    testTelegramIntegration,
  }
})
