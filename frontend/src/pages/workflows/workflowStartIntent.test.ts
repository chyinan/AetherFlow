// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { mockProjects } from '@/services/mock/projectMock'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const transport = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', async (original) => ({
  ...await original<typeof import('@/api/client/apiClient')>(),
  apiClient: { post: transport.post, put: transport.put },
}))
const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), startRun: vi.fn() }))
const files = vi.hoisted(() => ({
  loadFiles: vi.fn(), addArtifactsFromRun: vi.fn(), latestBackendInputFileId: undefined as string | undefined,
}))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/services/api/runApi', async (original) => ({
  ...await original<typeof import('@/services/api/runApi')>(),
  runApi: { listRuns: vi.fn(async () => []), getLogs: vi.fn(async () => []), recoverRuntime: vi.fn(async () => null) },
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => files }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}

function node(id: string, kind: WorkflowGraphNode['data']['kind'] = 'start'): WorkflowGraphNode {
  return {
    id, type: 'workflow', position: { x: 0, y: 0 },
    data: { label: `节点 ${id}`, description: '', kind, config: {}, inputs: [], outputs: [], status: 'idle' },
  }
}

function definition(id: string): WorkflowDefinition {
  return {
    id, name: `Workflow ${id}`, backendDefinitionId: id === 'new' ? undefined : Number(id),
    backendVersion: 1, nodes: [node(`node-${id}`)], edges: [],
  }
}

const result = {
  runId: 'run-901', backendInstanceId: 901, runtimeWorkflowId: '901', definitionId: 101, backendStatus: 'RUNNING',
}
let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => ({ ...workflow, backendVersion: 2 }))
  files.latestBackendInputFileId = undefined
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

async function setup(path = '/workflows/101?projectId=11') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  const runs = useRunStore()
  const projects = useProjectStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(projects, 'loadProjects').mockResolvedValue(undefined)
  projects.workflowSummaries = ['101', '102'].map((id) => ({ id, name: `Workflow ${id}`, updatedAt: '', status: 'draft' }))
  projects.projects = ['11', '22'].map((id) => ({ ...mockProjects[0]!, id, name: `P${id}`, workflows: [] }))
  const status = vi.spyOn(projects, 'updateWorkflowStatus')
  const link = vi.spyOn(projects, 'linkWorkflowToProject')
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/runs/:id', component: { template: '<div>运行详情</div>' } },
    { path: '/elsewhere', component: { template: '<div>其他页面</div>' } },
  ] })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { global: {
    plugins: [pinia, router, i18n],
    stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  return { store, runs, projects, status, link, router }
}

function runButton() {
  return wrapper!.findAll('button').find((button) => [
    i18n.global.t('workflow.run'), i18n.global.t('status.running'), i18n.global.t('workflow.waitingForInput'),
  ].includes(button.text()))!
}
async function clickRun() { await runButton().trigger('click'); await flushPromises() }


it('启动回执丢失后修改提示词，新的运行意图不能复用旧幂等键', async () => {
  const { store, runs, router } = await setup()
  const prompt = node('prompt-1', 'prompt')
  prompt.data.config = { prompt: '第一版提示词', outputVariable: 'text' }
  store.nodes.push(prompt)
  const first = deferred<{ id: number; definitionId: number; status: string }>()
  const actual = await vi.importActual<typeof import('@/services/api/workflowApi')>('@/services/api/workflowApi')
  api.startRun.mockImplementation(actual.workflowApi.startRun)
  api.saveWorkflow.mockImplementation(actual.workflowApi.saveWorkflow)
  let version = 1
  transport.put.mockImplementation(async () => ({ id: 101, version: ++version, status: "DRAFT" }))
  transport.post.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ id: 901, definitionId: 101, status: 'RUNNING' })
  await clickRun()
  const firstKey = api.startRun.mock.calls[0]![2].idempotencyKey
  first.reject(new Error('运行已接收但回执超时'))
  await flushPromises()
  expect(store.runError).toContain('回执超时')
  expect(runButton().attributes('disabled')).toBeUndefined()
  store.updateNodeConfig('prompt-1', 'prompt', '第二版提示词：保留用户修改 🌟')
  const saveFailure = deferred<WorkflowDefinition>()
  transport.put.mockReturnValueOnce(saveFailure.promise)
  await clickRun()
  expect(runButton().attributes('disabled')).toBeDefined()
  saveFailure.reject(new Error('保存暂不可用'))
  await flushPromises()
  expect(store.nodes.find(n => n.id === 'prompt-1')?.data.config.prompt).toBe('第二版提示词：保留用户修改 🌟')
  expect(store.dirty).toBe(true)
  expect(api.startRun).toHaveBeenCalledTimes(1)
  await clickRun()
  expect(api.startRun).toHaveBeenCalledTimes(2)
  expect(store.backendVersion).toBe(3)
  expect(transport.put.mock.calls.at(-1)![1].nodes.find((n: { nodeId: string }) => n.nodeId === 'prompt-1').config.prompt).toBe('第二版提示词：保留用户修改 🌟')
  expect(api.saveWorkflow.mock.calls.at(-1)![0].nodes.find((n: WorkflowGraphNode) => n.id === 'prompt-1').data.config.prompt).toBe('第二版提示词：保留用户修改 🌟')
  expect(router.currentRoute.value.path).toBe('/runs/run-901')
  expect(runs.currentRun?.backendInstanceId).toBe(901)
  expect(transport.post).toHaveBeenCalledTimes(2)
  expect(transport.post.mock.calls.map(c => c[0])).toEqual(['/workflows/definitions/101/instances', '/workflows/definitions/101/instances'])
  expect(transport.post.mock.calls[1]![1].idempotencyKey).not.toBe(firstKey)
})

