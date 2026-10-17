<script setup lang="ts">
import { ArrowUpRight, RefreshCw } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { homeMessages } from './homeMessages'
import { homeRunPageSize, type HomeRunGroup, type HomeRunSnapshot } from './homeStore'

const props = defineProps<{ group: HomeRunGroup; loading: boolean; error: boolean; loaded: boolean; snapshot: HomeRunSnapshot | null }>()
const emit = defineEmits<{ retry: [] }>()
const sectionHeading = ref<HTMLElement | null>(null)
const { t } = useI18n({ useScope: 'local', messages: homeMessages })
const historyQuery = () => props.group === 'failed' ? { status: 'FAILED' } : props.group === 'completed' ? { status: 'SUCCESS' } : {}

function retryInline() {
  if (props.loading) return
  sectionHeading.value?.focus({ preventScroll: true })
  emit('retry')
}
</script>

<template>
  <section :data-section="group" :aria-labelledby="`home-${group}-title`" :aria-busy="loading" class="flex min-w-0 flex-col rounded-xl border border-app-border bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 :id="`home-${group}-title`" ref="sectionHeading" tabindex="-1" class="rounded-sm text-base font-semibold text-text-primary focus:outline focus:outline-2 focus:outline-offset-4 focus:outline-primary">{{ t(`${group}Title`) }}</h2>
        <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t(`${group}Hint`) }}</p>
      </div>
      <button type="button" :data-action="`refresh-${group}`" :aria-label="`${t('refresh')} · ${t(`${group}Title`)}`" :disabled="loading" class="rounded-md border border-app-border p-2 text-text-secondary hover:bg-app-muted disabled:opacity-50" @click="$emit('retry')">
        <RefreshCw class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <p v-if="loading" data-state="loading" role="status" class="py-8 text-sm text-text-muted">{{ t('loading') }}</p>
    <div v-else-if="error" data-state="error" role="alert" :aria-labelledby="`home-${group}-title`" class="my-4 rounded-lg border border-status-warning/30 bg-amber-50 p-3 text-sm text-text-secondary">
      <p>{{ t('loadFailed') }}</p>
      <button type="button" :aria-label="`${t('retry')} · ${t(`${group}Title`)}`" class="mt-2 font-medium text-primary underline" @click="retryInline">{{ t('retry') }}</button>
    </div>
    <template v-else-if="loaded && snapshot">
      <div v-if="snapshot.failedStatuses.length" data-state="partial-error" role="alert" :aria-labelledby="`home-${group}-title`" class="mt-4 rounded-lg border border-status-warning/30 bg-amber-50 p-3 text-sm text-text-secondary">
        <p>{{ t('partial') }}</p>
        <button type="button" :aria-label="`${t('retry')} · ${t(`${group}Title`)}`" class="mt-2 font-medium text-primary underline" @click="retryInline">{{ t('retry') }}</button>
      </div>
      <p v-else-if="snapshot.items.length === 0" data-state="empty" class="py-8 text-sm text-text-muted">{{ t(`${group}Empty`) }}</p>
      <ul v-if="snapshot.items.length" class="mt-4 divide-y divide-app-border">
        <li v-for="run in snapshot.items" :key="run.id">
          <RouterLink :to="`/runs/${encodeURIComponent(run.id)}`" data-link="run" class="group flex items-center justify-between gap-3 rounded-lg py-3 text-sm transition hover:bg-app-muted">
            <div class="min-w-0">
              <p class="break-words font-medium text-text-primary group-hover:text-primary">{{ run.workflowName }}</p>
              <p class="mt-1 break-all text-xs text-text-muted">{{ run.id }} · {{ run.startedAt }}</p>
              <p class="mt-2 text-xs font-medium" :class="run.status === 'failed' ? 'text-status-error' : 'text-text-secondary'">{{ t(`status.${run.status}`) }}</p>
            </div>
            <span class="flex shrink-0 items-center gap-1 text-xs text-primary">{{ t(group === 'completed' ? 'openResult' : 'openRun') }}<ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true" /></span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="group !== 'active' && snapshot.pages[0]" class="mt-3 text-xs leading-5 text-text-muted">{{ t('statusTotal', { total: snapshot.pages[0].total, shown: snapshot.items.length }) }}</p>
    </template>
    <div class="mt-auto pt-4">
      <p v-if="group === 'active'" class="mb-3 text-xs leading-5 text-text-muted">{{ t('runScope', { count: homeRunPageSize }) }}</p>
      <RouterLink :to="{ path: '/runs', query: historyQuery() }" class="text-sm font-medium text-primary hover:underline">{{ t('viewRuns') }} →</RouterLink>
    </div>
  </section>
</template>
