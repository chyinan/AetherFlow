<script setup lang="ts">
import { BarChart3, ShieldAlert, Timer, TrendingUp } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useDifyStore } from '@/stores/difyStore'

const difyStore = useDifyStore()
const { t } = useI18n()
const selectedConversationId = ref('')

const summaryCards = computed(() => [
  { label: t('monitor.requests'), value: difyStore.metrics[0]?.value ?? '--', hint: difyStore.metrics[0]?.delta ?? '--', icon: BarChart3 },
  { label: t('monitor.latency'), value: difyStore.metrics[1]?.value ?? '--', hint: difyStore.metrics[1]?.delta ?? '--', icon: Timer },
  { label: t('monitor.cost'), value: difyStore.metrics[2]?.value ?? '--', hint: difyStore.metrics[2]?.delta ?? '--', icon: TrendingUp },
  { label: t('monitor.errors'), value: difyStore.metrics[3]?.value ?? '--', hint: difyStore.metrics[3]?.delta ?? '--', icon: ShieldAlert },
])

const selectedConversation = computed(() =>
  difyStore.conversations.find((conversation) => conversation.id === selectedConversationId.value) ?? difyStore.conversations[0],
)

function feedbackText(value: string) {
  if (value === 'like') return t('monitor.feedback.like')
  if (value === 'dislike') return t('monitor.feedback.dislike')
  return t('monitor.feedback.none')
}

function selectConversation(conversationId: string) {
  selectedConversationId.value = conversationId
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

    <main class="min-h-0 overflow-x-hidden overflow-y-auto bg-app-bg px-4 py-5 sm:px-5 lg:px-6">
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

        <section class="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div class="min-h-0 rounded-lg border border-app-border bg-white shadow-sm">
            <div class="flex items-center justify-between border-b border-app-border px-4 py-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('monitor.logsTitle') }}</p>
                <p class="text-xs text-text-muted">{{ t('monitor.logsHint') }}</p>
              </div>
              <div class="flex flex-wrap justify-end gap-2">
                <span class="rounded-md border border-app-border bg-app-muted px-2 py-1 text-xs text-text-secondary">
                  {{ difyStore.successfulConversationCount }} {{ t('monitor.successful') }}
                </span>
                <span class="rounded-md border border-status-error/20 bg-red-50 px-2 py-1 text-xs text-status-error">
                  {{ difyStore.failedConversationCount }} {{ t('monitor.failedCases') }}
                </span>
              </div>
            </div>

            <div class="min-h-0 overflow-auto">
              <div class="grid min-w-[720px] grid-cols-[96px_minmax(0,1.2fr)_110px_90px_100px_110px] bg-app-bg2 px-3 py-2 text-xs font-semibold text-text-muted">
                <span>{{ t('monitor.time') }}</span>
                <span>{{ t('monitor.app') }}</span>
                <span>{{ t('monitor.user') }}</span>
                <span>{{ t('monitor.tokens') }}</span>
                <span>{{ t('monitor.cost') }}</span>
                <span>{{ t('monitor.feedbackLabel') }}</span>
              </div>
              <button
                v-for="log in difyStore.conversations"
                :key="log.id"
                type="button"
                class="grid w-full min-w-[720px] grid-cols-[96px_minmax(0,1.2fr)_110px_90px_100px_110px] items-center border-t border-app-border px-3 py-3 text-left text-sm transition hover:bg-primary-soft/30"
                :class="selectedConversation?.id === log.id ? 'bg-primary-soft/40' : 'bg-white'"
                @click="selectConversation(log.id)"
              >
                <span class="font-mono text-xs text-text-muted">{{ log.time }}</span>
                <div class="min-w-0">
                  <p class="truncate font-medium text-text-primary">{{ log.app }}</p>
                  <p class="mt-1 truncate text-xs text-text-secondary">{{ log.intent }}</p>
                  <p class="mt-1 inline-flex rounded bg-app-muted px-2 py-0.5 text-[11px] text-text-muted">
                    {{ t('monitor.channel') }}: {{ log.channel }}
                  </p>
                </div>
                <span class="truncate text-text-secondary">{{ log.user }}</span>
                <span class="text-text-secondary">{{ log.tokens }}</span>
                <span class="text-text-secondary">{{ log.cost }}</span>
                <span class="flex items-center gap-2">
                  <StatusBadge :status="log.status === 'success' ? 'success' : log.status === 'running' ? 'running' : 'warning'" />
                  <span class="text-xs text-text-muted">{{ feedbackText(log.feedback) }}</span>
                </span>
              </button>
            </div>
          </div>

          <aside class="space-y-4">
            <section v-if="selectedConversation" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('monitor.selectedTrace') }}</p>
              <div class="mt-4 space-y-2 text-sm text-text-secondary">
                <p class="rounded-md bg-app-bg2 p-3">{{ selectedConversation.app }} · {{ selectedConversation.intent }}</p>
                <p class="rounded-md bg-app-bg2 p-3">{{ t('monitor.user') }}: {{ selectedConversation.user }}</p>
                <p class="rounded-md bg-app-bg2 p-3">{{ t('monitor.latency') }}: {{ selectedConversation.latencyMs }}ms</p>
              </div>
            </section>

            <section class="rounded-lg border border-app-border bg-sidebar p-4 text-text-inverse shadow-sm">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold">{{ t('monitor.reviewTitle') }}</p>
                <span class="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-300">
                  {{ difyStore.reviewQueue.length }} {{ t('monitor.reviewQueue') }}
                </span>
              </div>
              <p class="mt-2 text-sm leading-6 text-slate-300">{{ t('monitor.reviewHint') }}</p>
              <div class="mt-4 space-y-2">
                <article
                  v-for="log in difyStore.reviewQueue"
                  :key="log.id"
                  class="rounded-md border border-white/10 bg-white/5 p-3"
                  @click="selectConversation(log.id)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-sm font-medium text-white">{{ log.app }}</p>
                    <StatusBadge :status="log.status === 'success' ? 'success' : log.status === 'running' ? 'running' : 'failed'" />
                  </div>
                  <p class="mt-2 text-xs leading-5 text-slate-300">
                    {{ t('monitor.reason') }}: {{ log.reviewReason ?? t('common.none') }}
                  </p>
                  <p class="mt-1 text-xs text-slate-400">{{ log.user }} · {{ log.channel }} · {{ log.latencyMs }}ms</p>
                </article>
                <p v-if="difyStore.reviewQueue.length === 0" class="rounded-md bg-white/5 p-3 text-xs text-slate-400">
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
