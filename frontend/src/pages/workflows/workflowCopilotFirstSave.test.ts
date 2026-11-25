// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { conversationSessionKey, readConversationSelection } from '@/services/copilot/copilotConversationSession'
import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(), subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn(), inputFiles: [] }) }))

let wrapper: ReturnType<typeof mount> | undefined
let release!: () => void
let phase: 'model' | 'validation' | 'finished'
let failLate: boolean
let failSave: boolean
let nodeId: string
let edits: number
let requestSignal: AbortSignal | undefined
const requested = '把开始节点重命名为 AI 开始'
const changedLabel = (turn: number) => `AI 开始 ${turn}`

beforeEach(() => {
 vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); i18n.global.locale.value = 'zh-CN'
 failLate = false; failSave = false; edits = 0; requestSignal = undefined
 http.get.mockImplementation(async (url: string) => {
  if (url === '/ai/provider/catalog') return { providers: [], models: [] }
  if (url === '/projects') return { records: [], total: 0 }
  return []
 })
 http.post.mockImplementation(async (url: string, body: any, options?: { signal?: AbortSignal }) => {
  if (url === '/copilot/canvas-edit') {
   const turn = ++edits
   requestSignal = options?.signal
   if (phase === 'model' && turn === 1) await new Promise<void>(resolve => { release = resolve })
   if (failLate && turn === 1) throw { status: 503, message: '模型暂时不可用' }
   return { message: { id: `edit-${turn}`, conversationId: `conv-${41 + turn}`, role: 'assistant', content: '已生成重命名方案。', createdAt: '22:56' }, edit: { status: 'READY', explanation: '重命名', operations: [{ type: 'update_node', nodeId, label: changedLabel(turn) }] } }
  }
  if (url === '/workflows/drafts/validate') {
   if (phase === 'validation' && edits === 1) await new Promise<void>(resolve => { release = resolve })
   if (failLate && edits === 1) throw { status: 503, message: '校验暂时不可用' }
   return { structurallyValid: true, runtimeReady: true, issues: [] }
  }
  if (url === '/workflows/definitions') {
   if (failSave) throw { status: 422, message: '保存失败' }
   return { id: 201, name: body.name, projectId: body.projectId, status: 'DRAFT', version: 1, definitionJson: JSON.stringify(body) }
  }
  throw new Error('unexpected ' + url)
 })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

async function setup(stage: typeof phase) {
 phase = stage
 const pinia = createPinia(); setActivePinia(pinia)
 const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/workflows/:id', component: WorkflowPage }] })
 await router.push('/workflows/new?name=保存与编辑竞态')
 wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: {
  WorkflowCanvas: { template: '<div></div>', methods: { fitCanvas() {} } }, RunConsole: true,
 } } })
 await flushPromises()
 const store = useWorkflowStore()
 const start = store.addNodeFromTemplate(store.templates.find(x => x.kind === 'start')!, { x: 1, y: 2 })!; nodeId = start.id
 const output = store.addNodeFromTemplate(store.templates.find(x => x.kind === 'output')!, { x: 300, y: 2 })!
 store.addConnection({ source: start.id, target: output.id, sourceHandle: null, targetHandle: null })
 await flushPromises()
 await wrapper.get(`button[aria-label="${i18n.global.t('workflow.openCopilot')}"]`).trigger('click')
 const panel = wrapper.getComponent(AICopilotPanel)
 await panel.get('form textarea').setValue(requested); await panel.get('form').trigger('submit'); await flushPromises()
 return { store, router, panel, uid: panel.vm.$.uid, originalLabel: start.data.label }
}
async function save() {
 const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map(k => i18n.global.t(k))
 await wrapper!.findAll('button').find(x => labels.includes(x.text()))!.trigger('click'); await flushPromises()
}
const editCalls = () => http.post.mock.calls.filter(call => call[0] === '/copilot/canvas-edit')

