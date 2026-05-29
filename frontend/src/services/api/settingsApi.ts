import type {
  AuditEvent,
  ApiExtensionSetting,
  BillingSnapshot,
  DataSourceProvider,
  EnvironmentVariable,
  IntegrationSetting,
  SettingsModelProvider,
  WorkspaceMember,
  WorkspaceSettings,
} from '@/types/settings'

import {
  mockApiExtensions,
  mockAuditEvents,
  mockBillingSnapshot,
  mockDataSourceProviders,
  mockEnvironmentVariables,
  mockIntegrations,
  mockSettingsModelProviders,
  mockWorkspaceMembers,
  mockWorkspaceSettings,
} from '../mock/settingsMock'
import { delay } from '../mock/timing'

export const settingsApi = {
  getWorkspace() {
    return delay<WorkspaceSettings>(mockWorkspaceSettings)
  },
  listMembers() {
    return delay<WorkspaceMember[]>(mockWorkspaceMembers)
  },
  listModelProviders() {
    return delay<SettingsModelProvider[]>(mockSettingsModelProviders)
  },
  listDataSources() {
    return delay<DataSourceProvider[]>(mockDataSourceProviders)
  },
  listApiExtensions() {
    return delay<ApiExtensionSetting[]>(mockApiExtensions)
  },
  getBillingSnapshot() {
    return delay<BillingSnapshot>(mockBillingSnapshot)
  },
  listEnvironmentVariables() {
    return delay<EnvironmentVariable[]>(mockEnvironmentVariables)
  },
  listIntegrations() {
    return delay<IntegrationSetting[]>(mockIntegrations)
  },
  listAuditEvents() {
    return delay<AuditEvent[]>(mockAuditEvents)
  },
}
