<script setup lang="ts">
import { Activity, Bot, Boxes, FolderKanban, MessagesSquare, Plus, Workflow } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import type { ProjectHealth, ProjectSummary } from '@/types/project'

const projectStore = useProjectStore()
const runStore = useRunStore()
const fileStore = useFileStore()
const router = useRouter()
const { t } = useI18n()

const totals = computed(() => {
  return projectStore.projects.reduce(
    (acc, project) => {
      const metrics = projectStore.projectMetrics(project.id)
      acc.workflows += metrics?.workflowCount ?? project.workflowCount
      acc.runs += metrics?.activeRunCount ?? project.activeRunCount
      acc.files += metrics?.fileCount ?? project.fileCount
      acc.queueDepth += metrics?.queueDepth ?? project.queueDepth
      acc.knowledge += metrics?.knowledgeCount ?? project.knowledgeCount
      return acc
    },
    { workflows: 0, runs: 0, files: 0, queueDepth: 0, knowledge: 0 },
  )
})

const healthClass: Record<ProjectHealth, string> = {
  healthy: 'border-status-success/20 bg-green-50 text-status-success',
  attention: 'border-status-warning/25 bg-amber-50 text-status-warning',
  idle: 'border-app-border bg-app-muted text-text-secondary',
}

const showCreatePanel = ref(false)
const draftName = ref('')
const draftScenario = ref<ProjectSummary['scenario']>('media')

function metricsFor(project: ProjectSummary) {
  return projectStore.projectMetrics(project.id) ?? {
    workflowCount: project.workflowCount,
    activeRunCount: project.activeRunCount,
    fileCount: project.fileCount,
    queueDepth: project.queueDepth,
    knowledgeCount: project.knowledgeCount,
    lastRunStatus: project.lastRunStatus,
  }
}

function openCreateProject() {
  draftName.value = t('projects.defaultProjectName')
  draftScenario.value = 'media'
  showCreatePanel.value = true
}

async function submitCreate() {
  const name = draftName.value.trim()
  if (!name) {
    return
  }
  const project = projectStore.createMockProject({ name, scenario: draftScenario.value })
  showCreatePanel.value = false
  await router.push('/projects')
  projectStore.selectProject(project.id)
}

onMounted(async () => {
  await Promise.all([projectStore.loadProjects(), runStore.loadRuns(), fileStore.loadFiles()])
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
      <button class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node" @click="openCreateProject">
        <Plus class="h-4 w-4" />
        {{ t('projects.new') }}
      </button>
    </header>

    <main class="min-h-0 overflow-y-auto bg-app-bg px-4 py-5 sm:px-5 lg:px-6">
      <div class="w-full space-y-5">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
          <div class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <Bot class="h-4 w-4 text-status-warning" />
              <span class="text-xs font-medium">{{ t('projects.queueDepth') }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ totals.queueDepth }}</p>
          </div>
          <div class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <MessagesSquare class="h-4 w-4 text-status-success" />
              <span class="text-xs font-medium">{{ t('projects.knowledgeBases') }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ totals.knowledge }}</p>
          </div>
        </section>

        <section class="grid gap-4 xl:grid-cols-3">
          <article
            v-for="project in projectStore.projects"
            :key="project.id"
            class="flex min-h-[320px] cursor-pointer flex-col rounded-lg border bg-white shadow-sm transition hover:border-primary/30 hover:shadow-node"
            :class="projectStore.currentProjectId === project.id ? 'border-primary/40 ring-2 ring-primary/10' : 'border-app-border'"
            @click="projectStore.selectProject(project.id)"
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
                  <p class="mt-1 text-xs font-semibold text-text-primary">{{ metricsFor(project).activeRunCount }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.files') }}</p>
                  <p class="mt-1 text-xs font-semibold text-text-primary">{{ metricsFor(project).fileCount }}</p>
                </div>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.scenario') }}</p>
                  <p class="mt-1 truncate text-xs font-semibold text-text-primary">{{ t(`projects.scenarios.${project.scenario}`) }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.owner') }}</p>
                  <p class="mt-1 truncate text-xs font-semibold text-text-primary">{{ project.owner }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.sla') }}</p>
                  <p class="mt-1 truncate text-xs font-semibold text-text-primary">{{ project.slaTarget }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.queueDepth') }}</p>
                  <p class="mt-1 text-xs font-semibold text-text-primary">{{ metricsFor(project).queueDepth }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.knowledgeBases') }}</p>
                  <p class="mt-1 text-xs font-semibold text-text-primary">{{ metricsFor(project).knowledgeCount }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-[11px] text-text-muted">{{ t('projects.lastRun') }}</p>
                  <StatusBadge :status="metricsFor(project).lastRunStatus" class="mt-1" />
                </div>
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-2 p-3">
              <RouterLink
                v-for="workflow in project.workflows"
                :key="workflow.id"
                :to="`/workflows/${workflow.id}`"
                class="flex items-center justify-between gap-3 rounded-md border border-app-border bg-app-bg2 px-3 py-2 transition hover:border-primary/30 hover:bg-primary-soft/60"
                @click.stop="projectStore.selectProject(project.id)"
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

    <div v-if="showCreatePanel" class="fixed inset-0 z-40 grid place-items-center bg-slate-950/30 px-4">
      <form class="w-full max-w-md rounded-lg border border-app-border bg-white p-5 shadow-panel" @submit.prevent="submitCreate">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-text-primary">{{ t('projects.createProjectTitle') }}</p>
            <p class="text-xs text-text-muted">{{ t('projects.createPanelHint') }}</p>
          </div>
          <button type="button" class="rounded-md border border-app-border px-2 py-1 text-xs text-text-secondary" @click="showCreatePanel = false">
            {{ t('common.close') }}
          </button>
        </div>

        <label class="block">
          <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('projects.nameLabel') }}</span>
          <input v-model="draftName" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" />
        </label>

        <label class="mt-4 block">
          <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('projects.scenario') }}</span>
          <select v-model="draftScenario" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="media">{{ t('projects.scenarios.media') }}</option>
            <option value="document">{{ t('projects.scenarios.document') }}</option>
            <option value="knowledge">{{ t('projects.scenarios.knowledge') }}</option>
            <option value="support">{{ t('projects.scenarios.support') }}</option>
          </select>
        </label>

        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-md border border-app-border px-3 py-2 text-sm text-text-secondary" @click="showCreatePanel = false">
            {{ t('common.close') }}
          </button>
          <button type="submit" class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node">
            {{ t('projects.createMock') }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
