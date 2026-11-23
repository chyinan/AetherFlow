// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type AxiosAdapter } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, createWebHistory, isNavigationFailure, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { WorkflowDefinitionDTO, WorkflowDefinitionEntity } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'
import WorkflowPage from './WorkflowPage.vue'

vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

function hold() {
  let resolve!: () => void
  const response = new Promise<void>(done => { resolve = done })
  return { response, resolve }
}

let wrapper: ReturnType<typeof mount> | undefined
let stopHistory: (() => void) | undefined
let nativeAdapter: typeof axiosInstance.defaults.adapter
let firstWrite: ReturnType<typeof hold>
let writes: Array<{ method: string; payload: WorkflowDefinitionDTO }>
let persisted: WorkflowDefinitionEntity
let reads: number
let rejectFirst: boolean

beforeEach(() => {
  localStorage.clear()
  nativeAdapter = axiosInstance.defaults.adapter
  firstWrite = hold()
  writes = []
  reads = 0
  rejectFirst = false
  persisted = { id: 201, name: '保存回执验证', projectId: 11, version: 1, definitionJson: '{"nodes":[]}', status: 'ENABLED' }

  // 实际页面、路由、工作流和项目 store；仅拦截 Axios 的传输边界。
  const adapter: AxiosAdapter = async config => {
    const { method, url } = config
    if (method === 'get' && url === '/workflows/definitions/201') {
      reads += 1
    } else if ((method === 'post' && url === '/workflows/definitions')
      || (method === 'put' && url === '/workflows/definitions/201')) {
      const payload: WorkflowDefinitionDTO = JSON.parse(config.data)
      writes.push({ method, payload })
      if (writes.length === 1) {
        await firstWrite.response
        if (rejectFirst) {
          throw new AxiosError('保存被拒绝', 'ERR_BAD_REQUEST', config, undefined, {
            data: { code: 422, message: '保存被拒绝' }, status: 422, statusText: 'Unprocessable Content', headers: {}, config,
          })
        }
      }
      persisted = { ...persisted, name: payload.name ?? '', version: method === 'post' ? 1 : persisted.version! + 1, definitionJson: JSON.stringify(payload) }
    } else {
      throw new Error(`非预期请求 ${method} ${url}`)
    }
    return { data: structuredClone(persisted), status: 200, statusText: 'OK', headers: {}, config }
  }
  axiosInstance.defaults.adapter = adapter
})

afterEach(() => {
  firstWrite.resolve()
  wrapper?.unmount()
  stopHistory?.()
  stopHistory = undefined
  wrapper = undefined
  axiosInstance.defaults.adapter = nativeAdapter
  vi.restoreAllMocks()
})

const project: ProjectSummary = {
  id: '11', name: '项目 11', description: '', owner: 'tester', environment: 'dev', health: 'idle',
  scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
  workflowCount: 0, activeRunCount: 0, fileCount: 0, updatedAt: '', workflows: [],
}

async function setup(id = '201', browserHistory = false) {
  if (browserHistory) window.history.replaceState(null, '', '/elsewhere')
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const projects = useProjectStore()
  projects.projects = [structuredClone(project)]
  vi.spyOn(projects, 'loadProjects').mockResolvedValue(undefined)
  const link = vi.spyOn(projects, 'linkWorkflowToProject')
  const status = vi.spyOn(projects, 'updateWorkflowStatus')
  const history = browserHistory ? createWebHistory() : createMemoryHistory()
  stopHistory = () => history.destroy()
  const router = createRouter({ history, routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/elsewhere', component: { template: '<div>目标页面</div>' } },
  ] })
  await router.push('/elsewhere')
  await router.push(`/workflows/${id}?projectId=11`)
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n],
    stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  const start = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })!
  const end = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'output')!, { x: 300, y: 0 })!
  store.addConnection({ source: start.id, target: end.id, sourceHandle: null, targetHandle: null })
  await flushPromises()
  return { store, router, start, link, status }
}

