// @vitest-environment jsdom
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import type { AxiosAdapter } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, isNavigationFailure, NavigationFailureType, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { axiosInstance } from '@/api/client/apiClient'
import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import WorkflowPage from './WorkflowPage.vue'

vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({
  currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn().mockResolvedValue(null),
  subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
}) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

// 与 WorkflowServiceImpl.listTemplates 返回的两项内置内容一致，仅替代 Axios 传输。
const templates: WorkflowDefinitionDTO[] = [
  { name: 'Media digest', description: 'Upload media, transcribe and summarize the content.', nodes: [
    { nodeId: 'start', nodeType: 'START', displayName: 'Start', config: { nextNodes: ['upload'] } },
    { nodeId: 'upload', nodeType: 'UPLOAD', displayName: 'Input media', config: { nextNodes: ['whisper'], fileIdVariable: 'fileId' } },
    { nodeId: 'whisper', nodeType: 'WHISPER', displayName: 'Transcribe media', config: { nextNodes: ['summary'], fileUrlVariable: 'fileUrl', language: 'auto' } },
    { nodeId: 'summary', nodeType: 'SUMMARY', displayName: 'Summarize transcript', config: { nextNodes: ['end'], textVariable: 'text' } },
    { nodeId: 'end', nodeType: 'END', displayName: 'Complete', config: {} },
  ] },
  { name: 'Text summary', description: 'Generate a concise summary from a prompt.', nodes: [
    { nodeId: 'start', nodeType: 'START', displayName: 'Start', config: { nextNodes: ['llm'] } },
    { nodeId: 'llm', nodeType: 'LLM', displayName: 'Generate summary', config: { nextNodes: ['end'], promptVariable: 'prompt' } },
    { nodeId: 'end', nodeType: 'END', displayName: 'Complete', config: {} },
  ] },
]
const originalAdapter = axiosInstance.defaults.adapter
let wrapper: ReturnType<typeof mount> | undefined
let requests: string[]
let saveReceipt: Promise<unknown> | undefined
let nextTemplateList: Promise<WorkflowDefinitionDTO[]> | undefined
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  requests = []
  saveReceipt = undefined
  nextTemplateList = undefined
  const adapter: AxiosAdapter = async config => {
    requests.push(`${config.method} ${config.url}`)
    let data: unknown
    if (config.method === 'get' && config.url === '/workflows/templates') {
      const list = nextTemplateList
      nextTemplateList = undefined
      data = list ? await list : templates
    } else if (config.method === 'post' && config.url === '/workflows/definitions' && saveReceipt) {
      const receipt = saveReceipt
      saveReceipt = undefined
      data = await receipt
    } else {
      throw new Error('意外的请求')
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
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
async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/files', component: { template: '<div />' } },
  ] })
  await router.push('/workflows/new?name=模板首跑')
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n],
    stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  return { store, router }
}
const dialog = () => wrapper!.get('[aria-labelledby="workflow-template-title"]')
const opener = () => wrapper!.get<HTMLButtonElement>('[data-action="workflow-templates"]')
const option = (name: string) => dialog().findAll('button').find(button => button.text().includes(name))!
async function open() {
  opener().element.focus()
  await opener().trigger('click')
  await flushPromises()
}
async function apply(name: string) {
  await option(name).trigger('click')
  await flushPromises()
}


const picker = () => wrapper!.find('[aria-labelledby="workflow-template-title"]')
const templateError = () => wrapper!.find('[data-testid="workflow-template-load-error"]')
async function startFirstSave() {
  const { store, router } = await setup()
  await open()
  await apply('Media digest')
  vi.mocked(window.confirm).mockClear()
  const save = deferred<unknown>()
  saveReceipt = save.promise
  await wrapper!.findAll('button').find(button => button.text() === i18n.global.t('workflow.saveWorkflow'))!.trigger('click')
  await flushPromises()
  expect(requests).toEqual(['get /workflows/templates', 'post /workflows/definitions'])
  expect(router.currentRoute.value.params.id).toBe('new')
  expect(store.backendDefinitionId).toBeNull()
  return { store, router, confirmSave: () => save.resolve({ id: 501, version: 1, name: 'Media digest' }) }
}

