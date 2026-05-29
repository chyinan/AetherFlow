import { defineStore } from 'pinia'

import { toApiError } from '@/api/client/apiError'
import { modelApi, type ModelApiSnapshot } from '@/services/api/modelApi'
import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

interface ModelSnapshotState {
  providers: ModelProvider[]
  models: ModelCatalogItem[]
  policies: ModelRoutingPolicy[]
  logs: ModelRuntimeLog[]
}

function errorMessage(error: unknown) {
  const apiError = toApiError(error, 'ai')
  const status = apiError.status ? `HTTP ${apiError.status}: ` : ''
  return `${status}${apiError.message}`
}

function providerTypeOf(provider: ModelProvider) {
  return (provider.providerType || provider.id.replace(/^provider-/, '').replace(/-/g, '_')).toUpperCase()
}

export const useModelStore = defineStore('model', {
  state: () => ({
    providers: [] as ModelProvider[],
    models: [] as ModelCatalogItem[],
    policies: [] as ModelRoutingPolicy[],
    logs: [] as ModelRuntimeLog[],
    selectedProviderId: 'provider-openai',
    snapshotSource: 'mock' as ModelApiSnapshot['source'],
    loading: false,
    error: null as string | null,
    operationError: null as string | null,
    switchingProviderId: null as string | null,
    recoveringProviderId: null as string | null,
  }),
  getters: {
    selectedProvider: (state) =>
      state.providers.find((provider) => provider.id === state.selectedProviderId) ?? state.providers[0],
    selectedProviderModels: (state) =>
      state.models.filter((model) => model.providerId === state.selectedProviderId),
    activePolicy: (state) => state.policies[0],
    readyModelCount: (state) => state.models.filter((model) => model.status === 'ready').length,
    onlineProviderCount: (state) => state.providers.filter((provider) => provider.status === 'online').length,
  },
  actions: {
    async loadModels() {
      if (this.providers.length > 0) {
        return
      }
      await this.refreshStatus()
    },
    applySnapshot(snapshot: ModelSnapshotState, source: ModelApiSnapshot['source'] = 'mock') {
      this.providers = snapshot.providers
      this.models = snapshot.models
      this.policies = snapshot.policies
      this.logs = snapshot.logs
      this.snapshotSource = source
      this.error = null
      this.operationError = null

      if (!this.providers.some((provider) => provider.id === this.selectedProviderId)) {
        this.selectedProviderId = this.providers.find((provider) => provider.active)?.id || this.providers[0]?.id || 'provider-openai'
      }
    },
    selectProvider(providerId: string) {
      this.selectedProviderId = providerId
    },
    appendOperationLog(message: string, level: ModelRuntimeLog['level'] = 'warn') {
      const now = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      this.logs = [
        {
          id: `model-ui-log-${Date.now()}`,
          time: now,
          level,
          message,
        },
        ...this.logs,
      ].slice(0, 30)
    },
    async refreshStatus() {
      this.loading = true
      this.error = null
      try {
        const snapshot = await modelApi.refreshSnapshot()
        this.applySnapshot(snapshot, snapshot.source)
      } catch (error) {
        const message = errorMessage(error)
        this.error = message
        if (this.providers.length > 0) {
          this.appendOperationLog(`AI provider backend refresh failed; retained current snapshot. ${message}`, 'error')
        }
      } finally {
        this.loading = false
      }
    },
    async switchSelectedProviderToPrimary() {
      const provider = this.selectedProvider
      if (!provider) {
        return
      }

      this.switchingProviderId = provider.id
      this.operationError = null

      try {
        const providerType = providerTypeOf(provider)
        const snapshot = await modelApi.switchPrimaryProvider(providerType)
        this.applySnapshot(snapshot, snapshot.source)
        this.selectedProviderId = snapshot.providers.find((entry) => providerTypeOf(entry) === providerType)?.id ?? provider.id
      } catch (error) {
        const message = errorMessage(error)
        this.operationError = message
        this.appendOperationLog(`Provider switch failed for ${providerTypeOf(provider)}. ${message}`, 'error')
      } finally {
        this.switchingProviderId = null
      }
    },
    async recoverSelectedProvider() {
      const provider = this.selectedProvider
      if (!provider) {
        return
      }

      this.recoveringProviderId = provider.id
      this.operationError = null

      try {
        const providerType = providerTypeOf(provider)
        const snapshot = await modelApi.recoverProvider(providerType)
        this.applySnapshot(snapshot, snapshot.source)
        this.selectedProviderId = snapshot.providers.find((entry) => providerTypeOf(entry) === providerType)?.id ?? provider.id
      } catch (error) {
        const message = errorMessage(error)
        this.operationError = message
        this.appendOperationLog(`Provider recovery failed for ${providerTypeOf(provider)}. ${message}`, 'error')
      } finally {
        this.recoveringProviderId = null
      }
    },
  },
})
