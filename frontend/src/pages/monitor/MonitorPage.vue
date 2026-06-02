<script setup lang="ts">
import { BarChart3, ShieldAlert, Timer, TrendingUp } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useDifyStore } from '@/stores/difyStore'
import type { ConversationLog } from '@/types/dify'

const difyStore = useDifyStore()
const { t } = useI18n()
const selectedConversationId = ref('')

function metricValue(metricId: string, fallback = '--') {
  return difyStore.metrics.find((metric) => metric.id === metricId)?.value ?? fallback
}

const summaryCards = computed(() => [
  { label: t('monitor.requests'), value: metricValue('provider-calls'), hint: t('monitor.hints.requests'), icon: BarChart3 },
  { label: t('monitor.latency'), value: metricValue('provider-latency'), hint: t('monitor.hints.latency'), icon: Timer },
  { label: t('monitor.cost'), value: metricValue('provider-cost', '$0'), hint: t('monitor.hints.cost'), icon: TrendingUp },
  { label: t('monitor.errors'), value: metricValue('provider-error-rate', '0%'), hint: t('monitor.hints.errors'), icon: ShieldAlert },
])

const selectedConversation = computed(() =>
  difyStore.conversations.find((conversation) => conversation.id === selectedConversationId.value) ?? difyStore.conversations[0],
)

const monitorEventRows = computed(() =>
  difyStore.conversations.map((log) => ({
    ...log,
    timeParts: formatMonitorTime(log.time),
    feedbackLabel: feedbackText(log.feedback),
    statusBadge: eventStatusBadge(log.status),
  })),
)

function feedbackText(value: string) {
  if (value === 'like') return t('monitor.feedback.like')
  if (value === 'dislike') return t('monitor.feedback.dislike')
  return t('monitor.feedback.none')
}

function selectConversation(conversationId: string) {
  selectedConversationId.value = conversationId
}

function actorText(value: string) {
  if (value === 'backend' || value === 'system-service') {
    return t('monitor.systemService')
  }
  return value
}

function selectedTraceSummary(conversation: ConversationLog) {
  const status = conversation.status === 'failed' ? t('monitor.failedCases') : t('monitor.successful')
  return `${conversation.app} · ${status}`
}

function formatMonitorTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return { date: '', time: value }
  }

  return {
    date: date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    time: date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  }
}

function eventSeverityClass(status: ConversationLog['status']) {
  if (status === 'failed') {
    return 'ring-1 ring-status-error/15'
  }
  if (status === 'running') {
    return 'ring-1 ring-status-running/15'
  }
  return ''
}

function eventStatusBadge(status: ConversationLog['status']): 'success' | 'running' | 'failed' {
  if (status === 'success') return 'success'
  if (status === 'running') return 'running'
  return 'failed'
}

function eventDotClass(status: ConversationLog['status']) {
  if (status === 'failed') {
    return 'bg-status-error ring-status-error/15'
  }
  if (status === 'running') {
    return 'bg-status-running ring-status-running/15'
  }
  return 'bg-status-success ring-status-success/15'
}

function latencyClass(latencyMs: number, status: ConversationLog['status']) {
  if (status === 'success') {
    return 'text-text-primary'
  }
  if (status === 'failed') {
    return 'text-status-error'
  }
  if (status === 'running' && latencyMs >= 3000) {
    return 'text-status-warning'
  }
  return 'text-text-primary'
}

