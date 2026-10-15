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

import { AxiosError, type AxiosAdapter } from 'axios'
import { axiosInstance } from '@/api/client/apiClient'
let originalAdapter: typeof axiosInstance.defaults.adapter
let persisted: any
let writes: Array<{ method: string; payload: any }>
let loseReceipt: boolean
let failUpdate: boolean
let rejectCreation: number | undefined
let resultRejection: boolean
let failBeforeCreation: boolean
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
  originalAdapter = axiosInstance.defaults.adapter
  persisted = undefined; writes = []; loseReceipt = true; failUpdate = false; rejectCreation = undefined; resultRejection = false; failBeforeCreation = false
  // 内存夹具遵循 WorkflowServiceImpl：相同创建键返回第一次记录，不覆盖定义。
  // 仅模拟 Axios 传输和持久化边界，页面、路由、store 与 API 映射均为产品实现。
  const adapter: AxiosAdapter = async config => {
    const method = config.method!
    const payload = config.data ? JSON.parse(config.data) : undefined
    if (method === 'post' && config.url === '/workflows/definitions') {
      writes.push({ method, payload })
      if (failBeforeCreation) { failBeforeCreation = false; throw new AxiosError('创建提交前连接失败', 'ERR_NETWORK', config) }
      if (rejectCreation) {
        const status = rejectCreation; rejectCreation = undefined
        if (resultRejection) return { data: { code: String(status), message: '定义校验拒绝' }, status: 200, statusText: 'OK', headers: {}, config }
        throw new AxiosError('定义校验拒绝', 'ERR_BAD_REQUEST', config, undefined, { data: { code: status, message: '定义校验拒绝' }, status, statusText: 'Bad Request', headers: {}, config })
      }
      if (!persisted) persisted = { id: 201, name: payload.name, projectId: payload.projectId, version: 1, status: 'ENABLED', idempotencyKey: payload.idempotencyKey, definitionJson: JSON.stringify(payload) }
      else expect(payload.idempotencyKey).toBe(persisted.idempotencyKey)
      if (loseReceipt) { loseReceipt = false; throw new AxiosError('创建回执丢失', 'ERR_NETWORK', config) }
    } else if (method === 'put' && config.url === '/workflows/definitions/201') {
      writes.push({ method, payload })
      if (failUpdate) throw new AxiosError('更新暂不可用', 'ERR_NETWORK', config)
      persisted = { ...persisted, name: payload.name, version: persisted.version + 1, definitionJson: JSON.stringify(payload) }
    } else if (method !== 'get' || config.url !== '/workflows/definitions/201') {
      throw new Error('非预期请求 ' + method + ' ' + config.url)
    }
    return { data: JSON.parse(JSON.stringify(persisted)), status: 200, statusText: 'OK', headers: {}, config }
  }
  axiosInstance.defaults.adapter = adapter
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
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