it('首次保存只更新当前模板画布地址，仍在读取的下一次模板列表可以打开', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  const list = deferred<WorkflowDefinitionDTO[]>()
  nextTemplateList = list.promise
  await open()
  expect(opener().attributes('disabled')).toBeDefined()
  confirmSave(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/workflows/501')
  expect(store.workflowName).toBe('Media digest')
  expect(store.dirty).toBe(false)
  list.resolve(templates); await flushPromises()
  expect(picker().exists()).toBe(true)
  expect(dialog().text()).toContain('Text summary')
  expect(document.activeElement).toBe(dialog().get('button').element)
  expect(requests).toEqual(['get /workflows/templates', 'post /workflows/definitions', 'get /workflows/templates'])
  await apply('Text summary')
  expect(store.dirty).toBe(true)
  expect(store.backendDefinitionId).toBeNull()
  expect(store.workflowName).toBe('Text summary')
  expect(store.nodes.find(node => node.data.kind === 'llm')?.data.config.promptVariable).toBe('prompt')
  expect(window.confirm).not.toHaveBeenCalled()
})

it('首存地址更新不关闭已打开的模板选择器，不打断选项焦点', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  await open()
  const alternate = option('Text summary').element
  alternate.focus()
  expect(document.activeElement).toBe(alternate)
  confirmSave(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/workflows/501')
  expect(picker().exists()).toBe(true)
  expect(document.activeElement).toBe(alternate)
  await option('Text summary').trigger('keydown', { key: 'Escape' })
  await flushPromises()
  expect(picker().exists()).toBe(false)
  expect(document.activeElement).toBe(opener().element)
  expect(document.body.style.overflow).toBe('')
  expect(store.workflowName).toBe('Media digest')
})

it('模板结果在首存路由守卫阻塞时到达，保留请求并在地址提交后打开', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  const list = deferred<WorkflowDefinitionDTO[]>()
  nextTemplateList = list.promise
  await open()
  const routeGate = deferred<boolean>()
  const observed = vi.fn()
  const removeGuard = router.beforeResolve(to => {
    if (to.params.id !== '501') return
    observed()
    return routeGate.promise
  })
  confirmSave(); await flushPromises()
  expect(observed).toHaveBeenCalledOnce()
  expect(router.currentRoute.value.params.id).toBe('new')
  list.resolve(templates); await flushPromises()
  expect(picker().exists()).toBe(false)
  routeGate.resolve(true); await flushPromises()
  removeGuard()
  expect(router.currentRoute.value.params.id).toBe('501')
  expect(store.workflowName).toBe('Media digest')
  expect(picker().exists()).toBe(true)
  expect(dialog().text()).toContain('Text summary')
  expect(document.activeElement).toBe(dialog().get('button').element)
  expect(requests.filter(request => request === 'get /workflows/templates')).toHaveLength(2)
})

it('首次保存不抹去同一画布的模板目录失败提示，可以就地重试', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  const list = deferred<WorkflowDefinitionDTO[]>()
  nextTemplateList = list.promise
  await open()
  list.reject(new Error('首跑模板目录尚不可用')); await flushPromises()
  expect(templateError().text()).toContain('首跑模板目录尚不可用')
  confirmSave(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/workflows/501')
  expect(templateError().exists()).toBe(true)
  expect(templateError().text()).toContain('首跑模板目录尚不可用')
  expect(opener().attributes('aria-describedby')).toBe(templateError().attributes('id'))
  await open()
  expect(picker().exists()).toBe(true)
  expect(templateError().exists()).toBe(false)
  expect(store.workflowName).toBe('Media digest')
  expect(requests.filter(request => request === 'get /workflows/templates')).toHaveLength(3)
})

