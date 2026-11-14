// @vitest-environment jsdom
import { isProxy } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
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

function dynamicPromptTemplate(id: string): WorkflowDefinition {
  return {
    id, name: `动态模板 ${id}`,
    nodes: [{
      id: `llm-${id}`, type: 'workflow', position: { x: 0, y: 0 },
      data: { label: `模型 ${id}`, description: '', kind: 'llm', status: 'idle',
        config: { promptVariable: 'question', prompt: '' }, inputs: [], outputs: ['response'] },
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
  wrapper = mount(RouterView, { attachTo: document.body, global: {
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

it('同页切换到同名动态输入变量的模板后清空先前运行输入', async () => {
  api.listWorkflowTemplates.mockResolvedValue([dynamicPromptTemplate('first'), dynamicPromptTemplate('second')])
  await setup()
  await openTemplates()
  const select = async (name: string) => {
    const button = wrapper!.findAll('[role="dialog"] button').find(candidate => candidate.text().includes(name))
    expect(button).toBeDefined()
    await button!.trigger('click')
    await flushPromises()
  }

  await select('动态模板 first')
  await wrapper!.get<HTMLTextAreaElement>('[data-run-input="question"]').setValue('只属于第一个模板的提示词')
  await openTemplates()
  await select('动态模板 second')

  expect(wrapper!.get<HTMLTextAreaElement>('[data-run-input="question"]').element.value).toBe('')
})

it('模板克隆失败时保留当前模板的运行输入', async () => {
  const invalidTemplate = dynamicPromptTemplate('invalid')
  invalidTemplate.nodes[0]!.data.config.uncloneable = () => undefined
  api.listWorkflowTemplates.mockResolvedValue([dynamicPromptTemplate('first'), invalidTemplate])
  const store = await setup()
  await openTemplates()
  const select = async (name: string) => {
    const button = wrapper!.findAll('[role="dialog"] button').find(candidate => candidate.text().includes(name))
    expect(button).toBeDefined()
    await button!.trigger('click')
    await flushPromises()
  }

  await select('动态模板 first')
  await wrapper!.get<HTMLTextAreaElement>('[data-run-input="question"]').setValue('仍属于当前画布的运行输入')
  await openTemplates()
  await select('动态模板 invalid')

  expect(errors).toHaveLength(1)
  expect(store.workflowName).toBe('动态模板 first')
  expect(wrapper!.get<HTMLTextAreaElement>('[data-run-input="question"]').element.value).toBe('仍属于当前画布的运行输入')
  expect(wrapper!.find('[role="dialog"]').exists()).toBe(true)
})

it('模板弹框打开时屏蔽撤销重做快捷键，关闭后恢复快捷键', async () => {
  const store = await setup()
  const start = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })!
  store.updateNodeConfig(start.id, 'description', '初始修改')
  expect(store.undo()).toBe(true)
  const before = JSON.stringify({ nodes: store.nodes, past: store.historyPast, future: store.historyFuture })

  await openTemplates()
  const closeButton = wrapper!.get('[role="dialog"] button')
  ;(closeButton.element as HTMLElement).focus()
  const dispatch = (key: string, options: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => {
    closeButton.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
  }
  dispatch('z', { ctrlKey: true })
  expect(JSON.stringify({ nodes: store.nodes, past: store.historyPast, future: store.historyFuture })).toBe(before)
  dispatch('z', { ctrlKey: true, shiftKey: true })
  expect(JSON.stringify({ nodes: store.nodes, past: store.historyPast, future: store.historyFuture })).toBe(before)
  dispatch('y', { ctrlKey: true })
  expect(JSON.stringify({ nodes: store.nodes, past: store.historyPast, future: store.historyFuture })).toBe(before)

  await closeButton.trigger('click')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
  expect(store.nodes).toHaveLength(0)
})
