import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { projectApi } from '@/services/api/projectApi'
import { workflowApi } from '@/services/api/workflowApi'
import type { ProjectSummary } from '@/types/project'
import type { WorkflowSummary } from '@/types/workflow'
import { formatDateTime } from '@/utils/localeFormat'
import { tokenManager } from '@/api/client/tokenManager'
import { toApiError } from '@/api/client/apiError'

import { useFileStore } from './fileStore'
import { useRunStore } from './runStore'

const PROJECT_WORKFLOW_LINKS_STORAGE_KEY = 'aetherflow.project.workflowLinks'

function removeDeletedWorkflows(
  projects: ProjectSummary[],
  summaries: WorkflowSummary[],
  deletions: Record<string, string>,
) {
  projects.forEach((project) => {
    // 只有同一项目快照的嵌入成员能证明该计数包含目标，不能借另一条 GET 的旧 summary 重复扣数。
    const removedIds = new Set(project.workflows.filter((workflow) => workflow.id in deletions).map((workflow) => workflow.id))
    project.workflows = project.workflows.filter((workflow) => !(workflow.id in deletions))
    if (removedIds.size > 0) {
      project.workflowCount = Math.max(0, project.workflowCount - removedIds.size)
    }
  })
  return summaries.filter((workflow) => !(workflow.id in deletions))
}

function projectWorkflowLinksStorageKey() {
  const user = tokenManager.readSession()?.user as ({ userId?: unknown; id?: unknown } | undefined)
  return `${PROJECT_WORKFLOW_LINKS_STORAGE_KEY}.${String(user?.userId ?? user?.id ?? 'anonymous')}`
}

function readProjectWorkflowLinks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(projectWorkflowLinksStorageKey()) ?? '{}') as unknown
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
    localStorage.setItem(projectWorkflowLinksStorageKey(), JSON.stringify(links))
  } catch {
    // Project workflow links are convenience metadata; failed writes must not block backend CRUD.
  }
}

function linkedWorkflowIds(projectId: string) {
  return new Set(readProjectWorkflowLinks()[projectId] ?? [])
}

function projectWorkflowMatch(project: ProjectSummary, workflow: WorkflowSummary) {
  return workflow.projectId !== undefined && String(workflow.projectId) === String(project.id)
}

function inferredProjectWorkflows(project: ProjectSummary, workflows: WorkflowSummary[]) {
  const explicitProjectWorkflows = workflows.filter((workflow) => projectWorkflowMatch(project, workflow))
  if (explicitProjectWorkflows.length > 0) {
    return explicitProjectWorkflows
  }

  const linkedIds = linkedWorkflowIds(project.id)
  return linkedIds.size > 0 ? workflows.filter((workflow) => linkedIds.has(workflow.id)) : project.workflows
}

