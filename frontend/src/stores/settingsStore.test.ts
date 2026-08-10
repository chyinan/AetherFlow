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
})
