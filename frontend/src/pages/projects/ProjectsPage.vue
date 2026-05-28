<script setup lang="ts">
import { Activity, Boxes, FolderKanban, Plus, Workflow } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useProjectStore } from '@/stores/projectStore'
import type { ProjectHealth } from '@/types/project'

const projectStore = useProjectStore()
const { t } = useI18n()

const totals = computed(() => {
  return projectStore.projects.reduce(
    (acc, project) => {
      acc.workflows += project.workflowCount
      acc.runs += project.activeRunCount
      acc.files += project.fileCount
      return acc
    },
    { workflows: 0, runs: 0, files: 0 },
  )
})

const healthClass: Record<ProjectHealth, string> = {
  healthy: 'border-status-success/20 bg-green-50 text-status-success',
  attention: 'border-status-warning/25 bg-amber-50 text-status-warning',
  idle: 'border-app-border bg-app-muted text-text-secondary',
}

onMounted(() => {
  void projectStore.loadProjects()
})
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center justify-between border-b border-app-border bg-white px-5">
      <div class="flex items-center gap-2">
        <FolderKanban class="h-4 w-4 text-primary" />
        <div>
          <p class="text-sm font-semibold text-text-primary">{{ t('projects.title') }}</p>
          <p class="text-xs text-text-muted">{{ t('projects.subtitle') }}</p>
        </div>
      </div>
      <button class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node">
        <Plus class="h-4 w-4" />
        {{ t('projects.new') }}
      </button>
    </header>

    <main class="min-h-0 overflow-y-auto bg-app-bg p-5">
      <div class="mx-auto max-w-7xl space-y-5">
        <section class="grid gap-3 md:grid-cols-3">
          <div class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <Workflow class="h-4 w-4 text-primary" />
              <span class="text-xs font-medium">{{ t('projects.workflows') }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ totals.workflows }}</p>
          </div>
          <div class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <Activity class="h-4 w-4 text-status-running" />
              <span class="text-xs font-medium">{{ t('projects.activeRuns') }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ totals.runs }}</p>
          </div>
          <div class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <Boxes class="h-4 w-4 text-ai" />
              <span class="text-xs font-medium">{{ t('projects.filesAndArtifacts') }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ totals.files }}</p>
          </div>
        </section>

        <section class="grid gap-4 xl:grid-cols-3">
          <article
            v-for="project in projectStore.projects"
            :key="project.id"
            class="flex min-h-[320px] flex-col rounded-lg border border-app-border bg-white shadow-sm transition hover:border-primary/30 hover:shadow-node"
          >
            <div class="border-b border-app-border p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-base font-semibold text-text-primary">{{ project.name }}</p>
                  <p class="mt-2 min-h-10 text-sm leading-5 text-text-secondary">{{ project.description }}</p>
                </div>
                <span class="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium" :class="healthClass[project.health]">
                  {{ t(`projects.health.${project.health}`) }}
                </span>
              </div>
              <div class="mt-4 grid grid-cols-3 gap-2">
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.env') }}</p>
                  <p class="mt-1 text-xs font-semibold text-text-primary">{{ t(`settings.environmentOptions.${project.environment}`) }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.runs') }}</p>
                  <p class="mt-1 text-xs font-semibold text-text-primary">{{ project.activeRunCount }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.files') }}</p>
                  <p class="mt-1 text-xs font-semibold text-text-primary">{{ project.fileCount }}</p>
                </div>
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-2 p-3">
              <RouterLink
                v-for="workflow in project.workflows"
                :key="workflow.id"
                :to="`/workflows/${workflow.id}`"
                class="flex items-center justify-between gap-3 rounded-md border border-app-border bg-app-bg2 px-3 py-2 transition hover:border-primary/30 hover:bg-primary-soft/60"
                @click="projectStore.selectProject(project.id)"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-text-primary">{{ workflow.name }}</p>
                  <p class="mt-1 text-[11px] text-text-muted">{{ workflow.updatedAt }}</p>
                </div>
                <StatusBadge :status="workflow.status === 'draft' ? 'idle' : workflow.status === 'ready' ? 'success' : 'running'" />
              </RouterLink>
            </div>
          </article>
        </section>
      </div>
    </main>
  </section>
</template>
