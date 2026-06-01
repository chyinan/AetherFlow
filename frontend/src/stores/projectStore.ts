import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { projectApi } from '@/services/api/projectApi'
import { workflowApi } from '@/services/api/workflowApi'
import type { ProjectSummary } from '@/types/project'
import type { WorkflowSummary } from '@/types/workflow'

import { useDifyStore } from './difyStore'
import { useFileStore } from './fileStore'
import { useRunStore } from './runStore'

const PROJECT_WORKFLOW_LINKS_STORAGE_KEY = 'aetherflow.project.workflowLinks'

function normalizeMatchText(value: string | undefined) {
  return (value ?? '').toLowerCase().replace(/[\s_-]+/g, '')
}

function readProjectWorkflowLinks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_WORKFLOW_LINKS_STORAGE_KEY) ?? '{}') as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, string[]>
    }
  } catch {
    // Ignore corrupt local link metadata; backend workflow definitions remain the source of truth.
  }
  return {}
}

function writeProjectWorkflowLinks(links: Record<string, string[]>) {
  try {
    localStorage.setItem(PROJECT_WORKFLOW_LINKS_STORAGE_KEY, JSON.stringify(links))
  } catch {
    // Project workflow links are convenience metadata; failed writes must not block backend CRUD.
  }
}

function linkedWorkflowIds(projectId: string) {
  return new Set(readProjectWorkflowLinks()[projectId] ?? [])
}

function projectWorkflowMatch(project: ProjectSummary, workflow: WorkflowSummary) {
  const projectName = normalizeMatchText(project.name)
  const workflowName = normalizeMatchText(workflow.name)
  const workflowDescription = normalizeMatchText(workflow.description)

  if (!projectName || !workflowName) {
    return false
  }

  return workflowName.includes(projectName)
    || projectName.includes(workflowName)
    || workflowDescription.includes(projectName)
}

function inferredProjectWorkflows(project: ProjectSummary, workflows: WorkflowSummary[]) {
  if (project.workflows.length > 0) {
    return project.workflows
  }

  const linkedIds = linkedWorkflowIds(project.id)
  return workflows.filter((workflow) =>
    linkedIds.has(workflow.id) || projectWorkflowMatch(project, workflow),
  )
}

function fileMatchesWorkflow(file: { workflowId?: string; workflowName?: string; objectKey?: string }, workflow: WorkflowSummary) {
  if (file.workflowId && String(file.workflowId) === String(workflow.id)) {
    return true
  }
  if (file.workflowName && normalizeMatchText(file.workflowName).includes(normalizeMatchText(workflow.name))) {
    return true
  }
  const objectKey = String(file.objectKey ?? '')
  return objectKey.startsWith(`workflow/exports/${workflow.id}/`)
}

function exportRuntimeWorkflowId(file: { objectKey?: string }) {
  const match = /^workflow\/exports\/([^/]+)\//.exec(String(file.objectKey ?? ''))
  return match?.[1]
}

