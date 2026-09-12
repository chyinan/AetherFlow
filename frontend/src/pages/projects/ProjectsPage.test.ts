// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  projectStore: {
    projects: [] as Array<Record<string, unknown>>,
    workflowSummaries: [] as Array<Record<string, unknown>>,
    currentProjectId: '',
    loading: false,
    loadError: null as string | null,
    loadProjects: vi.fn(),
    projectWorkflows: vi.fn(() => []),
    projectMetrics: vi.fn(() => null),
    selectProject: vi.fn(),
    createProject: vi.fn(),
    renameProjectWorkflow: vi.fn(),
    deleteProjectWorkflow: vi.fn(),
    linkWorkflowToProject: vi.fn(),
  },
  runStore: { loadRuns: vi.fn() },
  fileStore: { loadFiles: vi.fn(), files: [] },
  difyStore: { loadSurface: vi.fn() },
  router: { push: vi.fn() },
}))

vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => mocks.projectStore }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => mocks.runStore }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => mocks.fileStore }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => mocks.difyStore }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }))

import { i18n } from '@/i18n'
import ProjectsPage from './ProjectsPage.vue'

function project() {
  return {
    id: 'project-1',
    name: '媒体项目',
    description: '项目描述',
    health: 'idle',
    environment: 'dev',
    scenario: 'media',
    owner: 'operator',
    slaTarget: '99%',
    workflowCount: 0,
    activeRunCount: 0,
    fileCount: 0,
    queueDepth: 0,
    knowledgeCount: 0,
    lastRunStatus: 'idle',
    workflows: [],
  }
}

describe('ProjectsPage empty states', () => {
  beforeEach(() => {
    mocks.projectStore.projects = []
    mocks.projectStore.workflowSummaries = []
    mocks.projectStore.currentProjectId = ''
    mocks.projectStore.loading = false
    mocks.projectStore.loadError = null
    mocks.projectStore.loadProjects.mockReset().mockResolvedValue(undefined)
    mocks.runStore.loadRuns.mockReset().mockResolvedValue(undefined)
    mocks.fileStore.loadFiles.mockReset().mockResolvedValue(undefined)
    mocks.difyStore.loadSurface.mockReset().mockResolvedValue(undefined)
    mocks.projectStore.projectWorkflows.mockReset().mockReturnValue([])
  })

  it('explains that no project exists and offers project creation', async () => {
    const wrapper = mount(ProjectsPage, {
      global: {
        plugins: [i18n],
        stubs: { StatusBadge: true },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-state="no-projects"]').text()).toContain('尚未创建项目')
    expect(wrapper.find('[data-action="create-project"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('explains that a project has no workflow and offers workflow creation', async () => {
    mocks.projectStore.projects = [project()]

    const wrapper = mount(ProjectsPage, {
      global: {
        plugins: [i18n],
        stubs: { StatusBadge: true },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-state="no-workflows"]').text()).toContain('尚未创建工作流')
    expect(wrapper.find('[data-action="create-first-workflow"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