it('启动失败后未修改配置，连续失败重试保留相同幂等键且不自动重复提交', async () => {
  const { store, router } = await setup()
  api.startRun.mockRejectedValueOnce(new Error('第一次超时')).mockRejectedValueOnce(new Error('第二次超时')).mockResolvedValueOnce(result)
  await clickRun()
  const key = api.startRun.mock.calls[0]![2].idempotencyKey
  await clickRun()
  expect(store.runError).toContain('第二次超时')
  expect(api.startRun).toHaveBeenCalledTimes(2)
  await clickRun()
  expect(api.startRun).toHaveBeenCalledTimes(3)
  expect(api.startRun.mock.calls.map(c => c[2].idempotencyKey)).toEqual([key, key, key])
  expect(router.currentRoute.value.path).toBe('/runs/run-901')
})

function addPrompt(store: ReturnType<typeof useWorkflowStore>) {
  const prompt = node('prompt-1', 'prompt')
  prompt.data.config = { prompt: '原提示词', outputVariable: 'text' }
  store.nodes.push(prompt)
}

it('拒绝新运行时不保存也不启动，撤销修改后仍可用原键恢复', async () => {
  const { store } = await setup()
  addPrompt(store)
  api.startRun.mockRejectedValue(new Error('超时'))
  await clickRun()
  const key = api.startRun.mock.calls[0]![2].idempotencyKey
  store.updateNodeConfig('prompt-1', 'prompt', '新提示词')
  vi.mocked(window.confirm).mockReturnValue(false)
  await clickRun()
  expect(window.confirm).toHaveBeenCalledWith(i18n.global.t('workflow.runChangedIntentConfirm'))
  expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
  expect(api.startRun).toHaveBeenCalledTimes(1)
  expect(store.dirty).toBe(true)
  expect(runButton().attributes('disabled')).toBeUndefined()
  store.undo()
  vi.mocked(window.confirm).mockClear()
  await clickRun()
  expect(api.startRun.mock.calls[1]![2].idempotencyKey).toBe(key)
  expect(window.confirm).not.toHaveBeenCalled()
})

