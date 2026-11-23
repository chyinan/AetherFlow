// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import type { AxiosAdapter } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
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
beforeEach(() => {
  requests = []
  const adapter: AxiosAdapter = async config => {
    requests.push(`${config.method} ${config.url}`)
    if (config.method !== 'get' || config.url !== '/workflows/templates') throw new Error('意外的请求')
    return { data: templates, status: 200, statusText: 'OK', headers: {}, config }
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
  return store
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

it('首跑向导仍打开时，模板层以编辑器而非裁剪画布为定位范围', async () => {
  await setup()
  await open()
  await apply('Media digest')
  expect(wrapper!.find('[data-testid="workflow-starter-guide"]').exists()).toBe(true)
  await open()
  const editor = wrapper!.get('[data-testid="workflow-editor"]')
  const canvasContent = editor.get('.contents[inert]')
  expect(canvasContent.element.parentElement?.classList.contains('lg:overflow-hidden')).toBe(true)
  expect(dialog().element.parentElement?.parentElement === editor.element).toBe(true)
  expect(editor.classes()).toContain('relative')
  expect(dialog().element.parentElement?.classList.contains('grid-rows-[minmax(0,1fr)]')).toBe(true)
  expect(dialog().text()).toContain('Media digest')
  expect(dialog().text()).toContain('Text summary')
})

it('模板弹框有自己的限高与滚动边界，不依赖背景画布或页面滚动', async () => {
  await setup()
  await open()
  const panel = dialog()
  // jsdom 仅检查 DOM 到样式的契约，不能测真实视口、滚动尺寸或文字断行。
  expect(panel.classes()).toEqual(expect.arrayContaining([
    'min-h-0', 'max-h-full', 'min-w-0', 'overflow-y-auto', 'overscroll-contain', '[overflow-wrap:anywhere]',
  ]))
  expect(panel.element.parentElement?.classList.contains('overflow-hidden')).toBe(true)
  expect(panel.findAll('button')).toHaveLength(3)
  expect(document.body.style.overflow).toBe('hidden')
})

it('通过键盘范围到达最后一个模板，退出归还焦点，再确认替换草稿', async () => {
  const store = await setup()
  await open()
  await apply('Media digest')
  expect(store.nodes.map(node => node.data.kind)).toEqual(['start', 'upload', 'whisper', 'summary', 'output'])
  await open()
  const close = dialog().get('button')
  expect(document.activeElement).toBe(close.element)
  await close.trigger('keydown', { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(option('Text summary').element)
  await option('Text summary').trigger('keydown', { key: 'Escape' })
  await flushPromises()
  expect(wrapper!.find('[aria-labelledby="workflow-template-title"]').exists()).toBe(false)
  expect(document.activeElement).toBe(opener().element)
  expect(document.body.style.overflow).toBe('')
  expect(store.workflowName).toBe('Media digest')

  vi.mocked(window.confirm).mockClear()
  await open()
  await apply('Text summary')
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(store.workflowName).toBe('Text summary')
  expect(store.nodes.find(node => node.data.kind === 'llm')?.data.config.promptVariable).toBe('prompt')
  expect(wrapper!.find('[aria-labelledby="workflow-template-title"]').exists()).toBe(false)
  expect(requests).toEqual(Array(3).fill('get /workflows/templates'))
})
