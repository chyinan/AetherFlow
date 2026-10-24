<script setup lang="ts">
// pattern: Imperative Shell
import {
  AlertTriangle,
  Brain,
  Cpu,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Shuffle,
} from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ServiceCatalog from './ServiceCatalog.vue'
import { modelRoleMessages } from './modelRoleMessages'
import { useI18n } from 'vue-i18n'

import StatusDot from '@/components/ui/StatusDot.vue'
import { useModelStore } from '@/stores/modelStore'
import { useAuthStore } from '@/stores/authStore'

const modelStore = useModelStore()
const authStore = useAuthStore()
const { t } = useI18n()
const { t: roleText } = useI18n({ useScope: 'local', messages: modelRoleMessages })
const managementBusy = computed(() => Boolean(modelStore.loading || modelStore.switchingProviderId || modelStore.recoveringProviderId))

const managementWriteDisabled = computed(() => managementBusy.value || Boolean(modelStore.operationRefreshWarning))
const selectedProvider = computed(() => modelStore.selectedProvider)
const canManageProviders = computed(() => authStore.isAdmin)

const hasSummarySnapshot = computed(() => modelStore.providers.length > 0 || modelStore.models.length > 0 || (!modelStore.loading && !modelStore.error))
const overallMetrics = computed(() => [
  {
    label: t('models.providersOnline'),
    value: modelStore.onlineProviderCount,
  },
  {
    label: t('models.readyModels'),
    value: modelStore.readyModelCount,
  },
])

function selectProvider(providerId: string) {
  modelStore.selectProvider(providerId)
}

function providerTone(status: string) {
  if (status === 'online') return 'online'
  if (status === 'degraded') return 'degraded'
  if (status === 'unknown') return 'paused'
  return 'offline'
}

function quotaPercent(quotaUsed: number, quotaLimit: number) {
  return Math.min(100, Math.round((quotaUsed / Math.max(quotaLimit, 1)) * 100))
}

function providerTypeOf(provider: { providerType?: string; id: string }) {
  return (provider.providerType || provider.id.replace(/^provider-/, '').replace(/-/g, '_')).toUpperCase()
}

function isLocalProvider(provider: { providerType?: string; id: string; runtime?: string }) {
  const providerType = providerTypeOf(provider)
  return providerType === 'OLLAMA' || providerType === 'LOCAL_MODEL' || String(provider.runtime ?? '').toLowerCase().includes('local')
}

function hasProviderQuota(provider: { providerType?: string; id: string; runtime?: string; quotaLimit?: number } | undefined) {
  return Boolean(provider && !isLocalProvider(provider) && typeof provider.quotaLimit === 'number' && provider.quotaLimit > 0)
}

function quotaStatusText(provider: { providerType?: string; id: string; runtime?: string }) {
  return isLocalProvider(provider) ? t('models.quotaNotApplicable') : t('models.quotaUnavailable')
}

function refreshStatus() {
  if (!canManageProviders.value || managementBusy.value) return
  void modelStore.refreshStatus({ management: true })
}

function switchPrimary() {
  if (!canManageProviders.value || managementWriteDisabled.value) return
  void modelStore.switchSelectedProviderToPrimary()
}

function recoverProvider() {
  if (!canManageProviders.value || managementWriteDisabled.value) return
  void modelStore.recoverSelectedProvider()
}

watch(() => [authStore.token, authStore.user?.id, authStore.user?.userId, canManageProviders.value], () => {
  modelStore.clearSnapshot()
  if (canManageProviders.value) void modelStore.loadModels({ management: true })
}, { immediate: true })
</script>