it('编辑再撤销保留旧键，重做后明确确认新意图且后续重试保留新键', async () => {
  const { store } = await setup()
  addPrompt(store)
  api.startRun.mockRejectedValue(new Error('超时'))
  await clickRun()
  const firstKey = api.startRun.mock.calls[0]![2].idempotencyKey
  store.updateNodeConfig('prompt-1', 'prompt', '新提示词')
  store.undo()
  await clickRun()
  expect(api.startRun.mock.calls[1]![2].idempotencyKey).toBe(firstKey)
  expect(window.confirm).not.toHaveBeenCalled()
  store.redo()
  await clickRun()
  const nextKey = api.startRun.mock.calls[2]![2].idempotencyKey
  expect(nextKey).not.toBe(firstKey)
  expect(window.confirm).toHaveBeenCalledTimes(1)
  await clickRun()
  expect(api.startRun.mock.calls[3]![2].idempotencyKey).toBe(nextKey)
  expect(window.confirm).toHaveBeenCalledTimes(1)
})

it('新配置保存失败后撤销，原始启动键仍保留', async () => {
  const { store } = await setup()
  addPrompt(store)
  api.startRun.mockRejectedValue(new Error('超时'))
  await clickRun()
  const key = api.startRun.mock.calls[0]![2].idempotencyKey
  store.updateNodeConfig('prompt-1', 'prompt', '新提示词')
  api.saveWorkflow.mockRejectedValueOnce(new Error('保存失败'))
  await clickRun()
  expect(api.startRun).toHaveBeenCalledTimes(1)
  store.undo()
  await clickRun()
  expect(api.startRun.mock.calls[1]![2].idempotencyKey).toBe(key)
})

it('输入文件改变需要新意图确认，取消后恢复原输入仍沿用旧键', async () => {
  const { store } = await setup()
  store.nodes.push(node('upload-1', 'upload'))
  files.latestBackendInputFileId = 'file-1'
  api.startRun.mockRejectedValue(new Error('超时'))
  await clickRun()
  const key = api.startRun.mock.calls[0]![2].idempotencyKey
  files.latestBackendInputFileId = 'file-2'
  vi.mocked(window.confirm).mockReturnValue(false)
  await clickRun()
  expect(api.startRun).toHaveBeenCalledTimes(1)
  files.latestBackendInputFileId = 'file-1'
  await clickRun()
  expect(api.startRun.mock.calls[1]![2].idempotencyKey).toBe(key)
})

it('选择、移动节点和保存版本变化不会创建新的运行意图', async () => {
  const { store } = await setup()
  addPrompt(store)
  api.startRun.mockRejectedValue(new Error('超时'))
  await clickRun()
  const key = api.startRun.mock.calls[0]![2].idempotencyKey
  store.nodes[0]!.selected = true
  store.nodes[0]!.position = { x: 900, y: 700 }
  store.backendVersion = 42
  await clickRun()
  expect(api.startRun.mock.calls[1]![2].idempotencyKey).toBe(key)
  expect(window.confirm).not.toHaveBeenCalled()
})

it('确认使用新的文件输入后换键，连续重试仍保留新键', async () => {
  const { store } = await setup()
  store.nodes.push(node('upload-1', 'upload'))
  files.latestBackendInputFileId = 'file-1'
  api.startRun.mockRejectedValue(new Error('超时'))
  await clickRun()
  const original = api.startRun.mock.calls[0]![2].idempotencyKey
  files.latestBackendInputFileId = 'file-2'
  await clickRun()
  const next = api.startRun.mock.calls[1]![2].idempotencyKey
  expect(next).not.toBe(original)
  expect(api.startRun.mock.calls[1]![1]).toEqual({ fileId: 'file-2' })
  expect(window.confirm).toHaveBeenCalledTimes(1)
  await clickRun()
  expect(api.startRun.mock.calls[2]![2].idempotencyKey).toBe(next)
  expect(window.confirm).toHaveBeenCalledTimes(1)
})
