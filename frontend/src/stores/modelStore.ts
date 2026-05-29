import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { modelApi } from '@/services/api/modelApi'
import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

export const useModelStore = defineStore('model', {
  state: () => ({
    providers: [] as ModelProvider[],
    models: [] as ModelCatalogItem[],
    policies: [] as ModelRoutingPolicy[],
    logs: [] as ModelRuntimeLog[],
    selectedProviderId: 'provider-openai',
    loading: false,
  }),
  getters: {
    selectedProvider: (state) =>
      state.providers.find((provider) => provider.id === state.selectedProviderId) ?? state.providers[0],
    selectedProviderModels: (state) =>
      state.models.filter((model) => model.providerId === state.selectedProviderId),
    readyModelCount: (state) => state.models.filter((model) => model.status === 'ready').length,
    onlineProviderCount: (state) => state.providers.filter((provider) => provider.status === 'online').length,
  },
  actions: {
    async loadModels() {
      if (this.providers.length > 0) {
        return
      }
      this.loading = true
      try {
        const [providers, models, policies, logs] = await Promise.all([
          modelApi.listProviders(),
          modelApi.listModels(),
          modelApi.listRoutingPolicies(),
          modelApi.listRuntimeLogs(),
        ])
        this.providers = providers
        this.models = models
        this.policies = policies
        this.logs = logs
        this.selectedProviderId = this.selectedProviderId || providers[0]?.id || 'provider-openai'
      } finally {
        this.loading = false
      }
    },
    selectProvider(providerId: string) {
      this.selectedProviderId = providerId
    },
    refreshMockProbe() {
      const now = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      this.providers = this.providers.map((provider, index) => {
        const selected = provider.id === this.selectedProviderId
        const latencyDelta = selected ? -35 + Math.round(Math.random() * 140) : Math.round(Math.random() * 60)
        const quotaDelta = selected ? 1200 + Math.round(Math.random() * 3600) : Math.round(Math.random() * 800)
        return {
          ...provider,
          latencyMs: Math.max(180, provider.latencyMs + latencyDelta),
          quotaUsed: Math.min(provider.quotaLimit, provider.quotaUsed + quotaDelta),
          status: selected && index % 2 === 1 ? 'online' : provider.status,
          lastCheckedAt: now,
        }
      })
      const provider = this.selectedProvider
      const level: ModelRuntimeLog['level'] = provider?.status === 'degraded' ? 'warn' : 'info'
      this.logs = [
        {
          id: `model-log-${Date.now()}`,
          time: now,
          level,
          message: i18n.global.t('models.mockLogs.refreshed', {
            provider: provider?.name ?? i18n.global.t('models.providers'),
            latency: provider?.latencyMs ?? '--',
          }),
        },
        ...this.logs,
      ].slice(0, 8)
    },
  },
})
