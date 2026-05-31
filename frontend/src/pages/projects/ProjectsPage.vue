<script setup lang="ts">
import { Activity, Bot, Boxes, Edit3, FolderKanban, MessagesSquare, Plus, Trash2, Workflow } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import type { ProjectHealth, ProjectSummary } from '@/types/project'
import type { WorkflowSummary } from '@/types/workflow'

const projectStore = useProjectStore()
const difyStore = useDifyStore()
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
const showWorkflowPanel = ref(false)
const workflowDraftName = ref('')
const workflowDraftProjectId = ref('')
const workflowDraftId = ref('')

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

function workflowsFor(project: ProjectSummary) {
  return projectStore.projectWorkflows(project.id)
}

function openCreateProject() {
  draftName.value = t('projects.defaultProjectName')
  draftScenario.value = 'media'
  showCreatePanel.value = true
}

function openCreateWorkflow(project: ProjectSummary) {
  workflowDraftProjectId.value = project.id
  workflowDraftId.value = ''
  workflowDraftName.value = `${project.name}${t('projects.workflowSuffix')}`
  projectStore.selectProject(project.id)
  showWorkflowPanel.value = true
}

function openRenameWorkflow(project: ProjectSummary, workflow: WorkflowSummary) {
  workflowDraftProjectId.value = project.id
  workflowDraftId.value = workflow.id
  workflowDraftName.value = workflow.name
  projectStore.selectProject(project.id)
  showWorkflowPanel.value = true
}

async function submitWorkflowDraft() {
  const name = workflowDraftName.value.trim()
  const projectId = workflowDraftProjectId.value
  if (!name || !projectId) {
    return
  }

  if (workflowDraftId.value) {
    await projectStore.renameProjectWorkflow(projectId, workflowDraftId.value, name)
    showWorkflowPanel.value = false
    return
  }

  showWorkflowPanel.value = false
  await router.push({
    path: '/workflows/new',
    query: { projectId, name },
  })
}

async function deleteWorkflow(project: ProjectSummary, workflow: WorkflowSummary) {
  const confirmed = window.confirm(t('projects.deleteWorkflowConfirm', { name: workflow.name }))
  if (!confirmed) {
    return
  }
  await projectStore.deleteProjectWorkflow(project.id, workflow.id)
}

async function submitCreate() {
  const name = draftName.value.trim()
  if (!name) {
    return
  }
  const project = await projectStore.createProject({ name, scenario: draftScenario.value })
  showCreatePanel.value = false
  await router.push('/projects')
  projectStore.selectProject(project.id)
}

function openProject(project: ProjectSummary) {
  projectStore.selectProject(project.id)
  const workflow = workflowsFor(project)[0]
  if (workflow) {
    void router.push(`/workflows/${workflow.id}`)
    return
  }

  void router.push({
    path: '/workflows/new',
    query: {
      projectId: project.id,
      name: project.name,
    },
  })
}

onMounted(async () => {
  await Promise.all([projectStore.loadProjects(), runStore.loadRuns(), fileStore.loadFiles(), difyStore.loadSurface()])
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
            class="flex min-h-[320px] flex-col rounded-lg border bg-white shadow-sm transition hover:border-primary/30 hover:shadow-node"
            :class="projectStore.currentProjectId === project.id ? 'border-primary/40 ring-2 ring-primary/10' : 'border-app-border'"
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
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary-soft/80"
                  @click.stop="openCreateWorkflow(project)"
                >
                  <Plus class="h-3.5 w-3.5" />
                  {{ t('projects.newWorkflow') }}
                </button>
                <button
                  v-if="workflowsFor(project).length > 0"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md border border-app-border bg-white px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-primary/30 hover:text-primary"
                  @click.stop="openProject(project)"
                >
                  {{ t('projects.openLatestWorkflow') }}
                </button>
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
              <p v-if="workflowsFor(project).length === 0" class="rounded-md border border-dashed border-app-border bg-app-bg2 p-4 text-sm text-text-muted">
                {{ t('projects.noProjectWorkflows') }}
              </p>
              <RouterLink
                v-for="workflow in workflowsFor(project)"
                :key="workflow.id"
                :to="`/workflows/${workflow.id}`"
                class="flex items-center justify-between gap-3 rounded-md border border-app-border bg-app-bg2 px-3 py-2 transition hover:border-primary/30 hover:bg-primary-soft/60"
                @click.stop="projectStore.selectProject(project.id)"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-text-primary">{{ workflow.name }}</p>
                  <p class="mt-1 text-[11px] text-text-muted">{{ workflow.updatedAt }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <StatusBadge :status="workflow.status === 'draft' ? 'idle' : workflow.status === 'ready' ? 'success' : 'running'" />
                  <button
                    type="button"
                    class="grid h-7 w-7 place-items-center rounded-md border border-app-border bg-white text-text-muted transition hover:border-primary/30 hover:text-primary"
                    :title="t('projects.renameWorkflow')"
                    @click.prevent.stop="openRenameWorkflow(project, workflow)"
                  >
                    <Edit3 class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="grid h-7 w-7 place-items-center rounded-md border border-app-border bg-white text-text-muted transition hover:border-status-error/30 hover:text-status-error"
                    :title="t('projects.deleteWorkflow')"
                    @click.prevent.stop="deleteWorkflow(project, workflow)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
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

    <div v-if="showWorkflowPanel" class="fixed inset-0 z-40 grid place-items-center bg-slate-950/30 px-4">
      <form class="w-full max-w-md rounded-lg border border-app-border bg-white p-5 shadow-panel" @submit.prevent="submitWorkflowDraft">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-text-primary">
              {{ workflowDraftId ? t('projects.renameWorkflow') : t('projects.createWorkflowTitle') }}
            </p>
            <p class="text-xs text-text-muted">{{ t('projects.workflowPanelHint') }}</p>
          </div>
          <button type="button" class="rounded-md border border-app-border px-2 py-1 text-xs text-text-secondary" @click="showWorkflowPanel = false">
            {{ t('common.close') }}
          </button>
        </div>

        <label class="block">
          <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('projects.workflowNameLabel') }}</span>
          <input v-model="workflowDraftName" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" />
        </label>

        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-md border border-app-border px-3 py-2 text-sm text-text-secondary" @click="showWorkflowPanel = false">
            {{ t('common.close') }}
          </button>
          <button type="submit" class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node">
            {{ workflowDraftId ? t('common.save') : t('projects.createWorkflow') }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