it('工具栏首次保存回执不抢占处于异步守卫的同路由导航', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  const pending = deferred<boolean>()
  const entered = deferred<void>()
  router.beforeEach(async to => {
    if (to.fullPath === '/workflows/new') {
      entered.resolve()
      return pending.promise
    }
  })
  const userNavigation = router.push('/workflows/new')
  await entered.promise
  confirmSave()
  await flushPromises()
  expect.soft(router.currentRoute.value.fullPath).toBe('/workflows/new?name=模板首跑')
  expect(store.dirty).toBe(false)

  pending.resolve(true)
  expect.soft(await userNavigation).toBeUndefined()
  await flushPromises()
  expect.soft(router.currentRoute.value.fullPath).toBe('/workflows/new')
  expect(requests).toEqual(['get /workflows/templates', 'post /workflows/definitions'])
})

it('用户目标被守卫拒绝后，才在原编辑器补上首存正式地址', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  const pending = deferred<boolean>()
  const entered = deferred<void>()
  router.beforeEach(to => {
    if (to.fullPath === '/workflows/new') {
      entered.resolve()
      return pending.promise
    }
  })
  const userNavigation = router.push('/workflows/new')
  await entered.promise
  confirmSave()
  await flushPromises()
  expect.soft(router.currentRoute.value.fullPath).toBe('/workflows/new?name=模板首跑')
  expect(store.backendDefinitionId).toBe(501)
  const graph = JSON.stringify(store.nodes)
  pending.resolve(false)
  expect.soft(isNavigationFailure(await userNavigation, NavigationFailureType.aborted)).toBe(true)
  await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe('/workflows/501')
  expect(JSON.stringify(store.nodes)).toBe(graph)
  expect(requests).toEqual(['get /workflows/templates', 'post /workflows/definitions'])
})

it('等待同一画布的定位与锚点导航，规范化后的地址仍保留其目标', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  const pending = deferred<boolean>()
  const entered = deferred<void>()
  router.beforeEach(to => {
    if (to.params.id === 'new' && to.hash === '#summary') {
      entered.resolve()
      return pending.promise
    }
  })
  const userNavigation = router.push({ path: '/workflows/new', query: { name: '模板首跑', nodeId: 'summary' }, hash: '#summary' })
  await entered.promise
  confirmSave()
  await flushPromises()
  expect.soft(router.currentRoute.value.params.id).toBe('new')
  const graph = JSON.stringify(store.nodes)
  pending.resolve(true)
  expect.soft(await userNavigation).toBeUndefined()
  await flushPromises()

  expect.soft(router.currentRoute.value.fullPath).toBe('/workflows/501?nodeId=summary#summary')
  expect(JSON.stringify(store.nodes)).toBe(graph)
  expect(requests).toEqual(['get /workflows/templates', 'post /workflows/definitions'])
})

it('守卫等候期间有较新编辑，换画布前仍询问，留在当前画布保留新编辑', async () => {
  const { store, router, confirmSave } = await startFirstSave()
  const pending = deferred<boolean>()
  const entered = deferred<void>()
  router.beforeEach(to => {
    if (to.fullPath === '/workflows/new') {
      entered.resolve()
      return pending.promise
    }
  })
  const userNavigation = router.push('/workflows/new')
  await entered.promise
  confirmSave()
  await flushPromises()
  expect.soft(router.currentRoute.value.params.id).toBe('new')
  store.updateNodeConfig('summary', 'textVariable', '后续手动编辑')
  expect(store.dirty).toBe(true)
  const graph = JSON.stringify(store.nodes)
  const history = JSON.stringify(store.historyPast)
  pending.resolve(true)
  await flushPromises()
  const dialog = new DOMWrapper(document.body).find('[data-testid="unsaved-navigation-dialog"]')
  expect.soft(dialog.exists()).toBe(true)
  if (dialog.exists()) await dialog.get('[data-action="leave-stay"]').trigger('click')
  expect.soft(isNavigationFailure(await userNavigation, NavigationFailureType.aborted)).toBe(true)
  await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe('/workflows/501')
  expect(store.dirty).toBe(true)
  expect(JSON.stringify(store.nodes)).toBe(graph)
  expect(JSON.stringify(store.historyPast)).toBe(history)
  expect(requests).toEqual(['get /workflows/templates', 'post /workflows/definitions'])
})