onMounted(async () => {
  await difyStore.loadSurface()
  selectedConversationId.value = difyStore.reviewQueue[0]?.id ?? difyStore.conversations[0]?.id ?? ''
})
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center border-b border-app-border bg-white px-5">
      <div class="flex items-center gap-2">
        <BarChart3 class="h-4 w-4 text-primary" />
        <div>
          <p class="text-sm font-semibold text-text-primary">{{ t('monitor.title') }}</p>
          <p class="text-xs text-text-muted">{{ t('monitor.subtitle') }}</p>
        </div>
      </div>
    </header>

    <main class="min-h-0 overflow-hidden bg-app-bg px-4 py-5 sm:px-5 lg:px-6">
      <div class="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] gap-4">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article v-for="card in summaryCards" :key="card.label" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <component :is="card.icon" class="h-4 w-4" />
              <span class="text-xs font-medium">{{ card.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
            <p class="mt-1 text-xs text-text-muted">{{ card.hint }}</p>
          </article>
        </section>

        <section class="grid min-h-0 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px]">
          <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-app-border bg-white shadow-sm">
            <div class="flex items-center justify-between border-b border-app-border px-4 py-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('monitor.logsTitle') }}</p>
                <p class="text-xs text-text-muted">{{ t('monitor.logsHint') }}</p>
              </div>
              <div class="flex flex-wrap justify-end gap-2">
                <span class="rounded-md border border-app-border bg-app-muted px-2 py-1 text-xs text-text-secondary">
                  {{ difyStore.successfulConversationCount }} {{ t('monitor.successful') }}
                </span>
                <span v-if="difyStore.failedConversationCount > 0" class="rounded-md border border-status-error/20 bg-red-50 px-2 py-1 text-xs text-status-error">
                  {{ difyStore.failedConversationCount }} {{ t('monitor.failedCases') }}
                </span>
              </div>
            </div>

            <div class="monitor-event-stream min-h-0 flex-1 overflow-y-auto overscroll-contain bg-app-bg p-3">
              <div class="mb-3 flex items-center justify-between gap-3 rounded-xl border border-app-border bg-app-bg2 px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full bg-status-success shadow-[0_0_0_4px_rgba(34,197,94,0.12)]" />
                  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{{ t('monitor.eventStream') }}</span>
                </div>
                <span class="text-xs text-text-muted">{{ t('monitor.eventCount', { count: monitorEventRows.length }) }}</span>
              </div>

              <div class="space-y-3">
              <button
                v-for="log in monitorEventRows"
                :key="log.id"
                type="button"
                class="group w-full rounded-xl border p-3 text-left transition duration-200 hover:border-primary/30"
                :class="[selectedConversation?.id === log.id ? 'border-primary/50 bg-primary-soft/40 ring-1 ring-primary/20' : 'border-app-border bg-white', eventSeverityClass(log.status)]"
                @click="selectConversation(log.id)"
              >
                <div class="grid min-w-0 gap-3 lg:grid-cols-[112px_minmax(0,1fr)_104px] lg:items-center">
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4" :class="eventDotClass(log.status)" />
                    <span class="flex min-w-0 flex-col gap-1 font-mono text-xs leading-4 text-text-muted">
                      <span v-if="log.timeParts.date" class="whitespace-nowrap">{{ log.timeParts.date }}</span>
                      <span class="whitespace-nowrap text-text-secondary">{{ log.timeParts.time }}</span>
                    </span>
                  </div>

                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-semibold leading-6 text-text-primary">{{ log.app }}</p>
                      <StatusBadge :status="log.statusBadge" />
                      <span class="rounded-full border border-app-border bg-app-bg2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {{ log.channel }}
                      </span>
                    </div>
                    <p class="mt-1 line-clamp-1 text-sm leading-5 text-text-secondary">{{ log.intent }}</p>
                    <div class="mt-2 flex flex-wrap gap-2 text-xs">
                      <span class="rounded-lg border border-app-border bg-app-bg2 px-2.5 py-1 text-text-muted">
                        {{ t('monitor.source') }} · {{ actorText(log.user) }}
                      </span>
                    </div>
                  </div>

                  <div class="rounded-lg border border-app-border bg-app-bg2 px-3 py-2 text-right">
                    <p class="text-[11px] uppercase tracking-wide text-text-muted">{{ t('monitor.latency') }}</p>
                    <p class="mt-1 truncate text-sm font-semibold" :class="latencyClass(log.latencyMs, log.status)">{{ log.latencyMs }}ms</p>
                  </div>
                </div>
              </button>
              </div>
            </div>
          </div>

          <aside class="min-h-0 space-y-4 overflow-y-auto overscroll-contain pr-1">
            <section v-if="selectedConversation" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-text-primary">{{ t('monitor.selectedTrace') }}</p>
                  <p class="mt-1 truncate text-xs text-text-muted">{{ selectedTraceSummary(selectedConversation) }}</p>
                </div>
                <StatusBadge :status="eventStatusBadge(selectedConversation.status)" />
              </div>
              <div class="mt-4 rounded-lg border border-app-border bg-app-bg2 p-3">
                <p class="text-xs font-medium uppercase tracking-wide text-text-muted">{{ t('monitor.eventMessage') }}</p>
                <p class="mt-2 text-sm leading-6 text-text-secondary">{{ selectedConversation.intent }}</p>
              </div>
              <div class="mt-3 grid gap-2 text-sm text-text-secondary">
                <div class="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-md bg-app-bg2 px-3 py-2">
                  <span class="text-text-muted">{{ t('monitor.source') }}</span>
                  <span class="truncate text-text-primary">{{ actorText(selectedConversation.user) }}</span>
                </div>
                <div class="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-md bg-app-bg2 px-3 py-2">
                  <span class="text-text-muted">{{ t('monitor.channel') }}</span>
                  <span class="truncate text-text-primary">{{ selectedConversation.channel.toUpperCase() }}</span>
                </div>
                <div class="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-md bg-app-bg2 px-3 py-2">
                  <span class="text-text-muted">{{ t('monitor.duration') }}</span>
                  <span class="truncate text-text-primary" :class="latencyClass(selectedConversation.latencyMs, selectedConversation.status)">{{ selectedConversation.latencyMs }}ms</span>
                </div>
                <div class="grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-md bg-app-bg2 px-3 py-2">
                  <span class="text-text-muted">Trace</span>
                  <span class="truncate font-mono text-xs text-text-primary">{{ selectedConversation.id }}</span>
                </div>
              </div>
            </section>

            <section class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-text-primary">{{ t('monitor.reviewTitle') }}</p>
                <span class="rounded-md border border-app-border bg-app-muted px-2 py-1 text-xs text-text-secondary">
                  {{ difyStore.reviewQueue.length }} {{ t('monitor.reviewQueue') }}
                </span>
              </div>
              <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('monitor.reviewHint') }}</p>
              <div class="mt-4 space-y-2">
                <article
                  v-for="log in difyStore.reviewQueue"
                  :key="log.id"
                  class="cursor-pointer rounded-md border border-app-border bg-app-bg2 p-3 transition hover:border-primary/30 hover:bg-primary-soft/30"
                  @click="selectConversation(log.id)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-sm font-medium text-text-primary">{{ log.app }}</p>
                    <StatusBadge :status="log.status === 'success' ? 'success' : log.status === 'running' ? 'running' : 'failed'" />
                  </div>
                  <p class="mt-2 text-xs leading-5 text-text-secondary">
                    {{ t('monitor.reason') }}: {{ log.reviewReason ?? t('common.none') }}
                  </p>
                  <p class="mt-1 text-xs text-text-muted">{{ actorText(log.user) }} · {{ log.channel }} · {{ log.latencyMs }}ms</p>
                </article>
                <p v-if="difyStore.reviewQueue.length === 0" class="rounded-md border border-dashed border-app-border bg-app-bg2 p-3 text-xs text-text-muted">
                  {{ t('common.noResult') }}
                </p>
              </div>
            </section>

            <section class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('monitor.alertsTitle') }}</p>
              <div class="mt-4 space-y-3 text-sm text-text-secondary">
                <p class="rounded-md bg-app-bg2 p-3">{{ t('monitor.alerts.latency') }}</p>
                <p class="rounded-md bg-app-bg2 p-3">{{ t('monitor.alerts.quota') }}</p>
                <p class="rounded-md bg-app-bg2 p-3">{{ t('monitor.alerts.retries') }}</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  </section>
</template>