<template>
  <ServiceCatalog v-if="!canManageProviders" />
  <section v-else data-testid="model-management" class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center justify-between border-b border-app-border bg-white px-5">
      <div class="flex items-center gap-2">
        <Brain class="h-4 w-4 text-ai" />
        <div>
          <p class="text-sm font-semibold text-text-primary">{{ t('models.title') }}</p>
          <p class="text-xs text-text-muted">{{ t('models.subtitle') }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <RouterLink :to="{ path: '/settings', query: { tab: 'provider', from: '/models' } }" class="rounded-md border border-app-border px-3 py-2 text-sm text-primary">{{ roleText('configuration') }}</RouterLink>
        <button
          class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary transition hover:border-ai/30 hover:text-ai disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="managementBusy"
          @click="refreshStatus"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': modelStore.loading }" />
          {{ modelStore.loading ? t('models.loading') : t('models.refreshStatus') }}
        </button>
      </div>
    </header>

    <main class="min-h-0 overflow-y-auto bg-app-bg px-4 py-5 sm:px-5 lg:px-6">
      <div class="flex min-h-full w-full flex-col gap-4">
        <p v-if="modelStore.loading" role="status" class="rounded-lg border border-app-border bg-white p-4 text-sm text-text-muted">{{ roleText('adminLoading') }}</p>
        <p v-else-if="managementBusy" role="status" class="rounded-lg border border-app-border bg-white p-4 text-sm text-text-muted">{{ roleText('busy') }}</p>
        <p v-if="!modelStore.loading && !modelStore.error && !modelStore.providers.length" data-testid="management-empty" class="rounded-lg border border-dashed border-app-border bg-white p-4 text-sm text-text-muted">{{ roleText('adminEmpty') }}</p>
        <p v-if="modelStore.error && modelStore.providers.length" role="status" class="text-sm text-status-warning">{{ roleText('backendFailure') }}</p>
        <p v-if="modelStore.snapshotSource === 'mock' && modelStore.providers.length" role="status" data-testid="model-demo-warning" class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{{ roleText('demo') }}</p>
        <section data-testid="models-overview" aria-labelledby="models-overview-title" class="rounded-lg border border-app-border bg-white px-4 py-3">
          <h2 id="models-overview-title" class="text-sm font-semibold text-text-primary">{{ roleText('overallSummary') }}</h2>
          <template v-if="hasSummarySnapshot">
            <dl class="mt-3 grid gap-3 sm:grid-cols-2">
              <div v-for="metric in overallMetrics" :key="metric.label" class="flex items-baseline justify-between gap-3 rounded-md bg-app-bg2 px-3 py-2">
                <dt class="text-xs text-text-muted">{{ metric.label }}</dt>
                <dd class="text-lg font-semibold text-text-primary">{{ metric.value }}</dd>
              </div>
            </dl>
            <p class="mt-2 text-xs text-text-muted">{{ modelStore.providers.length }} {{ t('models.registered') }} · {{ modelStore.models.length }} {{ t('models.catalogEntries') }}</p>
          </template>
          <p v-else class="mt-2 text-sm text-text-muted">{{ modelStore.loading ? roleText('overallLoading') : roleText('overallUnconfirmed') }}</p>
        </section>

        <section v-if="modelStore.operationRefreshWarning || modelStore.error || modelStore.operationError" role="alert" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-start gap-2">
              <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
              <div class="min-w-0">
                <p class="font-semibold">
                  {{ modelStore.operationRefreshWarning ? roleText('confirmedRefreshTitle') : modelStore.error ? t('models.loadErrorTitle') : t('models.operationErrorTitle') }}
                </p>
                <p v-if="modelStore.operationRefreshWarning" class="mt-1 break-words text-xs">{{ roleText('confirmedRefreshHint', { provider: modelStore.operationRefreshWarning.providerName, operation: roleText(modelStore.operationRefreshWarning.kind === 'switch' ? 'switchOperation' : 'recoverOperation') }) }}</p>
                <p class="mt-1 break-words text-xs">{{ modelStore.error || modelStore.operationRefreshWarning?.error || modelStore.operationError }}</p>
              </div>
            </div>
            <button
              class="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="managementBusy"
              @click="refreshStatus"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': modelStore.loading }" />
              {{ t('models.retry') }}
            </button>
          </div>
        </section>

        <section class="grid min-h-0 flex-1 gap-4 overflow-visible xl:overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-app-border bg-white shadow-sm">
            <div class="border-b border-app-border p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-text-primary">{{ t('models.providers') }}</p>
                  <p class="text-xs text-text-muted">{{ t('models.providerPool') }}</p>
                </div>
                <PanelLeftOpen class="h-4 w-4 text-text-muted" />
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <p v-if="modelStore.providers.length === 0 && !modelStore.loading" class="rounded-md border border-dashed border-app-border p-4 text-sm text-text-muted">
                {{ t('models.noProviders') }}
              </p>

              <button
                v-for="provider in modelStore.providers"
                :key="provider.id"
                type="button"
                :data-provider-id="provider.id"
                :aria-pressed="selectedProvider?.id === provider.id"
                aria-controls="selected-provider-details"
                class="w-full rounded-lg border p-3 text-left transition hover:border-primary/30 hover:shadow-sm"
                :class="selectedProvider?.id === provider.id ? 'border-primary/50 bg-primary-soft/40 ring-1 ring-primary/20 shadow-sm' : 'border-app-border bg-white'"
                @click="selectProvider(provider.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-semibold text-text-primary">{{ provider.name }}</p>
                      <span v-if="provider.active" class="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
                        {{ t('models.activeRoute') }}
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-text-muted">{{ provider.runtime }} · {{ provider.endpoint }}</p>
                  </div>
                  <StatusDot :tone="providerTone(provider.status)" :label="provider.status === 'unknown' ? roleText('unknown') : provider.status" />
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
                  <div class="rounded-md bg-app-bg2 p-2">
                    <p class="text-text-muted">{{ t('models.defaultLabel') }}</p>
                    <p class="mt-1 font-medium text-text-primary">{{ provider.defaultModel || t('common.none') }}</p>
                  </div>
                  <div class="rounded-md bg-app-bg2 p-2">
                    <p class="text-text-muted">{{ t('models.latencyLabel') }}</p>
                    <p class="mt-1 font-medium text-text-primary">{{ provider.latencyMs > 0 ? `${provider.latencyMs}ms` : '--' }}</p>
                  </div>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div class="rounded bg-app-bg2 p-2">
                    <p class="text-text-muted">{{ t('models.health') }}</p>
                    <p class="mt-1 font-medium text-text-primary">{{ provider.healthStatus || '--' }}</p>
                  </div>
                  <div class="rounded bg-app-bg2 p-2">
                    <p class="text-text-muted">{{ t('models.circuit') }}</p>
                    <p class="mt-1 font-medium text-text-primary">{{ provider.circuitState || '--' }}</p>
                  </div>
                </div>
                <div v-if="hasProviderQuota(provider)" class="mt-3">
                  <div class="mb-1 flex items-center justify-between text-[11px] text-text-muted">
                    <span>{{ t('models.quotaUsage') }}</span>
                    <span>{{ quotaPercent(provider.quotaUsed, provider.quotaLimit ?? 0) }}%</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-app-muted">
                    <div class="h-1.5 rounded-full bg-ai" :style="{ width: `${quotaPercent(provider.quotaUsed, provider.quotaLimit ?? 0)}%` }" />
                  </div>
                </div>
                <p v-else class="mt-3 rounded bg-app-bg2 px-2 py-1.5 text-[11px] text-text-muted">
                  {{ quotaStatusText(provider) }}
                </p>
              </button>

              <section class="rounded-lg border border-app-border bg-app-bg2 p-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{{ t('models.routingPolicy') }}</p>
                </div>
                <div v-for="policy in modelStore.policies" :key="policy.id" class="mt-3 rounded-md border border-app-border bg-white p-3">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-text-primary">{{ policy.name }}</p>
                    <span
                      class="rounded px-2 py-0.5 text-[11px] font-medium"
                      :class="(policy.failoverEnabled ?? true) ? 'bg-green-50 text-status-success' : 'bg-slate-100 text-text-secondary'"
                    >
                      {{ (policy.failoverEnabled ?? true) ? t('models.failoverEnabled') : t('models.failoverDisabled') }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-text-secondary">{{ policy.description }}</p>
                  <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">{{ t('models.primary') }}</p>
                    <p class="mt-1 font-medium text-text-primary">{{ policy.primaryModel || t('common.none') }}</p>
                    </div>
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">{{ t('models.fallback') }}</p>
                      <p class="mt-1 font-medium text-text-primary">{{ policy.fallbackModels.join(' -> ') || '--' }}</p>
                    </div>
                  </div>
                  <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">{{ t('models.timeout') }}</p>
                      <p class="mt-1 font-medium text-text-primary">{{ policy.timeoutMs }}ms</p>
                    </div>
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">{{ t('models.retries') }}</p>
                      <p class="mt-1 font-medium text-text-primary">{{ policy.retryCount }}</p>
                    </div>
                  </div>
                  <div class="mt-2 rounded bg-app-bg2 p-2 text-xs">
                    <p class="text-text-muted">{{ t('models.providerOrder') }}</p>
                      <p class="mt-1 font-medium text-text-primary">{{ policy.providerOrder?.join(' -> ') || '--' }}</p>
                  </div>
                  <p class="mt-2 text-xs text-text-muted">
                    {{ (policy.autoRecoverPrimary ?? true) ? t('models.autoRecover') : t('models.manualRecover') }}
                  </p>
                </div>
              </section>
            </div>
          </aside>

          <section class="flex min-h-0 flex-col gap-4 overflow-visible xl:overflow-hidden">
            <section id="selected-provider-details" aria-labelledby="selected-provider-title" class="shrink-0 overflow-hidden rounded-lg border border-app-border bg-white shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3">
                <div class="min-w-0">
                  <h2 id="selected-provider-title" class="break-words text-sm font-semibold text-text-primary">{{ selectedProvider ? roleText('selectedProviderDetails', { provider: selectedProvider.name }) : t('models.selectProvider') }}</h2>
                  <p class="text-xs text-text-muted">{{ t('models.catalogAndCapabilities') }}</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <button v-if="canManageProviders"
                    class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-ai/30 hover:text-ai disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="!selectedProvider || selectedProvider.active || managementWriteDisabled || modelStore.snapshotSource !== 'real'"
                    @click="switchPrimary"
                  >
                    <Shuffle class="h-3.5 w-3.5" />
                    {{ modelStore.switchingProviderId === selectedProvider?.id ? t('models.switching') : t('models.setPrimary') }}
                  </button>
                  <button v-if="canManageProviders"
                    class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-ai/30 hover:text-ai disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="!selectedProvider || managementWriteDisabled || modelStore.snapshotSource !== 'real'"
                    @click="recoverProvider"
                  >
                    <RotateCcw class="h-3.5 w-3.5" :class="{ 'animate-spin': modelStore.recoveringProviderId === selectedProvider?.id }" />
                    {{ modelStore.recoveringProviderId === selectedProvider?.id ? t('models.recovering') : t('models.recoverProvider') }}
                  </button>
                  <span v-if="selectedProvider?.defaultModel" class="rounded-md border border-app-border bg-app-muted px-2 py-1 text-xs text-text-secondary">
                    {{ selectedProvider.defaultModel }}
                  </span>
                </div>
              </div>

              <div class="p-4">
                <dl v-if="selectedProvider" class="mb-4 grid gap-3 sm:grid-cols-2">
                  <div data-testid="selected-provider-latency" class="rounded-md bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('models.latencyLabel') }}</dt>
                    <dd class="mt-1 text-sm font-semibold text-text-primary">
                      {{ selectedProvider.latencyMs > 0 ? `${selectedProvider.latencyMs}ms` : '--' }}
                      <span class="mt-1 block text-xs font-normal text-text-muted">{{ t('models.backendRuntimeProbe') }}</span>
                    </dd>
                  </div>
                  <div data-testid="selected-provider-quota" class="rounded-md bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('models.quota') }}</dt>
                    <dd v-if="hasProviderQuota(selectedProvider)" class="mt-1 text-sm font-semibold text-text-primary">
                      {{ selectedProvider.quotaUsed }} / {{ selectedProvider.quotaLimit }}
                      <div class="mt-2 h-1.5 rounded-full bg-white">
                        <div class="h-1.5 rounded-full bg-ai" :style="{ width: `${quotaPercent(selectedProvider.quotaUsed, selectedProvider.quotaLimit ?? 0)}%` }" />
                      </div>
                    </dd>
                    <dd v-else class="mt-1 text-sm text-text-secondary">{{ quotaStatusText(selectedProvider) }}</dd>
                  </div>
                </dl>
                <p v-if="modelStore.selectedProviderModels.length === 0" class="rounded-md border border-dashed border-app-border p-4 text-sm text-text-muted">
                  {{ t('models.noModels') }}
                </p>
                <div v-else class="grid gap-3 lg:grid-cols-2">
                  <article
                    v-for="model in modelStore.selectedProviderModels"
                    :key="model.id"
                    class="min-w-0 rounded-lg border border-app-border bg-app-bg2 p-4"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-text-primary">{{ model.name }}</p>
                        <p class="mt-1 text-xs text-text-muted">{{ model.kind }} · {{ model.contextWindow }}</p>
                      </div>
                      <span
                        class="rounded-md px-2 py-0.5 text-[11px] font-medium"
                        :class="
                          model.status === 'ready'
                            ? 'bg-green-50 text-status-success'
                            : model.status === 'warming'
                              ? 'bg-amber-50 text-status-warning'
                              : 'bg-slate-100 text-text-secondary'
                        "
                      >
                        {{ model.status === 'unknown' ? roleText('unknown') : t(`status.${model.status}`) }}
                      </span>
                    </div>
                    <p class="mt-3 text-xs text-text-secondary">{{ t('models.priceHint') }}: {{ model.priceHint }}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <span v-for="tag in model.tags" :key="tag" class="rounded bg-white px-2 py-0.5 text-[11px] text-text-secondary">{{ tag }}</span>
                    </div>
                  </article>
                </div>
              </div>
            </section>

            <div class="grid min-h-0 flex-1 gap-4 overflow-visible xl:overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
              <section class="flex min-h-0 flex-col rounded-lg border border-app-border bg-white p-4 shadow-sm">
                <div class="flex shrink-0 items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">{{ t('models.runtimeLogs') }}</p>
                    <p class="text-xs text-text-muted">{{ t('models.runtimeLogsHint') }}</p>
                  </div>
                  <span class="grid h-8 w-8 place-items-center rounded-md bg-primary-soft text-primary">
                    <Cpu class="h-4 w-4" />
                  </span>
                </div>
                <div class="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 font-mono text-xs leading-6">
                  <p v-if="modelStore.logs.length === 0" class="rounded-md border border-dashed border-app-border bg-app-bg2 px-3 py-3 font-sans text-sm text-text-muted">
                    {{ t('models.noLogs') }}
                  </p>
                  <p v-for="log in modelStore.logs" :key="log.id" class="rounded-md border border-transparent bg-app-bg2 px-3 py-2 text-text-secondary transition hover:border-primary/20 hover:bg-primary-soft/30">
                    <span class="text-text-muted">{{ log.time }}</span>
                    <span class="mx-2 font-semibold uppercase text-primary">{{ log.level }}</span>
                    <span class="text-text-primary">{{ log.message }}</span>
                  </p>
                </div>
              </section>

              <section data-testid="selected-provider-snapshot" aria-labelledby="selected-provider-snapshot-title" class="flex min-h-0 flex-col rounded-lg border border-app-border bg-white p-4 shadow-sm">
                <h3 id="selected-provider-snapshot-title" class="shrink-0 break-words text-sm font-semibold text-text-primary">{{ selectedProvider ? roleText('selectedProviderSnapshot', { provider: selectedProvider.name }) : t('models.providerSnapshot') }}</h3>
                <div v-if="selectedProvider" class="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <p class="text-xs text-text-muted">{{ t('models.endpoint') }}</p>
                    <p class="mt-1 break-all text-sm text-text-primary">{{ selectedProvider.endpoint }}</p>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">{{ t('models.health') }}</p>
                      <p class="mt-1 font-medium text-text-primary">{{ selectedProvider.healthStatus || '--' }}</p>
                    </div>
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">{{ t('models.circuit') }}</p>
                      <p class="mt-1 font-medium text-text-primary">{{ selectedProvider.circuitState || '--' }}</p>
                    </div>
                  </div>
                  <div class="rounded bg-app-bg2 p-2 text-xs">
                    <p class="text-text-muted">{{ t('models.healthSource') }}</p>
                    <p class="mt-1 break-words font-medium text-text-primary">{{ selectedProvider.healthObservationSource || '--' }}</p>
                  </div>
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <p class="text-xs text-text-muted">{{ t('models.capabilities') }}</p>
                    <p class="mt-2 flex flex-wrap gap-2">
                      <span
                        v-for="capability in selectedProvider.capabilities"
                        :key="capability"
                        class="rounded-md border border-app-border bg-white px-2 py-1 text-[11px] text-text-secondary"
                      >
                        {{ capability }}
                      </span>
                    </p>
                  </div>
                  <div class="text-xs">
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">{{ t('models.checked') }}</p>
                      <p class="mt-1 font-medium text-text-primary">{{ selectedProvider.lastCheckedAt }}</p>
                    </div>
                  </div>
                  <p class="rounded-lg bg-app-bg2 p-3 text-xs leading-5 text-text-secondary">{{ selectedProvider.statusMessage || selectedProvider.status }}</p>
                </div>
              </section>
            </div>
          </section>
        </section>
      </div>
    </main>
  </section>
</template>
