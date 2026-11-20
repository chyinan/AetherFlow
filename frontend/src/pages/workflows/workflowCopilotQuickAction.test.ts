// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { TextDecoder, TextEncoder } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({
  apiClient: http,
  setUnauthorizedSessionRefresher: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}))
vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

let wrapper: ReturnType<typeof mount> | undefined
const fetchStream = vi.fn()
const conversationFrame = 'event: conversation\ndata: {"conversationId":"conv-42"}\n\n'
const completeFrame = 'event: complete\ndata: {"id":"msg-42","conversationId":"conv-42","role":"assistant","content":"建议添加上传节点。","createdAt":"08:00"}\n\n'

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal('TextDecoder', TextDecoder)
  vi.stubGlobal('fetch', fetchStream)
  http.get.mockImplementation(async (url: string) => {
    if (url === '/ai/provider/catalog') return { providers: [], models: [] }
    if (url === '/projects') return { records: [], total: 0 }
    return []
  })
  fetchStream.mockResolvedValue(new Response(
    conversationFrame + completeFrame,
    { headers: { 'Content-Type': 'text/event-stream' } },
  ))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

async function openRecommendation({ pending = false } = {}) {
  let finishResponse: (() => void) | undefined
  if (pending) {
    const encoder = new TextEncoder()
    const bytes = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(conversationFrame))
        finishResponse = () => {
          controller.enqueue(encoder.encode(completeFrame))
          controller.close()
        }
      },
    })
    fetchStream.mockResolvedValueOnce(new Response(bytes, { headers: { 'Content-Type': 'text/event-stream' } }))
  }
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:id', component: WorkflowPage }],
  })
  await router.push('/workflows/new?name=推荐测试')
  wrapper = mount(RouterView, {
    global: { plugins: [pinia, router, i18n], stubs: { WorkflowCanvas: true, RunConsole: true } },
  })
  await flushPromises()

  const store = useWorkflowStore()
  const source = store.addNodeFromTemplate(store.templates.find((template) => template.kind === 'start')!, { x: 40, y: 60 })!
  expect(source).toBeTruthy()
  await wrapper.get(`button[aria-label="${i18n.global.t('workflow.openCopilot')}"]`).trigger('click')
  const panel = wrapper.getComponent(AICopilotPanel)
  const suggest = panel.findAll('button').find((button) => button.text() === i18n.global.t('copilot.quickSuggestNextNode'))!
  await suggest.trigger('click')
  await flushPromises()
  expect(fetchStream).toHaveBeenCalledTimes(1)
  expect(JSON.parse(fetchStream.mock.calls[0]![1].body).context.recommendedNextNode)
    .toEqual({ type: 'add-node-after', sourceNodeId: source.id, nodeKind: 'upload' })
  const latestReply = () => panel.findAll('article').at(-1)!
  const reply = latestReply()
  if (!pending) expect(reply.text()).toContain('建议添加上传节点。')
  const finish = async () => {
    finishResponse?.()
    await flushPromises()
    const reply = latestReply()
    expect(reply.text()).toContain('建议添加上传节点。')
    return { reply, action: reply.get('button') }
  }
  return { store, source, reply, action: reply.get('button'), finish }
}

function toolbar(key: 'undo' | 'redo') {
  return wrapper!.get(`button[aria-label="${i18n.global.t(`workflow.${key}`)}"]`)
}

describe('Copilot 推荐的单节点操作回执', () => {
  it('撤销来源节点后点击，不把未发生的画布编辑显示为已应用', async () => {
    const { store, reply, action } = await openRecommendation()
    await toolbar('undo').trigger('click')
    expect(store.nodes).toHaveLength(0)
    const revision = store.editRevision
    await action.trigger('click')
    expect(store.nodes).toHaveLength(0)
    expect(store.edges).toHaveLength(0)
    expect(store.editRevision).toBe(revision)
    expect(action.text()).not.toBe(i18n.global.t('copilot.actions.applied'))
    expect(action.attributes('disabled')).toBeUndefined()
    expect(reply.get('[role="status"]').text()).toContain('未能添加节点')
    expect(fetchStream).toHaveBeenCalledTimes(1)
    expect(http.post).not.toHaveBeenCalled()
  })

  it('恢复同一个来源节点后可重试原操作，不另发消息或重复插入', async () => {
    const { store, source, reply, action } = await openRecommendation()
    await toolbar('undo').trigger('click')
    await action.trigger('click')
    await toolbar('redo').trigger('click')
    expect(store.nodes.map((node) => node.id)).toEqual([source.id])
    await action.trigger('click')
    expect(store.nodes.map((node) => node.data.kind)).toEqual(['start', 'upload'])
    expect(store.edges.map(({ source, target }) => ({ source, target })))
      .toEqual([{ source: source.id, target: store.nodes[1].id }])
    expect(action.text()).toBe(i18n.global.t('copilot.actions.applied'))
    expect(reply.find('[role="status"]').exists()).toBe(false)
    await action.trigger('click')
    expect(store.nodes).toHaveLength(2)
    expect(fetchStream).toHaveBeenCalledTimes(1)
    expect(http.post).not.toHaveBeenCalled()
  })

  it('流式回复结束后，保留已实际添加的回执，不再次添加', async () => {
    const { store, action, finish } = await openRecommendation({ pending: true })
    await action.trigger('click')
    expect(store.nodes.map((node) => node.data.kind)).toEqual(['start', 'upload'])
    expect(action.text()).toBe(i18n.global.t('copilot.actions.applied'))
    const completed = await finish()
    await completed.action.trigger('click')
    expect(completed.action.text()).toBe(i18n.global.t('copilot.actions.applied'))
    expect(completed.action.attributes('disabled')).toBeDefined()
    expect(store.nodes).toHaveLength(2)
    expect(store.edges).toHaveLength(1)
    expect(fetchStream).toHaveBeenCalledTimes(1)
  })

  it('流式回复结束后，保留未添加的回执，恢复原节点可重试', async () => {
    const { store, source, action, finish } = await openRecommendation({ pending: true })
    await toolbar('undo').trigger('click')
    await action.trigger('click')
    expect(store.nodes).toHaveLength(0)
    const completed = await finish()
    expect(completed.reply.get('[role="status"]').text()).toContain('未能添加节点')
    expect(completed.action.attributes('disabled')).toBeUndefined()
    await toolbar('redo').trigger('click')
    expect(store.nodes.map((node) => node.id)).toEqual([source.id])
    await completed.action.trigger('click')
    expect(store.nodes.map((node) => node.data.kind)).toEqual(['start', 'upload'])
    expect(completed.reply.find('[role="status"]').exists()).toBe(false)
    expect(fetchStream).toHaveBeenCalledTimes(1)
  })

  it('对有效建议仍只添加一次，且保留正常撤销', async () => {
    const { store, source, reply, action } = await openRecommendation()
    await action.trigger('click')
    expect(store.nodes.map((node) => node.data.kind)).toEqual(['start', 'upload'])
    expect(store.edges[0]?.source).toBe(source.id)
    expect(action.text()).toBe(i18n.global.t('copilot.actions.applied'))
    expect(action.attributes('disabled')).toBeDefined()
    expect(reply.find('[role="status"]').exists()).toBe(false)
    await action.trigger('click')
    await toolbar('undo').trigger('click')
    expect(store.nodes.map((node) => node.id)).toEqual([source.id])
    expect(store.edges).toHaveLength(0)
    expect(fetchStream).toHaveBeenCalledTimes(1)
    expect(http.post).not.toHaveBeenCalled()
  })
})
