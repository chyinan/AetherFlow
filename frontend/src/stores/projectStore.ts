import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { projectApi } from '@/services/api/projectApi'
import { workflowApi } from '@/services/api/workflowApi'
import type { ProjectSummary } from '@/types/project'
import type { WorkflowSummary } from '@/types/workflow'

import { useFileStore } from './fileStore'
import { useRunStore } from './runStore'

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as ProjectSummary[],
    currentProjectId: 'project-media-ops',
    loading: false,
  }),
  getters: {
    currentProject: (state) =>
      state.projects.find((project) => project.id === state.currentProjectId) ?? state.projects[0],
    projectMetrics: (state) => (projectId: string) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) {
        return null
      }
      const workflowIds = new Set(project.workflows.map((workflow) => workflow.id))
      const runStore = useRunStore()
      const fileStore = useFileStore()
      const runs = runStore.runs.filter((run) => workflowIds.has(run.workflowId))
      const files = fileStore.files.filter((file) => file.workflowId && workflowIds.has(file.workflowId))
      const hasRuntimeRuns = runStore.runs.length > 0
      const hasRuntimeFiles = fileStore.files.length > 0
      return {
        workflowCount: project.workflows.length,
        activeRunCount: hasRuntimeRuns
          ? runs.filter((run) => ['queued', 'running'].includes(run.status)).length
          : project.activeRunCount,
        fileCount: hasRuntimeFiles ? files.length : project.fileCount,
        queueDepth: hasRuntimeRuns
          ? runs.filter((run) => ['queued', 'running'].includes(run.status)).length
          : project.queueDepth,
        knowledgeCount: project.knowledgeCount,
        lastRunStatus: runs[0]?.status ?? project.lastRunStatus,
      }
    },
  },
  actions: {
    async loadProjects() {
      if (this.projects.length > 0) {
        return
      }
      this.loading = true
      try {
        this.projects = await projectApi.listProjects()
        this.currentProjectId = this.currentProjectId || this.projects[0]?.id || 'project-media-ops'
      } finally {
        this.loading = false
      }
    },
    selectProject(projectId: string) {
      this.currentProjectId = projectId
    },
    selectProjectByWorkflow(workflowId: string) {
      const project = this.projects.find((item) => item.workflows.some((workflow) => workflow.id === workflowId))
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
    },
    createMockProject(payload: { name: string; scenario: ProjectSummary['scenario'] }) {
      const id = `project-${Date.now()}`
      const workflowId = `wf-${payload.scenario}-${Date.now()}`
      const project: ProjectSummary = {
        id,
        name: payload.name,
        description: i18n.global.t('projects.mockProjectDescription'),
        owner: 'aether.operator',
        environment: 'dev',
        health: 'idle',
        scenario: payload.scenario,
        slaTarget: '< 10 min',
        queueDepth: 0,
        knowledgeCount: 0,
        lastRunStatus: 'paused',
        workflowCount: 1,
        activeRunCount: 0,
        fileCount: 0,
        updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        workflows: [
          {
            id: workflowId,
            name: `${payload.name} ${i18n.global.t('projects.workflowSuffix')}`,
            status: 'draft',
            updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          },
        ],
      }
      this.projects = [project, ...this.projects]
      this.currentProjectId = id
      workflowApi.registerWorkflowDefinition(workflowId, project.workflows[0].name)
      return project
    },
  },
})