function fileMatchesWorkflow(file: { workflowId?: string; workflowName?: string; objectKey?: string }, workflow: WorkflowSummary) {
  if (file.workflowId && String(file.workflowId) === String(workflow.id)) {
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
    return true
  })
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as ProjectSummary[],
    workflowSummaries: [] as WorkflowSummary[],
    deletingWorkflowIds: {} as Record<string, boolean>,
    workflowDeleteErrors: {} as Record<string, boolean>,
    workflowLoadDeletions: {} as Record<number, Record<string, string>>,
    currentProjectId: 'project-media-ops',
    loading: false,
    loadError: null as string | null,
    loadRequestId: 0,
    workflowRenameRequestIds: {} as Record<string, number>,
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
      const runs = runStore.runs.filter((run) => workflowIds.has(run.workflowId))
      const knowledgeCount = project.knowledgeCount > 0
        ? project.knowledgeCount
        : 0
      const files = fileStore.files.filter((file) => {
        if (workflows.some((workflow) => fileMatchesWorkflow(file, workflow))) {
          return true
        }
        if (fileMatchesProjectRun(file, runs)) {
          return true
        }
        return false
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
      const requestId = ++this.loadRequestId
      const isCurrent = () => this.loadRequestId === requestId
      this.loading = true
      this.loadError = null
      this.workflowLoadDeletions[requestId] = {}
      let projectsReadSucceeded = false
      try {
        const [projectsResult, workflowsResult] = await Promise.allSettled([
          projectApi.listProjects(),
          workflowApi.listWorkflows(),
        ])
        projectsReadSucceeded = projectsResult.status === 'fulfilled'
        if (!isCurrent()) {
          return
        }
        if (projectsResult.status === 'rejected') {
          const error = toApiError(projectsResult.reason, 'workflow')
          this.loadError = error.status ? `HTTP ${error.status} · ${error.message}` : error.message
          throw projectsResult.reason
        }
        this.projects = projectsResult.value
        this.workflowSummaries = workflowsResult.status === 'fulfilled' ? workflowsResult.value : []
        if (workflowsResult.status === 'rejected') {
          this.loadError = i18n.global.t('projects.workflowLoadWarning')
        }
        this.currentProjectId = this.currentProjectId || this.projects[0]?.id || 'project-media-ops'
      } finally {
        if (isCurrent()) {
          // 只剔除本次联合读取等待期间确认删除的条目；后续读取仍以服务端为准。
          if (projectsReadSucceeded) {
            this.workflowSummaries = removeDeletedWorkflows(this.projects, this.workflowSummaries, this.workflowLoadDeletions[requestId] ?? {})
          }
          this.loading = false
        }
        delete this.workflowLoadDeletions[requestId]
      }
    },
    async refreshProjects() {
      const requestId = ++this.loadRequestId
      const isCurrent = () => this.loadRequestId === requestId
      this.loading = true
      this.loadError = null
      this.workflowLoadDeletions[requestId] = {}
      let projectsReadSucceeded = false
      try {
        const [projectsResult, workflowsResult] = await Promise.allSettled([
          projectApi.listProjects(),
          workflowApi.listWorkflows(),
        ])
        projectsReadSucceeded = projectsResult.status === 'fulfilled'
        if (!isCurrent()) {
          return
        }
        if (projectsResult.status === 'rejected') {
          const error = toApiError(projectsResult.reason, 'workflow')
          this.loadError = error.status ? `HTTP ${error.status} · ${error.message}` : error.message
          throw projectsResult.reason
        }
        this.projects = projectsResult.value
        this.workflowSummaries = workflowsResult.status === 'fulfilled' ? workflowsResult.value : []
        if (workflowsResult.status === 'rejected') {
          this.loadError = i18n.global.t('projects.workflowLoadWarning')
        }
        this.currentProjectId = this.projects[0]?.id || ''
      } finally {
        if (isCurrent()) {
          // 只剔除本次联合读取等待期间确认删除的条目；后续读取仍以服务端为准。
          if (projectsReadSucceeded) {
            this.workflowSummaries = removeDeletedWorkflows(this.projects, this.workflowSummaries, this.workflowLoadDeletions[requestId] ?? {})
          }
          this.loading = false
        }
        delete this.workflowLoadDeletions[requestId]
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
      const now = formatDateTime(new Date())
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
      if (this.deletingWorkflowIds[workflowId]) return
      this.deletingWorkflowIds[workflowId] = true
      delete this.workflowDeleteErrors[workflowId]
      try {
        await workflowApi.deleteWorkflow(workflowId)
        // 与重命名恢复共用代次：确认删除后，旧重命名回执不能重新补回该行。
        this.workflowRenameRequestIds[workflowId] = (this.workflowRenameRequestIds[workflowId] ?? 0) + 1
        Object.values(this.workflowLoadDeletions).forEach((deletions) => {
          deletions[workflowId] = projectId
        })
        this.workflowSummaries = removeDeletedWorkflows(this.projects, this.workflowSummaries, { [workflowId]: projectId })
        this.unlinkWorkflowFromProject(projectId, workflowId)
      } catch (error) {
        this.workflowDeleteErrors[workflowId] = true
        throw error
      } finally {
        delete this.deletingWorkflowIds[workflowId]
      }
    },
    async createProject(payload: { name: string; scenario: ProjectSummary['scenario'] }) {
      const project = await projectApi.createProject({
        name: payload.name,
        scenario: payload.scenario,
        description: i18n.global.t('projects.projectDescription'),
      })
      this.projects = [...this.projects, project]
      return project
    },
  },
})
