<script setup lang="ts">
import { Brain, Cpu, Gauge, Layers3, PanelLeftOpen, RefreshCw, ServerCog, ShieldCheck } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'

import StatusDot from '@/components/ui/StatusDot.vue'
import { useModelStore } from '@/stores/modelStore'

const modelStore = useModelStore()

const summaryCards = computed(() => [
  {
    label: 'Providers online',
    value: modelStore.onlineProviderCount,
    hint: `${modelStore.providers.length} registered`,
    icon: ServerCog,
  },
  {
    label: 'Ready models',
    value: modelStore.readyModelCount,
    hint: `${modelStore.models.length} catalog entries`,
    icon: Layers3,
  },
  {
    label: 'Primary latency',
    value: modelStore.selectedProvider?.latencyMs ? `${modelStore.selectedProvider.latencyMs}ms` : '--',
    hint: 'mock runtime probe',
    icon: Gauge,
  },
  {
    label: 'Quota used',
    value: modelStore.selectedProvider ? `${modelStore.selectedProvider.quotaUsed}/${modelStore.selectedProvider.quotaLimit}` : '--',
    hint: modelStore.selectedProvider?.name ?? 'select provider',
    icon: ShieldCheck,
  },
])

function selectProvider(providerId: string) {
  modelStore.selectProvider(providerId)
}

function providerTone(status: string) {
  if (status === 'online') return 'online'
  if (status === 'degraded') return 'degraded'
  return 'offline'
}

