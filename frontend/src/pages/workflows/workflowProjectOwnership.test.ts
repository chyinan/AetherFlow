// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'

import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))

vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn().mockResolvedValue(null),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function project(id: string, workflowIds: string[] = []): ProjectSummary {
  return {
    id, name: `P${id}`, description: '', owner: 'tester', environment: 'dev', health: 'idle',
    scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
    workflowCount: workflowIds.length, activeRunCount: 0, fileCount: 0, updatedAt: '',
    workflows: workflowIds.map((workflowId) => ({
      id: workflowId, name: `W${workflowId}`, status: 'draft' as const, updatedAt: '',
    })),
  }
}

const definitions: Record<string, any> = {
  '101': { id: 101, name: 'A', version: 1, projectId: 11, definitionJson: JSON.stringify({ nodes: [] }) },
  '202': { id: 202, name: 'B', version: 1, projectId: 22, definitionJson: JSON.stringify({ nodes: [] }) },
}

let wrapper: ReturnType<typeof mount> | undefined
let projectRequests: Array<ReturnType<typeof deferred<void>>> = []
let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  projectRequests = []
  definitions['101'] = { id: 101, name: 'A', version: 1, projectId: 11, definitionJson: JSON.stringify({ nodes: [] }) }
  definitions['202'] = { id: 202, name: 'B', version: 1, projectId: 22, definitionJson: JSON.stringify({ nodes: [] }) }
  http.get.mockImplementation(async (url: string) => {
    const match = /\/workflows\/definitions\/(\d+)/.exec(url)
    if (match && definitions[match[1]!]) return JSON.parse(JSON.stringify(definitions[match[1]!]))
    throw new Error('Unexpected GET ' + url)
  })
  const write = async (url: string, payload: any) => {
    const match = /\/workflows\/definitions\/(\d+)/.exec(url)
    const id = match ? Number(match[1]) : 201
    definitions[String(id)] = { id, name: payload.name, projectId: payload.projectId, version: 2, definitionJson: JSON.stringify(payload) }
    return JSON.parse(JSON.stringify(definitions[String(id)]))
  }
  http.post.mockImplementation(write)
  http.put.mockImplementation(write)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

async function setup(initialPath = '/workflows/101?projectId=11') {
  pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const projects = useProjectStore()
  projects.projects = [project('11', ['101']), project('22', ['202'])]
  projects.workflowSummaries = []
  vi.spyOn(projects, 'loadProjects').mockImplementation(() => {
    const request = deferred<void>()
    projectRequests.push(request)
    return request.promise
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/workflows/:id', component: WorkflowPage },
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
  return { store, projects, router }
}

function saveButton() {
  const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map((key) => i18n.global.t(key))
  return wrapper!.findAll('button').find((button) => labels.includes(button.text()))!
}

describe('工作流初始化的项目归属与迟到请求隔离', () => {
  it('旧页面迟到的项目请求不会重选项目', async () => {
    const { projects, router } = await setup('/workflows/101?projectId=11')
    expect(projectRequests).toHaveLength(1)

    // A 页面离开，回到首页后从工作台打开项目 22 的工作流 B。
    await router.push('/')
    await flushPromises()
    await router.push('/workflows/202')
    await flushPromises()
    projectRequests[1]!.resolve()
    await flushPromises()
    expect(projects.currentProjectId).toBe('22')

    // A 的项目请求最后才返回，旧的异步收尾不能污染当前项目。
    projectRequests[0]!.resolve()
    await flushPromises()
    expect(projects.currentProjectId).toBe('22')
  })

  it('旧页面迟到完成后保存仍使用工作流自身的项目', async () => {
    const { projects, router } = await setup('/workflows/101?projectId=11')
    await router.push('/')
    await flushPromises()
    await router.push('/workflows/202')
    await flushPromises()
    projectRequests[1]!.resolve()
    await flushPromises()
    projectRequests[0]!.resolve()
    await flushPromises()

    await saveButton().trigger('click')
    await flushPromises()

    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.put.mock.calls[0]![1].projectId).toBe(22)
    expect(projects.currentProjectId).toBe('22')
  })

  it('全局项目选择变化后保存不会把工作流改挂到别的项目', async () => {
    const { projects } = await setup('/workflows/202')
    projectRequests[0]!.resolve()
    await flushPromises()
    expect(projects.currentProjectId).toBe('22')

    // 用户随后在别的项目里浏览，全局选择变化，但当前工作流仍属于项目 22。
    projects.currentProjectId = '11'
    await saveButton().trigger('click')
    await flushPromises()

    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.put.mock.calls[0]![1].projectId).toBe(22)
  })

  it('旧页面先于新页面返回时同样不能污染当前项目', async () => {
    const { projects, router } = await setup('/workflows/101?projectId=11')
    await router.push('/')
    await flushPromises()
    await router.push('/workflows/202')
    await flushPromises()

    // 逆序返回：A 的旧请求先完成，B 的项目列表后完成。
    projectRequests[0]!.resolve()
    await flushPromises()
    expect(projects.currentProjectId).not.toBe('11')

    projectRequests[1]!.resolve()
    await flushPromises()
    expect(projects.currentProjectId).toBe('22')
  })

  it('同一组件内切换工作流时旧加载不会污染新工作流', async () => {
    const { store, projects, router } = await setup('/workflows/101?projectId=11')
    await router.push('/workflows/202')
    await flushPromises()
    projectRequests[1]?.resolve()
    await flushPromises()
    expect(store.workflowId).toBe('202')

    projectRequests[0]!.resolve()
    await flushPromises()

    expect(projects.currentProjectId).toBe('22')
    expect(store.workflowId).toBe('202')
  })

  it('旧请求失败不会覆盖新页面的错误信息', async () => {
    const { store, projects, router } = await setup('/workflows/101?projectId=11')
    await router.push('/')
    await flushPromises()
    await router.push('/workflows/202')
    await flushPromises()
    projectRequests[1]!.resolve()
    await flushPromises()

    projectRequests[0]!.reject(new Error('stale project failure'))
    await flushPromises()

    expect(store.loadingError).toBeFalsy()
    expect(projects.currentProjectId).toBe('22')
  })

  it('页面卸载后旧请求不再写入项目或错误信息', async () => {
    const { store, projects, router } = await setup('/workflows/101?projectId=11')
    await router.push('/')
    await flushPromises()

    projectRequests[0]!.resolve()
    await flushPromises()

    expect(projects.currentProjectId).not.toBe('11')
    expect(store.loadingError).toBeFalsy()
  })

  it('正常首次加载仍按工作流归属选择项目', async () => {
    const { projects } = await setup('/workflows/202')
    projectRequests[0]!.resolve()
    await flushPromises()

    expect(projects.currentProjectId).toBe('22')
  })

  it('地址栏显式指定项目时仍然按指定项目保存', async () => {
    const { projects } = await setup('/workflows/101?projectId=11')
    projectRequests[0]!.resolve()
    await flushPromises()
    expect(projects.currentProjectId).toBe('11')

    await saveButton().trigger('click')
    await flushPromises()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.put.mock.calls[0]![1].projectId).toBe(11)
  })

  it('新建工作流仍然保存到当前选择的项目', async () => {
    const { projects } = await setup('/workflows/new?name=新流程')
    projectRequests[0]!.resolve()
    await flushPromises()
    projects.currentProjectId = '11'

    await saveButton().trigger('click')
    await flushPromises()

    expect(http.post).toHaveBeenCalledTimes(1)
    expect(http.post.mock.calls[0]![1].projectId).toBe(11)
  })
})
