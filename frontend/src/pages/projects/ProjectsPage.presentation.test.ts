// @vitest-environment jsdom
// 仅验证单一正常用户页面夹具的信息层级；所有数据读取为内存替身。
// jsdom 的原生 details 点击与程序化焦点不等同于真实浏览器键盘或视觉验收。
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { ProjectSummary } from '@/types/project'

const mocks = vi.hoisted(() => ({
  projectStore: {
    projects: [] as ProjectSummary[],
    workflowSummaries: [] as ProjectSummary['workflows'],
    deletingWorkflowIds: {} as Record<string, boolean>,
    workflowDeleteErrors: {} as Record<string, boolean>,
    currentProjectId: 'presentation-project',
    loading: false,
    loadError: null as string | null,
    loadProjects: vi.fn(),
    projectWorkflows: vi.fn(),
    projectMetrics: vi.fn(() => null),
    selectProject: vi.fn(),
    createProject: vi.fn(),
    renameProjectWorkflow: vi.fn(),
    deleteProjectWorkflow: vi.fn(),
  },
  runStore: { loadRuns: vi.fn() },
  fileStore: { loadFiles: vi.fn() },
  difyStore: { loadSurface: vi.fn() },
}))

vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => mocks.projectStore }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => mocks.runStore }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => mocks.fileStore }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => mocks.difyStore }))

import { i18n } from '@/i18n'
import ProjectsPage from './ProjectsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
const message = (key: string) => i18n.global.t(`projects.${key}`)
const compact = (value: string) => value.replace(/\s+/g, '')

function project(queueDepth = 0): ProjectSummary {
  return {
    id: 'presentation-project',
    name: '常规项目',
    description: '用于页面层级审查的常规项目',
    owner: '常规项目负责人',
    environment: 'dev',
    health: 'healthy',
    scenario: 'media',
    slaTarget: '99.5%',
    queueDepth,
    knowledgeCount: 7,
    lastRunStatus: 'success',
    workflowCount: 2,
    activeRunCount: 3,
    fileCount: 12,
    updatedAt: '2026-10-17 09:00',
    workflows: [
      { id: 'presentation-workflow-a', name: '主工作流', status: 'ready', updatedAt: '2026-10-17 08:00' },
      { id: 'presentation-workflow-b', name: '准备中的工作流', status: 'draft', updatedAt: '2026-10-17 07:00' },
    ],
  }
}

async function renderPage(queueDepth = 0) {
  mocks.projectStore.projects = [project(queueDepth)]
  mocks.projectStore.workflowSummaries = mocks.projectStore.projects[0]!.workflows
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/workflows/:id', component: { template: '<div />' } },
  ] })
  await router.push('/projects')
  await router.isReady()
  wrapper = mount(ProjectsPage, { attachTo: document.body, global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN'
  mocks.projectStore.projects = []
  mocks.projectStore.workflowSummaries = []
  mocks.projectStore.currentProjectId = 'presentation-project'
  mocks.projectStore.loadError = null
  mocks.projectStore.loading = false
  mocks.projectStore.loadProjects.mockResolvedValue(undefined)
  mocks.runStore.loadRuns.mockResolvedValue(undefined)
  mocks.fileStore.loadFiles.mockResolvedValue(undefined)
  mocks.difyStore.loadSurface.mockResolvedValue(undefined)
  mocks.projectStore.projectMetrics.mockReturnValue(null)
  mocks.projectStore.projectWorkflows.mockImplementation((projectId: string) => (
    mocks.projectStore.projects.find(item => item.id === projectId)?.workflows ?? []
  ))
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('页面呈现测试禁止真实网络请求') }))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
  i18n.global.locale.value = 'zh-CN'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('默认卡片保留项目与工作流主任务，次要元信息进入原生详情', async () => {
  const page = await renderPage()
  const card = page.get('article')
  const details = card.get<HTMLDetailsElement>('details[data-section="project-details"]')
  const summary = card.get('[data-section="project-summary"]')
  const primaryContent = card.element.cloneNode(true) as HTMLElement
  primaryContent.querySelector('details')?.remove()

  expect(details.element.open).toBe(false)
  expect(details.element.firstElementChild?.tagName).toBe('SUMMARY')
  expect(details.get('summary').text()).toBe('项目详情')
  expect(primaryContent.textContent).toContain('常规项目')
  expect(primaryContent.textContent).toContain(message('health.healthy'))
  expect(summary.text()).toContain(message('env'))
  expect(summary.text()).toContain(i18n.global.t('settings.environmentOptions.dev'))
  expect(compact(summary.text())).toContain(`${compact(message('activeRuns'))}3`)
  expect(summary.text()).toContain(message('lastRun'))
  expect(card.findAll('a[href^="/workflows/"]')).toHaveLength(2)
  expect(card.get('a[href="/workflows/presentation-workflow-a"]').element.closest('details')).toBeNull()
  expect(card.findAll('button').some(button => button.text() === message('newWorkflow'))).toBe(true)
  expect(primaryContent.textContent).not.toContain('常规项目负责人')
  expect(primaryContent.textContent).not.toContain('99.5%')
  for (const key of ['owner', 'scenario', 'sla', 'files', 'knowledgeBases', 'queueDepth']) {
    expect(details.text()).toContain(message(key))
  }
  expect(details.text()).toContain('常规项目负责人')
  expect(details.text()).toContain('99.5%')
})

it('默认摘要仅在队列非零时显示队列，详情仍保留完整指标', async () => {
  const emptyQueuePage = await renderPage(0)
  expect(emptyQueuePage.find('[data-metric="active-queue"]').exists()).toBe(false)
  expect(compact(emptyQueuePage.get('details').text())).toContain(`${compact(message('queueDepth'))}0`)
  wrapper!.unmount()
  wrapper = undefined

  const queuedPage = await renderPage(4)
  const activeQueue = queuedPage.get('[data-section="project-summary"] [data-metric="active-queue"]')
  expect(compact(activeQueue.text())).toBe(`${compact(message('queueDepth'))}4`)
  const details = queuedPage.get('details')
  expect(compact(details.text())).toContain(`${compact(message('queueDepth'))}4`)
  expect(compact(details.text())).toContain(`${compact(message('files'))}12`)
  expect(compact(details.text())).toContain(`${compact(message('knowledgeBases'))}7`)
  expect(queuedPage.get('a[href="/workflows/presentation-workflow-a"]').element.closest('details')).toBeNull()
})

it('中文和英文详情入口具名可聚焦，并保留展开内容的发现性', async () => {
  const page = await renderPage()
  const details = page.get<HTMLDetailsElement>('details[data-section="project-details"]')
  const summary = details.get<HTMLElement>('summary')
  summary.element.focus()
  expect(document.activeElement).toBe(summary.element)
  expect(summary.text()).toBe('项目详情')
  await summary.trigger('click')
  expect(details.element.open).toBe(true)
  expect(details.text()).toContain('常规项目负责人')
  await summary.trigger('click')
  expect(details.element.open).toBe(false)

  i18n.global.locale.value = 'en-US'
  await flushPromises()
  expect(summary.text()).toBe('Project details')
  expect(details.text()).toContain(message('owner'))
  expect(details.text()).toContain(message('knowledgeBases'))
  summary.element.focus()
  expect(document.activeElement).toBe(summary.element)
  await summary.trigger('click')
  expect(details.element.open).toBe(true)
  expect(page.get('article').findAll('a[href^="/workflows/"]')).toHaveLength(2)
  expect(page.get('article').findAll('button').some(button => button.text() === message('newWorkflow'))).toBe(true)
})
