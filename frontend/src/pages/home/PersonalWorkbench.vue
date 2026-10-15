<script setup lang="ts">
import { ArrowUpRight, FolderKanban, Plus, RefreshCw } from 'lucide-vue-next'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import HomeRunSection from './HomeRunSection.vue'
import { homeMessages } from './homeMessages'
import { useHomeStore, type HomeRunGroup } from './homeStore'

const auth = useAuthStore()
const home = useHomeStore()
const { t } = useI18n({ useScope: 'local', messages: homeMessages })
const groups: HomeRunGroup[] = ['active', 'failed', 'completed']
const loading = computed(() => home.workflows.loading || groups.some(group => home[group].loading))
const workflows = computed(() => [...(home.workflows.data ?? [])]
  .filter(workflow => Boolean(workflow.id) && workflow.id !== 'new')
  .slice(0, 4))

function refresh() {
  if (!auth.isAuthenticated) return
  void home.loadWorkflows()
  groups.forEach(group => { void home.loadRuns(group) })
}
watch(() => JSON.stringify([auth.isAuthenticated, auth.user?.userId ?? auth.user?.id, auth.isAdmin]), () => {
  home.clearPersonal()
  refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => home.clearPersonal())
</script>

<template>
  <div data-page="personal-workbench" class="workbench h-full overflow-y-auto bg-app-bg">
    <header class="border-b border-app-border bg-white px-4 py-6 sm:px-6">
      <div class="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-text-primary">{{ t('personalTitle') }}</h1>
          <p class="mt-2 text-sm text-text-secondary">{{ t('personalHint') }}</p>
          <p class="mt-2 text-xs text-text-muted">{{ t('personalScope') }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-action="refresh-all" :disabled="loading" class="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 text-sm text-text-secondary hover:bg-app-muted disabled:opacity-50" @click="refresh">
            <RefreshCw class="h-4 w-4" aria-hidden="true" />{{ t('refresh') }}
          </button>
          <RouterLink to="/workflows/new" data-action="new-workflow" class="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            <Plus class="h-4 w-4" aria-hidden="true" />{{ t('newWorkflow') }}
          </RouterLink>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <section data-section="workflows" :aria-busy="home.workflows.loading" class="rounded-xl border border-app-border bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><h2 class="text-base font-semibold text-text-primary">{{ t('continueTitle') }}</h2><p class="mt-1 text-sm text-text-secondary">{{ t('continueHint') }}</p></div>
          <RouterLink to="/projects" class="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{{ t('allWorkflows') }}<ArrowUpRight class="h-4 w-4" aria-hidden="true" /></RouterLink>
        </div>
        <p v-if="home.workflows.loading" data-state="loading" role="status" class="py-8 text-sm text-text-muted">{{ t('loading') }}</p>
        <div v-else-if="home.workflows.error" data-state="error" role="alert" class="mt-4 rounded-lg border border-status-warning/30 bg-amber-50 p-3 text-sm text-text-secondary">
          <p>{{ t('loadFailed') }}</p><button type="button" data-action="retry-workflows" class="mt-2 font-medium text-primary underline" @click="home.loadWorkflows()">{{ t('retry') }}</button>
        </div>
        <template v-else-if="home.workflows.loaded">
          <div v-if="!workflows.length" data-state="empty" class="mt-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-5">
            <h3 class="font-medium text-text-primary">{{ t('noWorkflows') }}</h3><p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('startHint') }}</p>
            <div class="mt-4 flex flex-wrap gap-3">
              <RouterLink to="/projects" data-action="create-project" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-primary"><FolderKanban class="h-4 w-4" aria-hidden="true" />{{ t('createProject') }}</RouterLink>
              <RouterLink to="/workflows/new" class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white">{{ t('newWorkflow') }}</RouterLink>
            </div>
            <p class="mt-3 text-xs text-text-muted">{{ t('importHint') }}</p>
          </div>
          <ul v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <li v-for="workflow in workflows" :key="workflow.id" class="min-w-0">
              <RouterLink :to="`/workflows/${encodeURIComponent(workflow.id)}`" data-link="workflow" class="block h-full rounded-lg border border-app-border p-4 transition hover:border-primary/40 hover:bg-primary/5">
                <h3 class="break-words text-sm font-semibold text-text-primary">{{ workflow.name }}</h3>
                <p v-if="workflow.description" class="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">{{ workflow.description }}</p>
                <p class="mt-3 text-xs text-text-muted">{{ workflow.updatedAt }}</p>
                <p class="mt-3 text-sm font-medium text-primary">{{ t('openWorkflow') }} →</p>
              </RouterLink>
            </li>
          </ul>
        </template>
        <p class="mt-4 text-xs leading-5 text-text-muted">{{ t('savedOnly') }}</p>
      </section>
      <div class="grid items-start gap-5 xl:grid-cols-3">
        <HomeRunSection v-for="group in groups" :key="group" :group="group" :loading="home[group].loading" :error="home[group].error" :loaded="home[group].loaded" :snapshot="home[group].data" @retry="home.loadRuns(group)" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.workbench :deep(a:focus-visible), .workbench :deep(button:focus-visible) { outline: 2px solid #2563eb; outline-offset: 3px; }
</style>
