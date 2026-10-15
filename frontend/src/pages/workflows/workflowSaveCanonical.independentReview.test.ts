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

describe('独立审查：普通保存规范化边界', () => {
 it('重叠保存规范化只允许最新操作写状态', async () => {
  const { store, router, start, status } = await setup()
  const gate = deferred<boolean>(); let attempts = 0
  router.beforeEach(to => to.params.id === '201' && ++attempts === 1 ? gate.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  store.updateNodeConfig(start.id, 'variables', { revision: 'second' })
  await saveButton().trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('201')
  store.updateNodeConfig(start.id, 'variables', { revision: 'third' })
  const state = JSON.stringify(store.$state)
  gate.resolve(true); await flushPromises()
  expect(JSON.stringify(store.$state)).toBe(state)
  expect(http.get).not.toHaveBeenCalled()
  expect(status).toHaveBeenCalledExactlyOnceWith('201', 'ready')
 })
 it('第二次保存仍在等待响应时取消旧规范化，第二次完成后正常恢复', async () => {
  const { store, router, start, status } = await setup()
  const gate = deferred<boolean>(); let attempts = 0
  router.beforeEach(to => to.params.id === '201' && ++attempts === 1 ? gate.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  store.updateNodeConfig(start.id, 'variables', { revision: 'second' })
  const saving = deferred<undefined>(); pending = saving
  await saveButton().trigger('click'); await flushPromises()
  gate.resolve(true); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('new')
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
  expect(store.dirty).toBe(true); expect(http.get).not.toHaveBeenCalled()
  saving.resolve(undefined); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('201')
  expect(store.dirty).toBe(false)
  expect(store.nodes.find(n => n.id === start.id)!.data.config.variables).toEqual({ revision: 'second' })
  expect(status).toHaveBeenCalledExactlyOnceWith('201', 'ready')
 })
 it('拒绝真实导航后取消旧规范化，再次保存恢复地址', async () => {
  const { store, router, start } = await setup()
  const gate = deferred<boolean>()
  const remove = router.beforeEach(to => to.params.id === '201' ? gate.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  store.updateNodeConfig(start.id, 'variables', { revision: 'keep' })
  const navigation = router.push('/workflows/202?projectId=22')
  await flushPromises()
  expect(wrapper!.findAll('[data-testid="unsaved-navigation-dialog"]')).toHaveLength(1)
  expect(await resolveWorkflowNavigation(wrapper!, navigation, 'stay')).toBe(true)
  gate.resolve(true); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('new')
  expect(store.dirty).toBe(true); expect(window.confirm).not.toHaveBeenCalled()
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
  remove(); await saveButton().trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('201')
  expect(http.get).not.toHaveBeenCalled()
 })
 it('规范化等待时卸载不写状态或重载', async () => {
  const { store, router, status } = await setup()
  const gate = deferred<boolean>()
  router.beforeEach(to => to.params.id === '201' ? gate.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  wrapper!.unmount(); wrapper = undefined
  const state = JSON.stringify(store.$state)
  gate.resolve(true); await flushPromises()
  expect(JSON.stringify(store.$state)).toBe(state)
  expect(status).not.toHaveBeenCalled(); expect(http.get).not.toHaveBeenCalled()
 })
 it('保存响应等待时卸载不规范化或关联项目', async () => {
  const { router, status, link } = await setup()
  const replace = vi.spyOn(router, 'replace')
  const saving = deferred<undefined>(); pending = saving
  await saveButton().trigger('click'); await flushPromises()
  wrapper!.unmount(); wrapper = undefined
  saving.resolve(undefined); await flushPromises()
  expect(replace).not.toHaveBeenCalled()
  expect(status).not.toHaveBeenCalled(); expect(link).not.toHaveBeenCalled()
 })
 it('外部守卫重定向必须再次确认真实离开', async () => {
  const { store, router, start, status } = await setup()
  const gate = deferred<any>()
  router.beforeEach(to => to.params.id === '201' ? gate.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  store.updateNodeConfig(start.id, 'variables', { revision: 'keep' })
  gate.resolve('/workflows/202?projectId=22'); await flushPromises()
  expect(wrapper!.findAll('[data-testid="unsaved-navigation-dialog"]')).toHaveLength(1)
  expect(await resolveWorkflowNavigation(wrapper!, undefined, 'stay')).toBe(true)
  expect(window.confirm).not.toHaveBeenCalled()
  expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
  expect(router.currentRoute.value.params.id).toBe('new')
  expect(store.dirty).toBe(true); expect(status).not.toHaveBeenCalled()
 })
 it.each(['import', 'template'])('规范化等待时 %s 替换画布不得由迟到保存路由覆盖', async (replacement) => {
  const { store, router, status } = await setup()
  const gate = deferred<boolean>()
  router.beforeEach(to => to.params.id === '201' ? gate.promise : undefined)
  await saveButton().trigger('click'); await flushPromises()
  if (replacement === 'template') {
    store.useWorkflowTemplate({ id: 'template', name: 'Imported replacement', nodes: [], edges: [] } as any)
  } else {
    store.resetToEmptyWorkflow()
    store.workflowName = 'Imported replacement'
  }
  const node = store.addNodeFromTemplate(nodeTemplates.find(t => t.kind === 'start')!, { x: 1, y: 2 })!
  store.updateNodeConfig(node.id, 'variables', { revision: 'replacement' })
  gate.resolve(true); await flushPromises()
  expect(store.workflowName).toBe('Imported replacement')
  expect(store.nodes.find(n => n.id === node.id)!.data.config.variables).toEqual({ revision: 'replacement' })
  expect(http.get).not.toHaveBeenCalled()
  expect(status).not.toHaveBeenCalled()
 })
})
