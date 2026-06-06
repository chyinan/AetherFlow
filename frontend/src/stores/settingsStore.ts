import { defineStore } from 'pinia'

import { settingsApi } from '@/services/api/settingsApi'
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

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    workspace: null as WorkspaceSettings | null,
    members: [] as WorkspaceMember[],
    modelProviders: [] as SettingsModelProvider[],
    dataSources: [] as DataSourceProvider[],
    apiExtensions: [] as ApiExtensionSetting[],
    billing: null as BillingSnapshot | null,
    environmentVariables: [] as EnvironmentVariable[],
    integrations: [] as IntegrationSetting[],
    telegramIntegration: null as TelegramIntegration | null,
    auditEvents: [] as AuditEvent[],
    loading: false,
  }),
  getters: {
    configuredVariableCount: (state) =>
      state.environmentVariables.filter((item) => item.status === 'configured').length,
    activeMemberCount: (state) => state.members.filter((member) => member.status === 'active').length,
    installedModelProviderCount: (state) =>
      state.modelProviders.filter((provider) => provider.status === 'installed').length,
    connectedDataSourceCount: (state) =>
      state.dataSources.filter((source) => source.status === 'connected').length,
    configuredApiExtensionCount: (state) =>
      state.apiExtensions.filter((extension) => extension.status === 'connected' || extension.status === 'configured')
        .length,
    connectedIntegrationCount: (state) =>
      state.integrations.filter((integration) => integration.status === 'connected').length,
  },
  actions: {
    async loadSettings() {
      this.loading = true
      try {
        const [
          workspace,
          members,
          modelProviders,
          dataSources,
          apiExtensions,
          billing,
          environmentVariables,
          integrations,
          telegramIntegration,
          auditEvents,
        ] = await Promise.all([
          settingsApi.getWorkspace(),
          settingsApi.listMembers(),
          settingsApi.listModelProviders(),
          settingsApi.listDataSources(),
          settingsApi.listApiExtensions(),
          settingsApi.getBillingSnapshot(),
          settingsApi.listEnvironmentVariables(),
          settingsApi.listIntegrations(),
          settingsApi.getTelegramIntegration(),
          settingsApi.listAuditEvents(),
        ])
        this.workspace = workspace
        this.members = members
        this.modelProviders = modelProviders
        this.dataSources = dataSources
        this.apiExtensions = apiExtensions
        this.billing = billing
        this.environmentVariables = environmentVariables
        this.integrations = integrations
        this.telegramIntegration = telegramIntegration
        this.auditEvents = auditEvents
      } finally {
        this.loading = false
      }
    },
    recordAudit(action: string, target: string) {
      this.auditEvents = [
        {
          id: `audit-${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          actor: 'aether.operator',
          action,
          target,
        },
        ...this.auditEvents,
      ].slice(0, 12)
    },
    installModelProvider(providerId: string) {
      const provider = this.modelProviders.find((item) => item.id === providerId)
      if (!provider) return
      provider.status = 'installed'
      this.recordAudit('installed model provider', provider.name)
    },
    async createWorkspaceMember(payload: {
      name: string
      email: string
      role: WorkspaceMember['role']
    }) {
      const member = await settingsApi.createMember(payload)
      this.members = [...this.members, member]
      this.recordAudit('invited workspace member', member.email)
      return member
    },
    async updateWorkspaceMember(memberId: string, payload: {
      role?: WorkspaceMember['role']
      status?: WorkspaceMember['status']
    }) {
      const member = await settingsApi.updateMember(memberId, payload)
      const index = this.members.findIndex((item) => item.id === member.id)
      if (index >= 0) {
        this.members[index] = member
      }
      this.recordAudit('updated workspace member', member.email)
      return member
    },
    async deleteWorkspaceMember(memberId: string) {
      const member = this.members.find((item) => item.id === memberId)
      await settingsApi.deleteMember(memberId)
      this.members = this.members.filter((item) => item.id !== memberId)
      this.recordAudit('removed workspace member', member?.email ?? memberId)
    },
    async configureModelProvider(payload: {
      providerKey: string
      enabled: boolean
      apiKey?: string | null
      baseUrl: string
      defaultModel: string
    }) {
      const provider = await settingsApi.updateModelProviderConfig(payload.providerKey, {
        enabled: payload.enabled,
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        defaultModel: payload.defaultModel,
      })
      const index = this.modelProviders.findIndex((item) => item.providerKey === provider.providerKey)
      if (index >= 0) {
        this.modelProviders[index] = provider
      } else {
        this.modelProviders.push(provider)
      }
      this.recordAudit('configured model provider', provider.name)
      return provider
    },
    connectDataSource(sourceId: string) {
      const source = this.dataSources.find((item) => item.id === sourceId)
      if (!source) return
      source.status = 'connected'
      this.recordAudit('connected data source', source.name)
    },
    configureApiExtension(extensionId: string) {
      const extension = this.apiExtensions.find((item) => item.id === extensionId)
      if (!extension) return
      extension.status = extension.status === 'disabled' ? 'configured' : extension.status
      this.recordAudit('configured API extension', extension.name)
    },
    async configureTelegramIntegration(payload: {
      enabled: boolean
      botToken?: string | null
      chatId: string
    }) {
      const integration = await settingsApi.updateTelegramIntegration(payload)
      this.telegramIntegration = integration
      this.recordAudit('configured telegram integration', integration.enabled ? 'enabled' : 'disabled')
      return integration
    },
    async testTelegramIntegration() {
      const response = await settingsApi.testTelegramIntegration()
      this.telegramIntegration = await settingsApi.getTelegramIntegration()
      this.recordAudit('tested telegram integration', this.telegramIntegration.chatId || 'telegram')
      return response
    },
  },
})
