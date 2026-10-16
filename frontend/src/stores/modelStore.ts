import { defineStore } from 'pinia'

import { toApiError } from '@/api/client/apiError'
import { modelApi, type ModelApiSnapshot, type ModelSnapshotOptions } from '@/services/api/modelApi'
import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'
import { useAuthStore } from '@/stores/authStore'
import { formatTime } from '@/utils/localeFormat'
import { ModelManagementRefreshError } from '@/utils/modelManagementRefreshError'

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

function currentIdentity() {
  const auth = useAuthStore()
  return JSON.stringify([auth.token, auth.user?.id, auth.user?.userId, auth.isAdmin])
}

// pattern: Imperative Shell
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
    operationRefreshWarning: null as { kind: 'switch' | 'recover'; providerName: string; error: string } | null,
    switchingProviderId: null as string | null,
    recoveringProviderId: null as string | null,
    refreshRequestId: 0,
    operationRequestId: 0,
    snapshotIdentity: '',
    snapshotManagement: false,
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
    async loadModels(options: ModelSnapshotOptions = {}) {
      const management = Boolean(options.management && useAuthStore().isAdmin)
      if (this.providers.length > 0 && this.snapshotIdentity === currentIdentity() && this.snapshotManagement === management) return
      await this.refreshStatus({ management })
    },
    clearSnapshot() {
      this.refreshRequestId += 1
      this.operationRequestId += 1
      this.providers = []; this.models = []; this.policies = []; this.logs = []
      this.snapshotIdentity = ''; this.snapshotManagement = false
      this.loading = false; this.switchingProviderId = null; this.recoveringProviderId = null
      this.error = null; this.operationError = null; this.operationRefreshWarning = null
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
      const now = formatTime(new Date())
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
    async refreshStatus(options: ModelSnapshotOptions = {}) {
      const identity = currentIdentity()
      const management = Boolean(options.management && useAuthStore().isAdmin)
      if (this.snapshotIdentity !== identity || this.snapshotManagement !== management) this.clearSnapshot()
      const requestId = ++this.refreshRequestId
      const isCurrent = () => this.refreshRequestId === requestId && currentIdentity() === identity
      this.loading = true
      this.error = null
      try {
        const snapshot = await modelApi.refreshSnapshot({ management })
        if (isCurrent()) {
          this.applySnapshot(snapshot, snapshot.source)
          this.snapshotIdentity = identity
          this.snapshotManagement = management
          // 只有当前真实管理快照能确认管理操作之后的状态，普通目录或演示数据不能。
          if (management && snapshot.source === 'real') this.operationRefreshWarning = null
        }
      } catch (error) {
        if (!isCurrent()) return
        this.error = errorMessage(error)
        if (management && this.providers.length > 0) this.appendOperationLog(`AI provider backend refresh failed; retained current snapshot. ${this.error}`, 'error')
      } finally {
        if (this.refreshRequestId === requestId) this.loading = false
      }
    },
    async switchSelectedProviderToPrimary() {
      const provider = this.selectedProvider
      if (!useAuthStore().isAdmin || this.snapshotSource !== 'real' || !provider || this.loading || this.switchingProviderId || this.recoveringProviderId || this.operationRefreshWarning) {
        return
      }

      if (provider.active) return
      const identity = currentIdentity()
      const requestId = ++this.operationRequestId
      const isCurrent = () => this.operationRequestId === requestId && currentIdentity() === identity && useAuthStore().isAdmin
      this.switchingProviderId = provider.id
      this.operationError = null

      try {
        const providerType = providerTypeOf(provider)
        const snapshot = await modelApi.switchPrimaryProvider(providerType, isCurrent)
        if (!isCurrent()) return
        this.applySnapshot(snapshot, snapshot.source)
        this.snapshotIdentity = identity
        this.snapshotManagement = true
      } catch (error) {
        if (!isCurrent()) return
        if (error instanceof ModelManagementRefreshError) {
          const message = errorMessage(error.refreshError)
          this.error = null
          this.operationRefreshWarning = { kind: 'switch', providerName: provider.name, error: message }
          this.appendOperationLog(`Provider switch confirmed for ${providerTypeOf(provider)}; snapshot refresh failed. ${message}`, 'warn')
          return
        }
        const message = errorMessage(error)
        this.operationError = message
        this.appendOperationLog(`Provider switch failed for ${providerTypeOf(provider)}. ${message}`, 'error')
      } finally {
        if (this.operationRequestId === requestId) this.switchingProviderId = null
      }
    },
    async recoverSelectedProvider() {
      const provider = this.selectedProvider
      if (!useAuthStore().isAdmin || this.snapshotSource !== 'real' || !provider || this.loading || this.switchingProviderId || this.recoveringProviderId || this.operationRefreshWarning) {
        return
      }

      const identity = currentIdentity()
      const requestId = ++this.operationRequestId
      const isCurrent = () => this.operationRequestId === requestId && currentIdentity() === identity && useAuthStore().isAdmin
      this.recoveringProviderId = provider.id
      this.operationError = null

      try {
        const providerType = providerTypeOf(provider)
        const snapshot = await modelApi.recoverProvider(providerType, isCurrent)
        if (!isCurrent()) return
        this.applySnapshot(snapshot, snapshot.source)
        this.snapshotIdentity = identity
        this.snapshotManagement = true
      } catch (error) {
        if (!isCurrent()) return
        if (error instanceof ModelManagementRefreshError) {
          const message = errorMessage(error.refreshError)
          this.error = null
          this.operationRefreshWarning = { kind: 'recover', providerName: provider.name, error: message }
          this.appendOperationLog(`Provider recovery confirmed for ${providerTypeOf(provider)}; snapshot refresh failed. ${message}`, 'warn')
          return
        }
        const message = errorMessage(error)
        this.operationError = message
        this.appendOperationLog(`Provider recovery failed for ${providerTypeOf(provider)}. ${message}`, 'error')
      } finally {
        if (this.operationRequestId === requestId) this.recoveringProviderId = null
      }
    },
  },
})
