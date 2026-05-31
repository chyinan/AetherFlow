import { apiClient } from '@/api/client/apiClient'
import type { ProjectHealth, ProjectSummary } from '@/types/project'

interface PageResult<T> {
  records?: T[]
}

interface ProjectSummaryResponse {
  id?: string
  name?: string
  description?: string
  owner?: string
  environment?: string
  health?: string
  scenario?: string
  slaTarget?: string
  queueDepth?: number
  knowledgeCount?: number
  lastRunStatus?: string
  workflowCount?: number
  activeRunCount?: number
  fileCount?: number
  updatedAt?: string
  workflows?: Array<{
    id?: string
    name?: string
    status?: string
    updatedAt?: string
  }>
}

interface CreateProjectPayload {
  name: string
  scenario: ProjectSummary['scenario']
  description?: string
}

const healthValues: ProjectHealth[] = ['healthy', 'attention', 'idle']
const scenarioValues: ProjectSummary['scenario'][] = ['media', 'document', 'knowledge', 'support']
const runStatusValues: ProjectSummary['lastRunStatus'][] = ['queued', 'running', 'success', 'failed', 'paused']
const workflowStatusValues: ProjectSummary['workflows'][number]['status'][] = ['draft', 'ready', 'running']

function stringOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberOr(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T) {
  return typeof value === 'string' && options.includes(value as T) ? value as T : fallback
}

function formatDateTime(value?: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', { hour12: false })
}

function mapProject(project: ProjectSummaryResponse): ProjectSummary {
  const id = stringOr(project.id, 'project-unknown')
  const workflows = Array.isArray(project.workflows) ? project.workflows : []

  return {
    id,
    name: stringOr(project.name, 'Untitled project'),
    description: stringOr(project.description, ''),
    owner: stringOr(project.owner, 'aether.operator'),
    environment: oneOf(project.environment, ['dev', 'staging', 'prod'] as const, 'dev'),
    health: oneOf(project.health, healthValues, 'idle'),
    scenario: oneOf(project.scenario, scenarioValues, 'media'),
    slaTarget: stringOr(project.slaTarget, '-'),
    queueDepth: numberOr(project.queueDepth),
    knowledgeCount: numberOr(project.knowledgeCount),
    lastRunStatus: oneOf(project.lastRunStatus, runStatusValues, 'paused'),
    workflowCount: numberOr(project.workflowCount, workflows.length),
    activeRunCount: numberOr(project.activeRunCount),
    fileCount: numberOr(project.fileCount),
    updatedAt: formatDateTime(project.updatedAt),
    workflows: workflows.map((workflow, index) => ({
      id: stringOr(workflow.id, `${id}-workflow-${index + 1}`),
      name: stringOr(workflow.name, 'Untitled workflow'),
      status: oneOf(workflow.status, workflowStatusValues, 'draft'),
      updatedAt: formatDateTime(workflow.updatedAt),
    })),
  }
}

export const projectApi = {
  async listProjects() {
    const page = await apiClient.get<PageResult<ProjectSummaryResponse>>('/projects', {
      params: { page: 1, size: 100 },
      source: 'workflow',
    })
    return (page.records ?? []).map(mapProject)
  },
  async getProject(projectId: string) {
    const project = await apiClient.get<ProjectSummaryResponse>(
      `/projects/${encodeURIComponent(projectId)}`,
      { source: 'workflow' },
    )
    return mapProject(project)
  },
  async createProject(payload: CreateProjectPayload) {
    const project = await apiClient.post<ProjectSummaryResponse>(
      '/projects',
      {
        name: payload.name,
        description: payload.description ?? '',
        scenario: payload.scenario,
        environment: 'dev',
        health: 'idle',
        ownerName: 'aether.operator',
        slaTarget: '< 10 min',
        queueDepth: 0,
        knowledgeCount: 0,
        lastRunStatus: 'paused',
        workflowCount: 0,
        activeRunCount: 0,
        fileCount: 0,
      },
      { source: 'workflow' },
    )
    return mapProject(project)
  },
}