it.each(['model', 'validation'] as const)('首次保存打断 %s：立即说明未应用，忽略旧响应，显式重发使用已保存画布', async stage => {
 const { store, router, panel, uid, originalLabel } = await setup(stage)
 const historyLength = store.historyPast.length
 const oldKey = conversationSessionKey(panel.props('context'))
 expect(release).toBeTypeOf('function')
 const signal = requestSignal
 await save()
 expect(store.workflowId).toBe('201'); expect(router.currentRoute.value.params.id).toBe('201')
 expect(wrapper!.getComponent(AICopilotPanel).vm.$.uid).toBe(uid)
 expect(signal?.aborted).toBe(true)
 expect(panel.text()).not.toContain(i18n.global.t('copilot.editor.working'))
 expect(panel.text()).toContain(i18n.global.t('copilot.editor.savedDuringEdit'))
 if (stage === 'validation') expect(panel.text()).toContain('已生成重命名方案。')
 expect(panel.get<HTMLButtonElement>('button[type="submit"]').element.disabled).toBe(false)
 expect(panel.get<HTMLTextAreaElement>('form textarea').element.value).toBe(requested)
 expect(readConversationSelection(conversationSessionKey(panel.props('context')))).toBe('new')
 if (stage === 'validation') expect(readConversationSelection(oldKey)).toBe('conv-42')
 release(); await flushPromises()
 expect(store.nodes.find(x => x.id === nodeId)!.data.label).toBe(originalLabel)
 expect(store.historyPast).toHaveLength(historyLength)
 expect(panel.text()).toContain(i18n.global.t('copilot.editor.savedDuringEdit'))
 await panel.get('form').trigger('submit'); await flushPromises()
 expect(editCalls()).toHaveLength(2)
 expect(editCalls()[1]![1]).toMatchObject({ workflowId: '201', prompt: requested })
 expect(editCalls()[1]![1].conversationId).toBeUndefined()
 expect(store.nodes.find(x => x.id === nodeId)!.data.label).toBe(changedLabel(2))
 expect(store.historyPast).toHaveLength(historyLength + 1)
 expect(panel.text()).toContain(i18n.global.t('copilot.editor.applied', { count: 1 }))
 expect(http.post.mock.calls.filter(call => call[0] === '/workflows/drafts/validate').at(-1)![1]).toMatchObject({ definitionId: 201, expectedVersion: 1, recipe: 'CANVAS_EDIT' })
})

it.each(['model', 'validation'] as const)('首次保存后迟到的 %s 错误不覆盖结果或用户新草稿', async stage => {
 const { panel, store, originalLabel } = await setup(stage)
 await panel.get('form textarea').setValue('接下来修改输出节点，不要覆盖此草稿')
 await save(); failLate = true; release(); await flushPromises()
 expect(panel.get<HTMLTextAreaElement>('form textarea').element.value).toBe('接下来修改输出节点，不要覆盖此草稿')
 expect(panel.text()).toContain(i18n.global.t('copilot.editor.savedDuringEdit'))
 expect(panel.text()).not.toContain('暂时不可用')
 expect(store.nodes.find(x => x.id === nodeId)!.data.label).toBe(originalLabel)
})

it('首次保存失败不打断仍属于当前草稿的直接编辑', async () => {
 const { panel, store } = await setup('model'); failSave = true
 await save(); expect(store.workflowId).toBe('new'); expect(requestSignal?.aborted).toBe(false)
 release(); await flushPromises()
 expect(store.nodes.find(x => x.id === nodeId)!.data.label).toBe(changedLabel(1))
 expect(panel.text()).toContain(i18n.global.t('copilot.editor.applied', { count: 1 }))
 expect(panel.text()).not.toContain(i18n.global.t('copilot.editor.savedDuringEdit'))
})

it('已经完成的直接编辑不因后续首次保存被改写为失败', async () => {
 const { panel, store } = await setup('finished'); await save()
 expect(store.nodes.find(x => x.id === nodeId)!.data.label).toBe(changedLabel(1))
 expect(panel.text()).toContain(i18n.global.t('copilot.editor.applied', { count: 1 }))
 expect(panel.text()).not.toContain(i18n.global.t('copilot.editor.savedDuringEdit'))
})

it('用户先取消的请求不会被首次保存重新标成保存中断', async () => {
 const { panel, store, originalLabel } = await setup('model')
 await panel.findAll('button').find(x => x.text() === i18n.global.t('copilot.editor.cancel'))!.trigger('click')
 await save(); release(); await flushPromises()
 expect(store.nodes.find(x => x.id === nodeId)!.data.label).toBe(originalLabel)
 expect(panel.text()).toContain(i18n.global.t('copilot.editor.cancelled'))
 expect(panel.text()).not.toContain(i18n.global.t('copilot.editor.savedDuringEdit'))
})
