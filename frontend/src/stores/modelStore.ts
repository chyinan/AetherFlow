import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { modelApi, type ModelApiSnapshot } from '@/services/api/modelApi'
import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

interface ModelSnapshotState {
  providers: ModelProvider[]
  models: ModelCatalogItem[]
  policies: ModelRoutingPolicy[]
  logs: ModelRuntimeLog[]
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
        const snapshot = await modelApi.refreshSnapshot()
        this.applySnapshot(snapshot, snapshot.source)
      } finally {
        this.loading = false
      }
    },
    applySnapshot(snapshot: ModelSnapshotState, source: ModelApiSnapshot['source'] = 'mock') {
      this.providers = snapshot.providers
      this.models = snapshot.models
      this.policies = snapshot.policies
      this.logs = snapshot.logs
      this.snapshotSource = source
      if (!this.providers.some((provider) => provider.id === this.selectedProviderId)) {
        this.selectedProviderId = this.providers[0]?.id || 'provider-openai'
      }
    },
    selectProvider(providerId: string) {
      this.selectedProviderId = providerId
    },
    applyMockProbe() {
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
    appendStaleRealSnapshotLog() {
      const now = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      const logEntry: ModelRuntimeLog = {
        id: `model-log-stale-real-${Date.now()}`,
        time: now,
        level: 'warn',
        message: 'AI provider backend refresh unavailable; retained stale real provider snapshot.',
      }
      this.logs = [
        logEntry,
        ...this.logs,
      ].slice(0, 8)
    },
    async refreshMockProbe() {
      this.loading = true
      try {
        const snapshot = await modelApi.refreshSnapshot()
        if (snapshot.source === 'real') {
          this.applySnapshot(snapshot, 'real')
          return
        }

        if (this.providers.length > 0 && this.snapshotSource === 'real') {
          this.appendStaleRealSnapshotLog()
          return
        }

        this.applySnapshot(snapshot, 'mock')
        this.applyMockProbe()
      } finally {
        this.loading = false
      }
    },
  },
})