describe('创建已落库但回执丢失后的编辑恢复', () => {
  it.each(['再次保存成功', '补保存失败'] as const)('%s：恢复原 ID 后保留新编辑，离开仍警告', async mode => {
    const { store, router, start } = await setup()
    store.updateNodeConfig(start.id, 'variables', { prompt: '第一次' })
    await saveButton().trigger('click'); await flushPromises()
    expect(store.dirty).toBe(true)
    expect(writes).toHaveLength(1)
    const firstKey = writes[0]!.payload.idempotencyKey
    store.updateNodeConfig(start.id, 'variables', { prompt: '不能丢失的新编辑' })
    await saveButton().trigger('click'); await flushPromises()
    expect(writes.filter(w => w.method === 'post')).toHaveLength(2)
    expect(writes[1]!.payload.idempotencyKey).toBe(firstKey)
    expect(store.backendDefinitionId).toBe(201)
    expect(store.dirty).toBe(true)
    expect(store.nodes.find(n => n.id === start.id)!.data.config.variables).toEqual({ prompt: '不能丢失的新编辑' })
    expect(wrapper!.get('[role="alert"]').text()).toContain(i18n.global.t('workflow.createRecoveredPendingSave'))
    expect(JSON.parse(persisted.definitionJson).nodes[0].config.variables).toEqual({ prompt: '第一次' })
    const current = router.currentRoute.value.fullPath
    const navigation = router.push('/workflows/new?projectId=22')
    await flushPromises()
    expect(wrapper!.findAll('[data-testid="unsaved-navigation-dialog"]')).toHaveLength(1)
    expect(await resolveWorkflowNavigation(wrapper!, navigation, 'stay')).toBe(true)
    expect(window.confirm).not.toHaveBeenCalled()
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe(current)
    failUpdate = mode === '补保存失败'
    await saveButton().trigger('click'); await flushPromises()
    expect(writes.filter(w => w.method === 'post')).toHaveLength(2)
    expect(writes.at(-1)!.method).toBe('put')
    expect(store.dirty).toBe(failUpdate)
    if (!failUpdate) {
      expect(router.currentRoute.value.params.id).toBe('201')
      expect(JSON.parse(persisted.definitionJson).nodes[0].config.variables).toEqual({ prompt: '不能丢失的新编辑' })
      await store.loadWorkflow('201')
      expect(store.nodes.find(n => n.id === start.id)!.data.config.variables).toEqual({ prompt: '不能丢失的新编辑' })
    }
  })
  it.each([[400, false], [422, false], [400, true]] as const)('明确 %s 校验拒绝（Result=%s）后允许修正内容，同键不多建', async (status, result) => {
    const { store, start } = await setup()
    rejectCreation = status; loseReceipt = false; resultRejection = result
    store.updateNodeConfig(start.id, 'variables', { prompt: '无效输入' })
    await saveButton().trigger('click'); await flushPromises()
    expect(persisted).toBeUndefined()
    store.updateNodeConfig(start.id, 'variables', { prompt: '修正输入' })
    await saveButton().trigger('click'); await flushPromises()
    expect(store.dirty).toBe(true)
    expect(store.backendDefinitionId).toBe(201)
    expect(writes).toHaveLength(2)
    expect(writes[0]!.payload.idempotencyKey).toBe(writes[1]!.payload.idempotencyKey)
    expect(JSON.parse(persisted.definitionJson).nodes[0].config.variables).toEqual({ prompt: '修正输入' })
    await saveButton().trigger('click'); await flushPromises()
    expect(store.dirty).toBe(false)
    expect(writes.at(-1)!.method).toBe('put')
  })
  it('未知失败后再被校验拒绝，仍可修正并保存，不冻结无效输入', async () => {
    const { store, start } = await setup()
    failBeforeCreation = true; loseReceipt = false
    await saveButton().trigger('click'); await flushPromises()
    rejectCreation = 400
    await saveButton().trigger('click'); await flushPromises()
    expect(persisted).toBeUndefined()
    store.updateNodeConfig(start.id, 'variables', { prompt: '修正输入' })
    await saveButton().trigger('click'); await flushPromises()
    expect(store.backendDefinitionId).toBe(201)
    expect(store.dirty).toBe(true)
    expect(new Set(writes.map(write => write.payload.idempotencyKey)).size).toBe(1)
    await saveButton().trigger('click'); await flushPromises()
    expect(store.dirty).toBe(false)
    expect(writes.at(-1)!.method).toBe('put')
  })
  it('未编辑重试只恢复同一记录，正常标记已保存', async () => {
    const { store } = await setup()
    await saveButton().trigger('click'); await flushPromises()
    await saveButton().trigger('click'); await flushPromises()
    expect(store.backendDefinitionId).toBe(201)
    expect(store.dirty).toBe(false)
    expect(writes).toHaveLength(2)
    expect(writes[0]!.payload.idempotencyKey).toBe(writes[1]!.payload.idempotencyKey)
  })
})
