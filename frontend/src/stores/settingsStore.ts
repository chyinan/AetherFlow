import { defineStore } from 'pinia'

import { settingsApi } from '@/services/api/settingsApi'
import type {
  AuditEvent,
  EnvironmentVariable,
  IntegrationSetting,
  WorkspaceMember,
  WorkspaceSettings,
} from '@/types/settings'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    workspace: null as WorkspaceSettings | null,
    members: [] as WorkspaceMember[],
    environmentVariables: [] as EnvironmentVariable[],
    integrations: [] as IntegrationSetting[],
    auditEvents: [] as AuditEvent[],
    loading: false,
  }),
  getters: {
    configuredVariableCount: (state) =>
      state.environmentVariables.filter((item) => item.status === 'configured').length,
    activeMemberCount: (state) => state.members.filter((member) => member.status === 'active').length,
    connectedIntegrationCount: (state) =>
      state.integrations.filter((integration) => integration.status === 'connected').length,
  },
  actions: {
    async loadSettings() {
      this.loading = true
      try {
        const [workspace, members, environmentVariables, integrations, auditEvents] = await Promise.all([
          settingsApi.getWorkspace(),
          settingsApi.listMembers(),
          settingsApi.listEnvironmentVariables(),
          settingsApi.listIntegrations(),
          settingsApi.listAuditEvents(),
        ])
        this.workspace = workspace
        this.members = members
        this.environmentVariables = environmentVariables
        this.integrations = integrations
        this.auditEvents = auditEvents
      } finally {
        this.loading = false
      }
    },
  },
})