function dialog() {
  return wrapper!.get('[data-testid="unsaved-navigation-dialog"]')
}

async function saveFromToolbar() {
  await wrapper!.findAll('button').find(button => button.text() === i18n.global.t('workflow.saveWorkflow'))!.trigger('click')
  await flushPromises()
  expect(writes).toHaveLength(1)
}

it('工具栏保存确认后，离开弹窗继续前往原目标且不再写入新版本', async () => {
  const { store, router, link, status } = await setup()
  await saveFromToolbar()
  const leaving = router.push('/elsewhere')
  await flushPromises()
  expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeDefined()
  dialog().get<HTMLButtonElement>('[data-action="leave-discard"]').element.focus()
  firstWrite.resolve()
  await flushPromises()

  expect(store.dirty).toBe(false)
  expect(router.currentRoute.value.path).toBe('/workflows/201')
  expect.soft(dialog().text()).toContain('工作流已保存')
  expect.soft(dialog().find('[data-action="leave-discard"]').exists()).toBe(false)
  expect.soft(document.activeElement).toBe(dialog().get('[data-action="leave-stay"]').element)
  expect.soft(link).toHaveBeenCalledExactlyOnceWith('11', '201')
  expect.soft(status).toHaveBeenCalledExactlyOnceWith('201', 'ready')
  await dialog().get('[data-action="leave-save"]').trigger('click')
  expect(await leaving).toBeUndefined()
  expect(router.currentRoute.value.path).toBe('/elsewhere')
  expect.soft(writes.map(write => write.method)).toEqual(['put'])
  expect(persisted.version).toBe(2)
})

it('首次工具栏保存确认后主动留页，地址换成已保存的工作流且保留同一张画布', async () => {
  const { store, router, start, link, status } = await setup('new')
  store.updateNodeConfig(start.id, 'variables', { prompt: '首次保存内容' })
  await saveFromToolbar()
  const leaving = router.push('/elsewhere')
  await flushPromises()
  firstWrite.resolve()
  await flushPromises()
  expect(store.dirty).toBe(false)
  expect(store.workflowId).toBe('201')
  expect(router.currentRoute.value.path).toBe('/workflows/new')
  const previousReads = reads
  const history = JSON.stringify(store.historyPast)

  await dialog().get('[data-action="leave-stay"]').trigger('click')
  expect(isNavigationFailure(await leaving)).toBe(true)
  await flushPromises()
  expect.soft(router.currentRoute.value.fullPath).toBe('/workflows/201?projectId=11')
  expect.soft(link).toHaveBeenCalledExactlyOnceWith('11', '201')
  expect.soft(status).toHaveBeenCalledExactlyOnceWith('201', 'ready')
  expect(store.nodes.find(node => node.id === start.id)?.data.config.variables).toEqual({ prompt: '首次保存内容' })
  expect(JSON.stringify(store.historyPast)).toBe(history)
  expect(reads).toBe(previousReads)
  expect(writes.map(write => write.method)).toEqual(['post'])
})

it('工具栏保存期间新增的编辑仍须保存；不会误用较早的回执直接离开', async () => {
  const { store, router, start } = await setup()
  await saveFromToolbar()
  store.updateNodeConfig(start.id, 'variables', { prompt: '后续未保存内容' })
  const leaving = router.push('/elsewhere')
  await flushPromises()
  firstWrite.resolve()
  await flushPromises()
  expect(store.dirty).toBe(true)
  expect(dialog().text()).toContain('离开前保存工作流？')
  expect(dialog().find('[data-action="leave-discard"]').exists()).toBe(true)
  await dialog().get('[data-action="leave-save"]').trigger('click')
  expect(await leaving).toBeUndefined()
  expect(writes).toHaveLength(2)
  expect(writes[1]?.payload.nodes.find(node => node.nodeId === start.id)?.config?.variables).toEqual({ prompt: '后续未保存内容' })
})

