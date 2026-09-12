import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { settingsApi } from '@/services/api/settingsApi'
import type { WorkspaceSettings } from '@/types/settings'

import { useSettingsStore } from './settingsStore'

describe('settingsStore workspace persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('persists and replaces the workspace with the backend response', async () => {
    const draft: WorkspaceSettings = {
      name: 'AetherFlow Production',
      slug: 'aetherflow-production',
      region: 'cn-prod-01',
      environment: 'prod',
      defaultTimeoutMin: 60,
      retentionDays: 90,
    }
    const update = vi.spyOn(settingsApi, 'updateWorkspace').mockResolvedValue(draft)
    const store = useSettingsStore()

    await store.saveWorkspace(draft)

    expect(update).toHaveBeenCalledWith(draft)
    expect(store.workspace).toEqual(draft)
  })

  it('skips administrator-only requests for an operator session', async () => {
    const workspace = {
      name: 'AetherFlow',
      slug: 'aetherflow',
      region: 'local',
      environment: 'dev',
      defaultTimeoutMin: 45,
      retentionDays: 30,
    } as WorkspaceSettings
    const workspaceRequest = vi.spyOn(settingsApi, 'getWorkspace').mockResolvedValue(workspace)
    const modelProvidersRequest = vi.spyOn(settingsApi, 'listModelProviders').mockResolvedValue([])
    const dataSourcesRequest = vi.spyOn(settingsApi, 'listDataSources').mockResolvedValue([])
    const apiExtensionsRequest = vi.spyOn(settingsApi, 'listApiExtensions').mockResolvedValue([])
    const environmentVariablesRequest = vi.spyOn(settingsApi, 'listEnvironmentVariables').mockResolvedValue([])
    const adminRequests = [
      vi.spyOn(settingsApi, 'listMembers').mockResolvedValue([]),
      vi.spyOn(settingsApi, 'getBillingSnapshot').mockResolvedValue(undefined as never),
      vi.spyOn(settingsApi, 'listIntegrations').mockResolvedValue([]),
      vi.spyOn(settingsApi, 'getTelegramIntegration').mockResolvedValue(undefined as never),
      vi.spyOn(settingsApi, 'listAuditEvents').mockResolvedValue([]),
    ]
    const store = useSettingsStore()

    await store.loadSettings({ includeAdmin: false })

    expect(workspaceRequest).toHaveBeenCalledOnce()
    expect(modelProvidersRequest).toHaveBeenCalledWith({ includeConfig: false })
    expect(dataSourcesRequest).toHaveBeenCalledOnce()
    expect(apiExtensionsRequest).toHaveBeenCalledOnce()
    expect(environmentVariablesRequest).toHaveBeenCalledOnce()
    adminRequests.forEach((request) => expect(request).not.toHaveBeenCalled())
  })
})