function fileMatchesProjectRun(
  file: { objectKey?: string },
  project: ProjectSummary,
  runs: ReturnType<typeof useRunStore>['runs'],
) {
  const runtimeWorkflowId = exportRuntimeWorkflowId(file)
  if (!runtimeWorkflowId) {
    return false
  }

  return runs.some((run) => {
    const matchesRuntime =
      run.runtimeWorkflowId === runtimeWorkflowId ||
      String(run.backendInstanceId ?? '') === runtimeWorkflowId ||
      run.id === `run-${runtimeWorkflowId}`
    if (!matchesRuntime) {
      return false
    }
    return projectWorkflowMatch(project, {
      id: run.workflowId,
      name: run.workflowName,
      updatedAt: run.startedAt,
      status: run.status === 'running' ? 'running' : run.status === 'queued' ? 'draft' : 'ready',
      backendDefinitionId: run.definitionId,
    })
  })
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as ProjectSummary[],
    workflowSummaries: [] as WorkflowSummary[],
    currentProjectId: 'project-media-ops',
    loading: false,
  }),
  getters: {
    currentProject: (state) =>
      state.projects.find((project) => project.id === state.currentProjectId) ?? state.projects[0],
    projectWorkflows: (state) => (projectId: string) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) {
        return []
      }
      return inferredProjectWorkflows(project, state.workflowSummaries)
    },
    projectMetrics: (state) => (projectId: string) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) {
        return null
      }
      const workflows = inferredProjectWorkflows(project, state.workflowSummaries)
      const workflowIds = new Set(workflows.map((workflow) => workflow.id))
      const runStore = useRunStore()
      const fileStore = useFileStore()
      const difyStore = useDifyStore()
      const runs = runStore.runs.filter((run) => workflowIds.has(run.workflowId))
      const knowledgeCount = project.knowledgeCount > 0
        ? project.knowledgeCount
        : (project.name.includes('会议') ? difyStore.datasets.length : 0)
      const files = fileStore.files.filter((file) => {
        if (workflows.some((workflow) => fileMatchesWorkflow(file, workflow))) {
          return true
        }
        if (fileMatchesProjectRun(file, project, runStore.runs)) {
          return true
        }
        return !file.workflowId
          && !file.objectKey?.startsWith('workflow/exports/')
          && Boolean(file.workflowName)
          && normalizeMatchText(file.workflowName).includes(normalizeMatchText(project.name))
      })
      const hasRuntimeRuns = runStore.runs.length > 0
      const hasRuntimeFiles = fileStore.files.length > 0
      return {
        workflowCount: workflows.length || project.workflowCount,
        activeRunCount: hasRuntimeRuns
          ? runs.filter((run) => ['queued', 'running'].includes(run.status)).length
          : project.activeRunCount,
        fileCount: hasRuntimeFiles ? files.length || project.fileCount : project.fileCount,
        queueDepth: hasRuntimeRuns
          ? runs.filter((run) => ['queued', 'running'].includes(run.status)).length
          : project.queueDepth,
        knowledgeCount,
        lastRunStatus: runs[0]?.status ?? project.lastRunStatus,
      }
    },
  },
  actions: {
    async loadProjects() {
      this.loading = true
      try {
        const [projects, workflows] = await Promise.all([
          projectApi.listProjects(),
          workflowApi.listWorkflows(),
        ])
        this.projects = projects
        this.workflowSummaries = workflows
        this.currentProjectId = this.currentProjectId || this.projects[0]?.id || 'project-media-ops'
      } finally {
        this.loading = false
      }
    },
    async refreshProjects() {
      this.loading = true
      try {
        const [projects, workflows] = await Promise.all([
          projectApi.listProjects(),
          workflowApi.listWorkflows(),
        ])
        this.projects = projects
        this.workflowSummaries = workflows
        this.currentProjectId = this.projects[0]?.id || ''
      } finally {
        this.loading = false
      }
    },
    selectProject(projectId: string) {
      this.currentProjectId = projectId
    },
    selectProjectByWorkflow(workflowId: string) {
      const project = this.projects.find((item) =>
        inferredProjectWorkflows(item, this.workflowSummaries).some((workflow) => workflow.id === workflowId),
      )
      if (project) {
        this.currentProjectId = project.id
      }
    },
    updateWorkflowStatus(workflowId: string, status: WorkflowSummary['status']) {
      const now = new Date().toLocaleString('zh-CN', { hour12: false })
      this.projects.forEach((project) => {
        const workflow = project.workflows.find((item) => item.id === workflowId)
        if (workflow) {
          workflow.status = status
          workflow.updatedAt = now
        }
      })
      const summary = this.workflowSummaries.find((workflow) => workflow.id === workflowId)
      if (summary) {
        summary.status = status
        summary.updatedAt = now
      }
    },
    linkWorkflowToProject(projectId: string, workflowId: string) {
      const links = readProjectWorkflowLinks()
      links[projectId] = [...new Set([...(links[projectId] ?? []), workflowId])]
      writeProjectWorkflowLinks(links)
    },
    unlinkWorkflowFromProject(projectId: string, workflowId: string) {
      const links = readProjectWorkflowLinks()
      links[projectId] = (links[projectId] ?? []).filter((id) => id !== workflowId)
      writeProjectWorkflowLinks(links)
    },
    async renameProjectWorkflow(projectId: string, workflowId: string, name: string) {
      const workflow = await workflowApi.getWorkflow(workflowId)
      const saved = await workflowApi.saveWorkflow({
        ...workflow,
        id: workflowId,
        name,
      })
      this.linkWorkflowToProject(projectId, saved.id)
      await this.loadProjects()
      return saved
    },
    async deleteProjectWorkflow(projectId: string, workflowId: string) {
      await workflowApi.deleteWorkflow(workflowId)
      this.unlinkWorkflowFromProject(projectId, workflowId)
      this.workflowSummaries = this.workflowSummaries.filter((workflow) => workflow.id !== workflowId)
      this.projects.forEach((project) => {
        project.workflows = project.workflows.filter((workflow) => workflow.id !== workflowId)
      })
    },
    async createProject(payload: { name: string; scenario: ProjectSummary['scenario'] }) {
      const project = await projectApi.createProject({
        name: payload.name,
        scenario: payload.scenario,
        description: i18n.global.t('projects.projectDescription'),
      })
      this.projects = [...this.projects, project]
      this.currentProjectId = project.id
      return project
    },
    createMockProject(payload: { name: string; scenario: ProjectSummary['scenario'] }) {
      return this.createProject(payload)
    },
  },
})
