// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'
import { nodeTemplates } from '@/services/mock/workflowMock'

import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({
  apiClient: http,
  setUnauthorizedSessionRefresher: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function project(id: string, workflowIds: string[] = []): ProjectSummary {
  return {
    id, name: `项目${id}`, description: '', owner: 'tester', environment: 'dev', health: 'idle',
    scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
    workflowCount: workflowIds.length, activeRunCount: 0, fileCount: 0, updatedAt: '',
    workflows: workflowIds.map((workflowId) => ({
      id: workflowId, name: `工作流${workflowId}`, status: 'draft', updatedAt: '',
    })),
  }
}

function definition(id: string, projectId?: number) {
  return {
    id: Number(id), name: `工作流${id}`, ...(projectId !== undefined ? { projectId } : {}), version: 1,
    definitionJson: JSON.stringify({ nodes: [], edges: [] }),
  }
}

function defaultResponse(url: string) {
  if (url === '/projects') return Promise.resolve({ records: [project('11', ['101']), project('22', ['202'])], total: 2 })
  if (url === '/workflows/definitions') return Promise.resolve([])
  const workflowMatch = /\/workflows\/definitions\/(\d+)$/.exec(url)
  if (workflowMatch) return Promise.resolve(definition(workflowMatch[1]!, workflowMatch[1] === '202' ? 22 : 11))
  return Promise.reject(new Error(`Unexpected GET ${url}`))
}

let wrapper: ReturnType<typeof mount> | undefined
let router: ReturnType<typeof createRouter> | undefined

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  http.get.mockImplementation((url: string) => defaultResponse(url))
  http.post.mockReset()
  http.put.mockReset()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  router = undefined
  vi.restoreAllMocks()
})

async function setup(
  initialPath = '/workflows/101?projectId=11',
  initialProjects = [project('11', ['101']), project('22', ['202'])],
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const workflowStore = useWorkflowStore()
  vi.spyOn(workflowStore, 'loadNodeTemplates').mockResolvedValue(true)
  const projectStore = useProjectStore()
  projectStore.projects = initialProjects
  projectStore.currentProjectId = initialPath.includes('projectId=22') ? '22' : initialPath.includes('projectId=11') ? '11' : ''
  const runStore = useRunStore()
  vi.spyOn(runStore, 'loadRuns').mockResolvedValue(undefined)
  vi.spyOn(runStore, 'selectRunForWorkflow').mockResolvedValue(null)
  vi.spyOn(runStore, 'subscribeCurrentRun').mockImplementation(() => undefined)
  vi.spyOn(runStore, 'clearCurrentRun').mockImplementation(() => undefined)
  vi.spyOn(useFileStore(), 'loadFiles').mockResolvedValue(undefined)

  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workflows/:id', component: WorkflowPage },
      { path: '/other', component: { template: '<p>其他页面</p>' } },
    ],
  })
  await router.push(initialPath)
  await router.isReady()
  wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
    },
  })
  await flushPromises()
  return { workflowStore, projectStore, runStore, router }
}

function workflowGetCount() {
  return http.get.mock.calls.filter(([url]) => /^\/workflows\/definitions\/\d+$/.test(url)).length
}