onMounted(() => {
  void modelStore.loadModels()
})
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center justify-between border-b border-app-border bg-white px-5">
      <div class="flex items-center gap-2">
        <Brain class="h-4 w-4 text-ai" />
        <div>
          <p class="text-sm font-semibold text-text-primary">Models</p>
          <p class="text-xs text-text-muted">Provider routing, model catalog, and runtime health are mocked for now.</p>
        </div>
      </div>
      <button class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary transition hover:border-ai/30 hover:text-ai">
        <RefreshCw class="h-4 w-4" />
        Refresh mock
      </button>
    </header>

    <main class="min-h-0 overflow-hidden bg-app-bg p-5">
      <div class="mx-auto grid h-full max-w-7xl grid-rows-[auto_auto_minmax(0,1fr)] gap-4">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="card in summaryCards"
            :key="card.label"
            class="rounded-lg border border-app-border bg-white p-4 shadow-sm"
          >
            <div class="flex items-center gap-2 text-text-muted">
              <component :is="card.icon" class="h-4 w-4" />
              <span class="text-xs font-medium">{{ card.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
            <p class="mt-1 text-xs text-text-muted">{{ card.hint }}</p>
          </article>
        </section>

        <section class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside class="min-h-0 rounded-lg border border-app-border bg-white shadow-sm">
            <div class="border-b border-app-border p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-text-primary">Providers</p>
                  <p class="text-xs text-text-muted">Mock runtime pool</p>
                </div>
                <PanelLeftOpen class="h-4 w-4 text-text-muted" />
              </div>
            </div>

            <div class="space-y-3 p-3">
              <button
                v-for="provider in modelStore.providers"
                :key="provider.id"
                type="button"
                class="w-full rounded-lg border p-3 text-left transition hover:border-ai/25 hover:shadow-sm"
                :class="modelStore.selectedProviderId === provider.id ? 'border-ai/30 bg-ai-soft/40 shadow-sm' : 'border-app-border bg-white'"
                @click="selectProvider(provider.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-text-primary">{{ provider.name }}</p>
                    <p class="mt-1 text-xs text-text-muted">{{ provider.runtime }} · {{ provider.endpoint }}</p>
                  </div>
                  <StatusDot :tone="providerTone(provider.status)" :label="provider.status" />
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
                  <div class="rounded-md bg-app-bg2 p-2">
                    <p class="text-text-muted">Default</p>
                    <p class="mt-1 font-medium text-text-primary">{{ provider.defaultModel }}</p>
                  </div>
                  <div class="rounded-md bg-app-bg2 p-2">
                    <p class="text-text-muted">Latency</p>
                    <p class="mt-1 font-medium text-text-primary">{{ provider.latencyMs }}ms</p>
                  </div>
                </div>
              </button>

              <section class="rounded-lg border border-app-border bg-app-bg2 p-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Routing policy</p>
                <div v-for="policy in modelStore.policies" :key="policy.id" class="mt-3 rounded-md border border-app-border bg-white p-3">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-text-primary">{{ policy.name }}</p>
                    <span class="rounded bg-primary-soft px-2 py-0.5 text-[11px] text-primary">mock</span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-text-secondary">{{ policy.description }}</p>
                  <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">Primary</p>
                      <p class="mt-1 font-medium text-text-primary">{{ policy.primaryModel }}</p>
                    </div>
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">Fallback</p>
                      <p class="mt-1 font-medium text-text-primary">{{ policy.fallbackModels.join(' → ') }}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </aside>

          <section class="grid min-h-0 gap-4 grid-rows-[minmax(0,1fr)_220px]">
            <div class="min-h-0 rounded-lg border border-app-border bg-white shadow-sm">
              <div class="flex items-center justify-between border-b border-app-border px-4 py-3">
                <div>
                  <p class="text-sm font-semibold text-text-primary">{{ modelStore.selectedProvider?.name ?? 'Provider' }}</p>
                  <p class="text-xs text-text-muted">Catalog and capabilities</p>
                </div>
                <span class="rounded-md border border-app-border bg-app-muted px-2 py-1 text-xs text-text-secondary">
                  {{ modelStore.selectedProvider?.defaultModel ?? 'none' }}
                </span>
              </div>

              <div class="min-h-0 overflow-y-auto p-4">
                <div class="grid gap-3 lg:grid-cols-2">
                  <article
                    v-for="model in modelStore.selectedProviderModels"
                    :key="model.id"
                    class="rounded-lg border border-app-border bg-app-bg2 p-4"
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
                        {{ model.status }}
                      </span>
                    </div>
                    <p class="mt-3 text-xs text-text-secondary">Price hint: {{ model.priceHint }}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <span v-for="tag in model.tags" :key="tag" class="rounded bg-white px-2 py-0.5 text-[11px] text-text-secondary">{{ tag }}</span>
                    </div>
                  </article>
                </div>
              </div>
            </div>

            <div class="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section class="rounded-lg border border-app-border bg-sidebar p-4 text-text-inverse shadow-sm">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold">Runtime logs</p>
                    <p class="text-xs text-slate-400">Mock probes and provider health snapshots</p>
                  </div>
                  <Cpu class="h-4 w-4 text-primary" />
                </div>
                <div class="mt-4 space-y-3 font-mono text-xs leading-6">
                  <p v-for="log in modelStore.logs" :key="log.id" class="rounded bg-white/5 px-2 py-1 text-slate-300">
                    <span class="text-slate-500">{{ log.time }}</span>
                    <span class="mx-2 text-primary">{{ log.level }}</span>
                    <span>{{ log.message }}</span>
                  </p>
                </div>
              </section>

              <section class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
                <p class="text-sm font-semibold text-text-primary">Provider snapshot</p>
                <div v-if="modelStore.selectedProvider" class="mt-4 space-y-3">
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <p class="text-xs text-text-muted">Endpoint</p>
                    <p class="mt-1 break-all text-sm text-text-primary">{{ modelStore.selectedProvider.endpoint }}</p>
                  </div>
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <p class="text-xs text-text-muted">Capabilities</p>
                    <p class="mt-2 flex flex-wrap gap-2">
                      <span
                        v-for="capability in modelStore.selectedProvider.capabilities"
                        :key="capability"
                        class="rounded-md border border-app-border bg-white px-2 py-1 text-[11px] text-text-secondary"
                      >
                        {{ capability }}
                      </span>
                    </p>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">Quota</p>
                      <p class="mt-1 font-medium text-text-primary">{{ modelStore.selectedProvider.quotaUsed }} / {{ modelStore.selectedProvider.quotaLimit }}</p>
                    </div>
                    <div class="rounded bg-app-bg2 p-2">
                      <p class="text-text-muted">Checked</p>
                      <p class="mt-1 font-medium text-text-primary">{{ modelStore.selectedProvider.lastCheckedAt }}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </section>
      </div>
    </main>
  </section>
</template>
