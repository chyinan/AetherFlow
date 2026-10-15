// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { resolveWorkflowNavigation } from '@/test/resolveWorkflowNavigation'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'

import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
let entity: any
let pending: ReturnType<typeof deferred<any>> | undefined
function deferred<T>() {
 let resolve!: (value: T) => void
 const promise = new Promise<T>(r => { resolve = r })
 return { promise, resolve }
}
vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

function project(id: string): ProjectSummary {
  return {
    id, name: `P${id}`, description: '', owner: 'tester', environment: 'dev', health: 'idle',
    scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
    workflowCount: 0, activeRunCount: 0, fileCount: 0, updatedAt: '', workflows: [],
  }
}

let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  pending = undefined
  entity = { id: 201, name: 'Existing', version: 1, projectId: 11, definitionJson: JSON.stringify({ nodes: [] }) }
  http.get.mockImplementation(async (url: string) => { if (url === '/workflows/definitions/201') return JSON.parse(JSON.stringify(entity)); throw new Error('Unexpected GET '+url) })
  const write = async (url: string, payload: any) => {
    if (url !== '/workflows/definitions' && url !== '/workflows/definitions/201') throw new Error('Unexpected write '+url)
    entity = { id: 201, name: payload.name, projectId: payload.projectId, version: entity.version + 1, definitionJson: JSON.stringify(payload) }
    const response = JSON.parse(JSON.stringify(entity))
    if (pending) { const active = pending; pending = undefined; await active.promise }
    return response
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

async function setup(path = '/workflows/new?projectId=11') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const projects = useProjectStore()
  projects.workflowSummaries = [{ id: '102', name: 'Workflow 102', status: 'draft', updatedAt: '' }]
  projects.projects = [project('11'), project('22')]
  vi.spyOn(projects, 'loadProjects').mockResolvedValue(undefined)
  const link = vi.spyOn(projects, 'linkWorkflowToProject')
  const status = vi.spyOn(projects, 'updateWorkflowStatus')
  const save = vi.spyOn(store, 'saveCurrentWorkflow')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:id', component: WorkflowPage }],
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
    },
  })
  await flushPromises()
  const start = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })!
  const end = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'output')!, { x: 300, y: 0 })!
  store.addConnection({ source: start.id, target: end.id, sourceHandle: null, targetHandle: null })
  return { store, router, start, projects, link, status, save }
}

function saveButton() {
  const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map((key) => i18n.global.t(key))
  return wrapper!.findAll('button').find((button) => labels.includes(button.text()))!
}