describe('工作流打开错误与项目目录错误分别归属', () => {
  it('项目目录失败时保留成功加载的画布，并显示独立项目重试', async () => {
    const projectRequest = deferred<unknown>()
    http.get.mockImplementation((url: string) => url === '/projects' ? projectRequest.promise : defaultResponse(url))
    const { workflowStore, projectStore } = await setup()

    expect(workflowStore.workflowName).toBe('工作流101')
    expect(workflowStore.loadingError).toBeFalsy()
    projectRequest.reject(new Error('项目列表暂不可用'))
    await flushPromises()

    expect(workflowStore.workflowId).toBe('101')
    expect(workflowStore.projectId).toBe(11)
    expect(workflowStore.nodes).toEqual([])
    expect(projectStore.currentProjectId).toBe('11')
    expect(workflowStore.loadingError).toBeFalsy()
    expect(projectStore.loadError).toContain('项目列表暂不可用')
    expect(wrapper!.find('[data-testid="workflow-editor"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="project-list-load-error"]').exists()).toBe(true)
  })

  it('无查询参数的深链接在项目目录仍未载入或失败时保留工作流响应中的项目 ID', async () => {
    const projectRequest = deferred<unknown>()
    http.get.mockImplementation((url: string) => url === '/projects' ? projectRequest.promise : defaultResponse(url))
    const { workflowStore, projectStore } = await setup('/workflows/101', [])

    expect(workflowStore.workflowId).toBe('101')
    expect(workflowStore.projectId).toBe(11)
    expect(projectStore.currentProjectId).toBe('11')
    projectRequest.reject(new Error('项目列表暂不可用'))
    await flushPromises()

    expect(workflowStore.loadingError).toBeFalsy()
    expect(projectStore.currentProjectId).toBe('11')
    expect(wrapper!.find('[data-testid="workflow-editor"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="project-list-load-error"]').exists()).toBe(true)
  })

  it('详情没有项目 ID 时，目录失败后重试会按现有工作流关联恢复选择', async () => {
    const firstProjectRequest = deferred<unknown>()
    const retryProjectRequest = deferred<unknown>()
    let projectReadCount = 0
    http.get.mockImplementation((url: string) => {
      if (url === '/projects') {
        projectReadCount += 1
        return projectReadCount === 1 ? firstProjectRequest.promise : retryProjectRequest.promise
      }
      if (url === '/workflows/definitions/101') return Promise.resolve(definition('101'))
      return defaultResponse(url)
    })
    const { workflowStore, projectStore } = await setup('/workflows/101', [])

    expect(workflowStore.projectId).toBeNull()
    expect(projectStore.currentProjectId).toBe('')
    firstProjectRequest.reject(new Error('项目目录连接失败'))
    await flushPromises()
    expect(wrapper!.find('[data-testid="project-list-load-error"]').exists()).toBe(true)

    await wrapper!.get('[data-testid="retry-project-list"]').trigger('click')
    expect(projectReadCount).toBe(2)
    retryProjectRequest.resolve({ records: [project('22'), project('11', ['101'])], total: 2 })
    await flushPromises()

    expect(workflowStore.loadingError).toBeFalsy()
    expect(workflowStore.workflowId).toBe('101')
    expect(projectStore.currentProjectId).toBe('11')
    expect(wrapper!.find('[data-testid="project-list-load-error"]').exists()).toBe(false)
  })

  it('项目重试只重读项目列表，保留画布、未保存编辑和工作流请求次数', async () => {
    const firstProjectRequest = deferred<unknown>()
    const secondProjectRequest = deferred<unknown>()
    let projectReadCount = 0
    http.get.mockImplementation((url: string) => {
      if (url === '/projects') {
        projectReadCount += 1
        return projectReadCount === 1 ? firstProjectRequest.promise : secondProjectRequest.promise
      }
      return defaultResponse(url)
    })
    const { workflowStore, projectStore } = await setup()
    firstProjectRequest.reject(new Error('项目目录连接失败'))
    await flushPromises()

    const startTemplate = nodeTemplates.find((template) => template.kind === 'start')!
    expect(workflowStore.addNodeFromTemplate(startTemplate, { x: 30, y: 40 })).toBeTruthy()
    const beforeRetry = JSON.stringify({
      workflowId: workflowStore.workflowId,
      name: workflowStore.workflowName,
      projectId: workflowStore.projectId,
      nodes: workflowStore.nodes,
      edges: workflowStore.edges,
      dirty: workflowStore.dirty,
      editRevision: workflowStore.editRevision,
      historyPast: workflowStore.historyPast,
      historyFuture: workflowStore.historyFuture,
    })
    const getCountBeforeRetry = workflowGetCount()
    const retry = wrapper!.get('[data-testid="retry-project-list"]')
    await retry.trigger('click')
    expect(projectReadCount).toBe(2)
    expect(retry.attributes('disabled')).toBeDefined()
    await retry.trigger('click')
    expect(projectReadCount).toBe(2)

    secondProjectRequest.resolve({ records: [project('11', ['101']), project('22', ['202'])], total: 2 })
    await flushPromises()

    expect(workflowGetCount()).toBe(getCountBeforeRetry)
    expect(workflowStore.loadingError).toBeFalsy()
    expect(projectStore.loadError).toBeNull()
    expect(projectStore.currentProjectId).toBe('11')
    expect(JSON.stringify({
      workflowId: workflowStore.workflowId,
      name: workflowStore.workflowName,
      projectId: workflowStore.projectId,
      nodes: workflowStore.nodes,
      edges: workflowStore.edges,
      dirty: workflowStore.dirty,
      editRevision: workflowStore.editRevision,
      historyPast: workflowStore.historyPast,
      historyFuture: workflowStore.historyFuture,
    })).toBe(beforeRetry)
    expect(wrapper!.find('[data-testid="project-list-load-error"]').exists()).toBe(false)
  })

  it('工作流 GET 失败仍显示工作流错误并由原按钮仅重试工作流', async () => {
    let workflowReadCount = 0
    let projectReadCount = 0
    http.get.mockImplementation((url: string) => {
      if (url === '/projects') {
        projectReadCount += 1
        return defaultResponse(url)
      }
      if (url === '/workflows/definitions/101') {
        workflowReadCount += 1
        return workflowReadCount === 1 ? Promise.reject(new Error('工作流 GET 暂不可用')) : defaultResponse(url)
      }
      return defaultResponse(url)
    })
    const { workflowStore } = await setup()

    expect(workflowStore.loadingError).toContain('工作流 GET 暂不可用')
    expect(wrapper!.find('[data-testid="project-list-load-error"]').exists()).toBe(false)
    await wrapper!.get('[data-testid="retry-workflow-load"]').trigger('click')
    await flushPromises()

    expect(workflowReadCount).toBe(2)
    expect(projectReadCount).toBe(1)
    expect(workflowStore.loadingError).toBeNull()
    expect(workflowStore.workflowName).toBe('工作流101')
    expect(wrapper!.find('[data-testid="workflow-editor"]').exists()).toBe(true)
  })

  it('切换工作流后项目目录迟到失败不会覆盖当前工作流或其项目归属', async () => {
    const projectRequest = deferred<unknown>()
    http.get.mockImplementation((url: string) => url === '/projects' ? projectRequest.promise : defaultResponse(url))
    const { workflowStore, projectStore, router: testRouter } = await setup()
    await testRouter.push('/workflows/202?projectId=22')
    await flushPromises()
    projectRequest.reject(new Error('旧项目目录请求失败'))
    await flushPromises()

    expect(workflowStore.workflowId).toBe('202')
    expect(workflowStore.loadingError).toBeFalsy()
    expect(projectStore.currentProjectId).toBe('22')
    expect(workflowStore.projectId).toBe(22)
    expect(wrapper!.find('[data-testid="workflow-editor"]').exists()).toBe(true)
  })

  it('离开后重新打开的当前页不接收旧项目读取，旧失败也不覆盖新列表结果', async () => {
    const oldProjectRequest = deferred<unknown>()
    const currentProjectRequest = deferred<unknown>()
    let projectReadCount = 0
    http.get.mockImplementation((url: string) => {
      if (url === '/projects') {
        projectReadCount += 1
        return projectReadCount === 1 ? oldProjectRequest.promise : currentProjectRequest.promise
      }
      return defaultResponse(url)
    })
    const { workflowStore, projectStore, router: testRouter } = await setup()

    await testRouter.push('/other')
    await flushPromises()
    await testRouter.push('/workflows/202?projectId=22')
    await flushPromises()
    currentProjectRequest.resolve({ records: [project('11', ['101']), project('22', ['202'])], total: 2 })
    await flushPromises()
    oldProjectRequest.reject(new Error('旧页面项目列表失败'))
    await flushPromises()

    expect(workflowStore.workflowId).toBe('202')
    expect(workflowStore.loadingError).toBeFalsy()
    expect(workflowStore.projectId).toBe(22)
    expect(projectStore.currentProjectId).toBe('22')
    expect(projectStore.loadError).toBeNull()
    expect(wrapper!.find('[data-testid="project-list-load-error"]').exists()).toBe(false)
  })

  it('卸载后迟到的项目目录失败不创建工作流错误', async () => {
    const projectRequest = deferred<unknown>()
    http.get.mockImplementation((url: string) => url === '/projects' ? projectRequest.promise : defaultResponse(url))
    const { workflowStore, router: testRouter } = await setup()
    await testRouter.push('/other')
    await flushPromises()
    projectRequest.reject(new Error('卸载后的项目目录失败'))
    await flushPromises()

    expect(workflowStore.loadingError).toBeFalsy()
    expect(wrapper!.text()).toContain('其他页面')
  })
})
