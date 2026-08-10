import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, put } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    get,
    put,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { settingsApi } from './settingsApi'

describe('settingsApi', () => {
  beforeEach(() => {
    get.mockReset()
    put.mockReset()
  })

  it.each([
    ['listDataSources', '/settings/data-sources'],
    ['listApiExtensions', '/settings/api-extensions'],
    ['listEnvironmentVariables', '/settings/env-variables'],
    ['listIntegrations', '/settings/integrations'],
  ] as const)('%s loads the real backend collection', async (method, path) => {
    get.mockResolvedValueOnce([])

    await settingsApi[method]()

    expect(get).toHaveBeenCalledWith(path, { source: 'auth' })
  })

  it('persists workspace profile updates through the backend contract', async () => {
    put.mockResolvedValueOnce({
      name: 'AetherFlow Production',
      slug: 'aetherflow-production',
      region: 'cn-prod-01',
      environment: 'prod',
      defaultTimeoutMin: 60,
      retentionDays: 90,
    })

    const workspace = await settingsApi.updateWorkspace({
      name: 'AetherFlow Production',
      slug: 'aetherflow-production',
      region: 'cn-prod-01',
      environment: 'prod',
      defaultTimeoutMin: 60,
      retentionDays: 90,
    })

    expect(put).toHaveBeenCalledWith('/settings/profile', expect.any(Object), { source: 'auth' })
    expect(workspace).toMatchObject({ name: 'AetherFlow Production', environment: 'prod' })
  })
})
