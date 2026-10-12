// @vitest-environment jsdom
import { isProxy } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useUiStore } from '@/stores/uiStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), listWorkflowTemplates: vi.fn() }))
vi.mock('@/services/api/workflowApi', async original => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({
  currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
  subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
}) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({
  currentProject: null, loadProjects: vi.fn(), selectProjectByWorkflow: vi.fn(),
  updateWorkflowStatus: vi.fn(), linkWorkflowToProject: vi.fn(),
}) }))

function sample(): WorkflowDefinition {
  return {
    id: 'sample', name: '示例工作流',
    nodes: [{
      id: 'start-1', type: 'workflow', position: { x: 0, y: 0 },
      data: { label: '开始', description: '', kind: 'start', status: 'idle',
        config: { prompt: '原始模板' }, inputs: [], outputs: ['output'] },
    }],
    edges: [],
  }
}

let wrapper: ReturnType<typeof mount> | undefined
let errors: unknown[] = []
beforeEach(() => {
  vi.clearAllMocks()
  errors = []
  api.getWorkflow.mockImplementation(async (id: string) => ({ id, name: '首次工作流', nodes: [], edges: [] }))
  api.listWorkflowTemplates.mockImplementation(async () => [sample()])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:id', component: WorkflowPage }],
  })
  await router.push('/workflows/new?name=首次工作流')
  await router.isReady()
  // 保留真实页面、路由和 Pinia，仅隔离画布渲染及无关的后端入口。
  wrapper = mount(RouterView, { global: {
    plugins: [pinia, router, i18n],
    config: { errorHandler: error => errors.push(error) },
    stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  return store
}

async function openTemplates() {
  await wrapper!.get('[data-action="workflow-templates"]').trigger('click')
  await flushPromises()
}

async function selectTemplate() {
  const button = wrapper!.findAll('[role="dialog"] button')
    .find(candidate => candidate.text().includes('示例工作流'))
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

it('新用户通过真实模板按钮选择后应用画布并关闭弹框', async () => {
  const store = await setup()
  await openTemplates()
  expect(isProxy(store.workflowTemplates[0])).toBe(true)
  expect(isProxy(store.workflowTemplates[0]!.nodes)).toBe(true)
  await selectTemplate()
  expect(errors).toEqual([])
  expect(store.nodes).toHaveLength(1)
  expect(store.workflowName).toBe('示例工作流')
  expect(store.workflowId).toBe('new')
  expect(store.dirty).toBe(true)
  expect(useUiStore().selectedNodeId).toBe('start-1')
  expect(wrapper!.find('[role="dialog"]').exists()).toBe(false)
})

it('重复点击选择模板经过丢弃确认，恢复模板配置且不共享旧画布', async () => {
  const store = await setup()
  await openTemplates()
  await selectTemplate()
  const previousNodes = store.nodes
  store.nodes[0]!.data.config.prompt = '编辑后的配置'
  vi.mocked(window.confirm).mockClear()
  await openTemplates()
  await selectTemplate()
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(errors).toEqual([])
  expect(store.nodes).not.toBe(previousNodes)
  expect(store.nodes[0]!.data.config.prompt).toBe('原始模板')
  expect(store.workflowTemplates[0]!.nodes[0]!.data.config.prompt).toBe('原始模板')
  expect(wrapper!.find('[role="dialog"]').exists()).toBe(false)
})

it('拒绝丢弃确认保留草稿和画布，模板弹框仍可关闭', async () => {
  const store = await setup()
  await openTemplates()
  await selectTemplate()
  store.workflowName = '原草稿'
  store.nodes[0]!.data.config.prompt = '保留编辑'
  const previousNodes = store.nodes
  vi.mocked(window.confirm).mockClear().mockReturnValue(false)
  await openTemplates()
  await selectTemplate()
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(errors).toEqual([])
  expect(store.workflowName).toBe('原草稿')
  expect(store.nodes).toBe(previousNodes)
  expect(store.nodes[0]!.data.config.prompt).toBe('保留编辑')
  expect(store.dirty).toBe(true)
  expect(wrapper!.find('[role="dialog"]').exists()).toBe(true)
  await wrapper!.get('[role="dialog"] button').trigger('click')
  expect(wrapper!.find('[role="dialog"]').exists()).toBe(false)
})
