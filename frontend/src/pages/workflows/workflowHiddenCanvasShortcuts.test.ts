// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosAdapter } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { WorkflowDefinitionDTO, WorkflowDefinitionEntity } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import WorkflowPage from './WorkflowPage.vue'

vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

const nativeAdapter = axiosInstance.defaults.adapter
let view: VueWrapper | undefined

function deferred() {
  let resolve!: (deliver: boolean) => void
  const promise = new Promise<boolean>(done => { resolve = done })
  return { promise, resolve }
}

function definition(id: number): WorkflowDefinitionEntity {
  return {
    id, name: `工作流 ${id}`, version: 1, status: 'ENABLED',
    definitionJson: JSON.stringify({
      nodes: [
        { nodeId: 'start', nodeType: 'START', config: { nextNodes: ['summary'] } },
        { nodeId: 'summary', nodeType: 'SUMMARY', config: { prompt: `原始提示 ${id}`, nextNodes: ['end'] } },
        { nodeId: 'end', nodeType: 'END', config: {} },
      ],
    }),
  }
}

function editor() {
  return view!.find('[data-testid="workflow-editor"]')
}

function prompt() {
  return view!.get<HTMLTextAreaElement>('[data-node-inspector="summary"] [data-config-field="prompt"]')
}

async function save() {
  const label = i18n.global.t('workflow.saveWorkflow')
  await view!.findAll('button').find(button => button.text() === label)!.trigger('click')
  await flushPromises()
}

function shortcut(target: HTMLElement, key = 'z', extras: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...extras })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

async function setup(firstRead: Promise<boolean>, retryRead: Promise<boolean> = Promise.resolve(true)) {
  const saved = { 201: definition(201), 202: definition(202) }
  const writes: Array<{ id: number; payload: WorkflowDefinitionDTO }> = []
  const bReadIntents = new Set<string>()
  const adapter: AxiosAdapter = async config => {
    if (config.method === 'get' && config.url === '/workflows/definitions/202') {
      const trace = String(config.headers.get('X-Trace-Id'))
      bReadIntents.add(trace)
      const initial = bReadIntents.values().next().value === trace
      if (!await (initial ? firstRead : retryRead)) {
        throw new AxiosError('定义暂不可读', 'ERR_BAD_RESPONSE', config, undefined, {
          data: { message: '定义暂不可读' }, status: 503, statusText: 'Unavailable', headers: {}, config,
        })
      }
      return { data: structuredClone(saved[202]), status: 200, statusText: 'OK', headers: {}, config }
    }
    if (config.url !== '/workflows/definitions/201') throw new Error(`Unexpected ${config.method} ${config.url}`)
    if (config.method === 'put') {
      const payload: WorkflowDefinitionDTO = JSON.parse(config.data)
      writes.push({ id: 201, payload })
      saved[201] = { ...saved[201], version: saved[201].version! + 1, definitionJson: JSON.stringify(payload) }
    }
    return { data: structuredClone(saved[201]), status: 200, statusText: 'OK', headers: {}, config }
  }
  axiosInstance.defaults.adapter = adapter
  localStorage.clear()
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/projects', component: { template: '<div data-testid="projects-page">项目</div>' } },
  ] })
  await router.push('/projects')
  await router.push('/workflows/201')
  view = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n],
    stubs: { teleport: true, WorkflowCanvas: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  useUiStore().setSelectedNode('summary')
  await flushPromises()
  await prompt().setValue('已保存的新提示')
  await save()
  expect(store.dirty).toBe(false)
  expect(store.canUndo).toBe(true)
  expect(writes).toHaveLength(1)
  expect(writes[0]!.payload.nodes.find(node => node.nodeId === 'summary')?.config?.prompt).toBe('已保存的新提示')
  return { store, router, writes, saved }
}

afterEach(() => {
  view?.unmount()
  view = undefined
  axiosInstance.defaults.adapter = nativeAdapter
  vi.restoreAllMocks()
})

it('新工作流读取中快捷键不修改上一个已保存画布', async () => {
  const b = deferred()
  const { store, router, writes } = await setup(b.promise)
  const revision = store.editRevision
  await router.push('/workflows/202')
  await flushPromises()
  expect(editor().exists()).toBe(false)
  expect(store.loading).toBe(true)
  expect.soft(shortcut(document.body)).toBe(false)
  expect.soft(store.editRevision).toBe(revision)
  expect.soft(store.dirty).toBe(false)

  b.resolve(true)
  await flushPromises()
  expect(editor().exists()).toBe(true)
  expect(prompt().element.value).toBe('原始提示 202')
  expect(writes).toHaveLength(1)
})

it('读取失败页的撤销键不会让返回项目突然要求保存', async () => {
  const { store, router, writes } = await setup(Promise.resolve(false))
  await router.push('/workflows/202')
  await flushPromises()
  await vi.waitFor(() => expect(view!.find('[data-testid="retry-workflow-load"]').exists()).toBe(true))
  const retry = view!.get<HTMLButtonElement>('[data-testid="retry-workflow-load"]').element
  retry.focus()
  expect.soft(shortcut(retry, 'z', { ctrlKey: false, metaKey: true })).toBe(false)
  expect.soft(store.dirty).toBe(false)
  expect.soft(store.nodes.find(node => node.id === 'summary')?.data.config.prompt).toBe('已保存的新提示')
  await view!.get('a[href="/projects"]').trigger('click')
  await flushPromises()
  expect.soft(view!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
  expect(router.currentRoute.value.path).toBe('/projects')
  expect(writes).toHaveLength(1)
})

it('重试保持旧画布不动；可见编辑器正常撤销、重做并重新读回修改', async () => {
  const b = deferred()
  const { store, router, writes, saved } = await setup(Promise.resolve(false), b.promise)
  expect(shortcut(document.body)).toBe(true)
  await flushPromises()
  expect(prompt().element.value).toBe('原始提示 201')
  expect(shortcut(document.body, 'y')).toBe(true)
  await flushPromises()
  expect(prompt().element.value).toBe('已保存的新提示')
  expect(shortcut(document.body)).toBe(true)
  await save()
  expect(store.canRedo).toBe(true)
  expect(store.dirty).toBe(false)
  expect(writes).toHaveLength(2)
  expect(saved[201].version).toBe(3)

  await router.push('/workflows/202')
  await flushPromises()
  await vi.waitFor(() => expect(view!.find('[data-testid="retry-workflow-load"]').exists()).toBe(true))
  const retry = view!.get<HTMLButtonElement>('[data-testid="retry-workflow-load"]').element
  retry.focus()
  retry.click()
  await flushPromises()
  expect(retry.getAttribute('aria-disabled')).toBe('true')
  expect.soft(shortcut(retry, 'z', { ctrlKey: false, metaKey: true, shiftKey: true })).toBe(false)
  expect.soft(store.canRedo).toBe(true)
  expect.soft(store.dirty).toBe(false)
  b.resolve(true)
  await flushPromises()
  await router.push('/workflows/201')
  await flushPromises()
  expect(prompt().element.value).toBe('原始提示 201')
  expect(writes).toHaveLength(2)
})