it('工具栏保存明确失败后，弹窗仍可重试而不会直接授权离开', async () => {
  rejectFirst = true
  const { store, router } = await setup()
  await saveFromToolbar()
  const leaving = router.push('/elsewhere')
  await flushPromises()
  firstWrite.resolve()
  await flushPromises()
  expect(store.dirty).toBe(true)
  expect(store.savingError).toContain('保存被拒绝')
  expect(dialog().text()).toContain('离开前保存工作流？')
  await dialog().get('[data-action="leave-save"]').trigger('click')
  expect(await leaving).toBeUndefined()
  expect(writes.map(write => write.method)).toEqual(['put', 'put'])
  expect(persisted.version).toBe(2)
})

it('首次保存后选择继续，不以规范化跳转取代原目的地，也不重新保存', async () => {
  const { store, router } = await setup('new')
  await saveFromToolbar()
  const leaving = router.push('/elsewhere')
  await flushPromises()
  firstWrite.resolve()
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/new')
  expect(store.dirty).toBe(false)

  await dialog().get('[data-action="leave-save"]').trigger('click')
  expect(await leaving).toBeUndefined()
  expect(router.currentRoute.value.path).toBe('/elsewhere')
  expect.soft(writes.map(write => write.method)).toEqual(['post'])
  expect(persisted.version).toBe(1)
})

it('继续离开被后续守卫拒绝后，保留新建工作流的已保存地址', async () => {
  const { store, router } = await setup('new')
  router.beforeEach(to => to.path !== '/elsewhere')
  await saveFromToolbar()
  const leaving = router.push('/elsewhere')
  await flushPromises()
  firstWrite.resolve()
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/new')
  expect(store.dirty).toBe(false)

  await dialog().get('[data-action="leave-save"]').trigger('click')
  expect(isNavigationFailure(await leaving)).toBe(true)
  await flushPromises()
  expect.soft(router.currentRoute.value.fullPath).toBe('/workflows/201?projectId=11')
  expect(writes.map(write => write.method)).toEqual(['post'])
  expect(reads).toBe(0)
})

it('浏览器后退时选择留页，只替换已恢复的原历史条目', async () => {
  const { router } = await setup('new', true)
  await saveFromToolbar()
  router.back()
  await vi.waitFor(() => expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true))
  expect(window.location.pathname).toBe('/elsewhere')
  firstWrite.resolve()
  await flushPromises()

  await dialog().get('[data-action="leave-stay"]').trigger('click')
  await vi.waitFor(() => {
    expect(router.currentRoute.value.fullPath).toBe('/workflows/201?projectId=11')
    expect(window.location.pathname).toBe('/workflows/201')
  })
  router.back()
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/elsewhere'))
  expect(window.location.pathname).toBe('/elsewhere')
  expect(writes.map(write => write.method)).toEqual(['post'])
})

it('继续后有新编辑，重新确认时留页并保留这些编辑，不误授权原目的地', async () => {
  const { store, router, start } = await setup('new')
  const guard = hold()
  router.beforeEach(async to => { if (to.path === '/elsewhere') await guard.response })
  await saveFromToolbar()
  const leaving = router.push('/elsewhere')
  await flushPromises()
  firstWrite.resolve()
  await flushPromises()
  await dialog().get('[data-action="leave-save"]').trigger('click')
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)

  store.updateNodeConfig(start.id, 'variables', { prompt: '后续编辑' })
  guard.resolve()
  await flushPromises()
  expect(dialog().text()).toContain('离开前保存工作流？')
  await dialog().get('[data-action="leave-stay"]').trigger('click')
  expect(isNavigationFailure(await leaving)).toBe(true)
  await flushPromises()
  expect.soft(router.currentRoute.value.fullPath).toBe('/workflows/201?projectId=11')
  expect(store.nodes.find(node => node.id === start.id)?.data.config.variables).toEqual({ prompt: '后续编辑' })
  expect(store.dirty).toBe(true)
  expect(writes.map(write => write.method)).toEqual(['post'])
})
