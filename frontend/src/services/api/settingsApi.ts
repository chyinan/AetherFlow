import type {
  AuditEvent,
  EnvironmentVariable,
  IntegrationSetting,
  WorkspaceMember,
  WorkspaceSettings,
} from '@/types/settings'

import {
  mockAuditEvents,
  mockEnvironmentVariables,
  mockIntegrations,
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
