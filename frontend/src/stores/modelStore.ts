import { defineStore } from 'pinia'

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
  },
})