describe('普通保存后的地址规范化', () => {
 it('无并发编辑时首次保存正确进入持久化路由', async () => {
  const { store, router } = await setup()
  await saveButton().trigger('click'); await flushPromises()
  expect(store.workflowId).toBe('201'); expect(router.currentRoute.value.params.id).toBe('201')
  expect(store.dirty).toBe(false); expect(http.post).toHaveBeenCalledTimes(1)
  expect(window.confirm).not.toHaveBeenCalled()
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
 })
 it('已有工作流保存期间编辑仍保留新配置与脏状态', async () => {
  const { store, router, start } = await setup('/workflows/201?projectId=11')
  const save = deferred<any>(); pending = save
  await saveButton().trigger('click'); await flushPromises()
  store.updateNodeConfig(start.id, 'variables', { revision: 'newer' })
  save.resolve(undefined); await flushPromises()
  expect(store.nodes.find(n => n.id === start.id)!.data.config.variables).toEqual({ revision: 'newer' })
  expect(store.dirty).toBe(true); expect(router.currentRoute.value.params.id).toBe('201')
  expect(window.confirm).not.toHaveBeenCalled()
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
 })
 it('首次保存期间继续编辑不弹离开确认、不重载画布，并在第二次保存持久化新编辑', async () => {
  const { store, router, start } = await setup()
  const saving = deferred<undefined>(); pending = saving
  await saveButton().trigger('click'); await flushPromises()
  expect(http.post).toHaveBeenCalledTimes(1)
  expect(http.post.mock.calls[0]![1].nodes.map((n: any) => n.nodeType)).toEqual(['START', 'END'])
  store.updateNodeConfig(start.id, 'variables', { revision: 'newer' })
  const history = JSON.stringify(store.historyPast)
  saving.resolve(undefined); await flushPromises()
  expect(window.confirm).not.toHaveBeenCalled()
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
  expect(router.currentRoute.value.params.id).toBe('201')
  expect(store.workflowId).toBe('201'); expect(store.backendDefinitionId).toBe(201)
  expect(store.dirty).toBe(true)
  expect(store.nodes.find(n => n.id === start.id)!.data.config.variables).toEqual({ revision: 'newer' })
  expect(JSON.stringify(store.historyPast)).toBe(history)
  expect(http.get).not.toHaveBeenCalled()
  await saveButton().trigger('click'); await flushPromises()
  expect(http.put).toHaveBeenCalledTimes(1)
  expect(http.put.mock.calls[0]![0]).toBe('/workflows/definitions/201')
  expect(http.put.mock.calls[0]![1].nodes[0].config.variables).toEqual({ revision: 'newer' })
  expect(store.dirty).toBe(false)
  await store.loadWorkflow(String(router.currentRoute.value.params.id))
  expect(store.nodes.find(n => n.id === start.id)!.data.config.variables).toEqual({ revision: 'newer' })
 })
 it('首次地址规范化被外部守卫取消，重复保存仍纠正遗留 new 地址', async () => {
  const { store, router, start, status } = await setup()
  const removeGuard = router.beforeEach(to => to.params.id === '201' ? false : undefined)
  await saveButton().trigger('click'); await flushPromises()
  expect(store.workflowId).toBe('201'); expect(router.currentRoute.value.params.id).toBe('new')
  expect(status).not.toHaveBeenCalled()
  removeGuard()
  store.updateNodeConfig(start.id, 'variables', { revision: 'retry' })
  await saveButton().trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('201')
  expect(store.dirty).toBe(false)
  expect(http.post).toHaveBeenCalledTimes(1); expect(http.put).toHaveBeenCalledTimes(1)
  expect(status).toHaveBeenCalledExactlyOnceWith('201', 'ready')
  expect(http.get).not.toHaveBeenCalled()
 })
 it('外部守卫等待地址切换时继续编辑，内部规范化保留较新的画布', async () => {
  const { store, router, start } = await setup()
  const navigation = deferred<boolean>()
  router.beforeEach(to => to.params.id === '201' ? navigation.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  store.updateNodeConfig(start.id, 'variables', { revision: 'during-navigation' })
  navigation.resolve(true); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('201')
  expect(store.dirty).toBe(true)
  expect(store.nodes.find(n => n.id === start.id)!.data.config.variables).toEqual({ revision: 'during-navigation' })
  expect(http.get).not.toHaveBeenCalled()
 })
 it('实际跨工作流导航仍请求丢弃确认，拒绝后留在当前画布', async () => {
  const { store, router, start } = await setup()
  await saveButton().trigger('click'); await flushPromises()
  store.updateNodeConfig(start.id, 'variables', { revision: 'unsaved' })
  const navigation = router.push('/workflows/202?projectId=22')
  await flushPromises()
  expect(wrapper!.findAll('[data-testid="unsaved-navigation-dialog"]')).toHaveLength(1)
  expect(wrapper!.get('[data-testid="unsaved-navigation-dialog"]').text()).toContain('离开前保存工作流？')
  expect(await resolveWorkflowNavigation(wrapper!, navigation, 'stay')).toBe(true)
  expect(window.confirm).not.toHaveBeenCalled()
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
  expect(router.currentRoute.value.params.id).toBe('201'); expect(store.dirty).toBe(true)
 })
 it('内部规范化等待期间真正导航到其他工作流，迟到导航不重载或标记其他页面', async () => {
  const { store, router, status } = await setup()
  const navigation = deferred<boolean>()
  router.beforeEach(to => to.params.id === '201' ? navigation.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  http.get.mockImplementation(async (url: string) => {
    if (url === '/workflows/definitions/202') return { id: 202, name: 'Other', version: 1, projectId: 22, definitionJson: JSON.stringify({ nodes: [] }) }
    throw new Error('Unexpected GET '+url)
  })
  await resolveWorkflowNavigation(wrapper!, router.push('/workflows/202?projectId=22')); await flushPromises()
  const snapshot = JSON.stringify(store.$state)
  navigation.resolve(true); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('202'); expect(store.workflowId).toBe('202')
  expect(JSON.stringify(store.$state)).toBe(snapshot); expect(status).not.toHaveBeenCalled()
 })
})
