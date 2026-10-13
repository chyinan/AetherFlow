// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
const { get, post, put, refreshSnapshot } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), refreshSnapshot: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: { get, post, put }, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: { refreshSnapshot } }))
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { readConversationSelection, conversationSessionKey } from '@/services/copilot/copilotConversationSession'
import AICopilotPanel from './AICopilotPanel.vue'
let wrapper: ReturnType<typeof mount>
let summaries: any[]
let histories: Record<string, any[]>
let requests: any[]
let failNext: boolean
const firstPrompt = '请分析这个工作流，输出三步排查方案，保留每一步的输入输出说明'
const partial = '第一步，先检查开始节点的输入变量'
const message = (id: string, role: string, content: string) => ({ id, role, content, createdAt: '01:00' })
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); summaries = []; histories = {}; requests = []; failNext = true
  refreshSnapshot.mockReset().mockResolvedValue({ providers: [{ id: 'provider-ollama', providerType: 'OLLAMA', name: 'Ollama', runtime: 'local', status: 'online', endpoint: 'http://localhost:11434', defaultModel: 'qwen3:8b', latencyMs: 10, quotaUsed: 0, capabilities: ['chat'], lastCheckedAt: '' }], models: [{ id: 'model-qwen3', providerId: 'provider-ollama', name: 'qwen3:8b', kind: 'chat', contextWindow: '32k', priceHint: 'local', status: 'ready', tags: [] }] })
  post.mockReset(); put.mockReset()
  get.mockReset().mockImplementation(async (url: string) => {
    if (url === '/workflows/definitions/42') return { id: 42, name: '错误恢复审查', projectId: 9, version: 7, status: 'DRAFT', definitionJson: JSON.stringify({ nodes: [{ nodeId: 'start', nodeType: 'START', displayName: '开始', position: { x: 0, y: 0 }, config: { variables: {} } }] }) }
    if (url === '/copilot/conversations') return summaries
    const match = url.match(/^\/copilot\/conversations\/(\d+)\/messages$/)
    if (match) return histories[`conv-${match[1]}`] || []
    throw new Error(`未处理的读取：${url}`)
  })
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); requests.push(body)
    expect(body.provider).toBe('OLLAMA'); expect(body.model).toBe('qwen3:8b')
    const id = body.conversationId || `conv-${100 + requests.length}`
    // 边界夹具遵循后端：提供方开始前提交用户消息，先发会话元数据，再生成内容；此处仅模拟 HTTP 边界。
    if (!histories[id]) { histories[id] = []; summaries.unshift({ id, title: body.displayPrompt, workflowId: body.workflowId, projectId: body.projectId, messageCount: 0, updatedAt: '' }) }
    histories[id].push(message(`u-${requests.length}`, 'user', body.displayPrompt))
    const events = [`event: conversation\ndata: ${JSON.stringify({ conversationId: id })}\n\n`, `event: delta\ndata: ${JSON.stringify({ content: partial })}\n\n`]
    if (failNext) { failNext = false; events.push('event: error\ndata: {"message":"provider temporarily unavailable"}\n\n') }
    else { const answer = { ...message(`a-${requests.length}`, 'assistant', '恢复完成'), conversationId: id }; histories[id].push(answer); events.push(`event: complete\ndata: ${JSON.stringify(answer)}\n\n`) }
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(events.join(''))); controller.close() } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }))
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
async function setup(existing = false) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore(); expect(await store.loadWorkflow('42')).toBe(true)
  store.templates = nodeTemplates.map(t => ({ ...t, availability: { available: true, reason: null } }))
  const context = computed(() => ({ workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId, backendVersion: store.backendVersion, editRevision: store.editRevision, projectId: store.projectId, selectedNodeId: null, nodes: store.nodes, edges: store.edges, templates: store.templates }))
  if (existing) { summaries.push({ id: 'conv-10', workflowId: store.workflowId, projectId: String(store.projectId), messageCount: 2 }); histories['conv-10'] = [message('old-u', 'user', '之前的问题'), message('old-a', 'assistant', '之前的回答')] }
  const opened = ref(true)
  wrapper = mount(defineComponent({ setup: () => () => opened.value ? h(AICopilotPanel, { context: context.value, onClose: () => { opened.value = false } }) : h('button', { id: 'reopen', onClick: () => { opened.value = true } }, '重新打开') }), { global: { plugins: [pinia, i18n] } })
  await flushPromises(); return { store, context }
}
async function submit(prompt: string) { await wrapper.find('form input').setValue(prompt); await wrapper.find('form').trigger('submit'); await flushPromises() }
async function startNew() { await wrapper.findAll('button').find(b => b.text() === i18n.global.t('copilot.newConversation'))!.trigger('click'); await flushPromises() }
async function reopen() { await wrapper.find(`button[title="${i18n.global.t('copilot.close')}"]`).trigger('click'); await wrapper.find('#reopen').trigger('click'); await flushPromises() }
it('已有会话：部分错误保留，续问及重开仍沿用会话和工作流上下文', async () => {
  const { store, context } = await setup(true)
  const before = JSON.stringify([store.nodes, store.edges, store.editRevision, store.historyPast, store.dirty])
  await submit(firstPrompt)
  expect(wrapper.text()).toContain(firstPrompt); expect(wrapper.text()).toContain(partial); expect(wrapper.text()).toContain('provider temporarily unavailable')
  expect(wrapper.find('form input').attributes('disabled')).toBeUndefined()
  await submit('继续完成剩余两步')
  expect(requests.map(r => r.conversationId)).toEqual(['conv-10', 'conv-10'])
  expect(requests[1].context.workflow.id).toBe(store.workflowId)
  await reopen(); expect(wrapper.text()).toContain(firstPrompt); expect(wrapper.text()).toContain('恢复完成')
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('conv-10')
  expect(JSON.stringify([store.nodes, store.edges, store.editRevision, store.historyPast, store.dirty])).toBe(before)
  expect(post).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled()
})
it('保留契约：首轮失败后续问沿用原会话', async () => {
  const { context } = await setup(); await startNew(); await submit(firstPrompt)
  expect(wrapper.text()).toContain(partial)
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('conv-101')
  await submit('继续完成剩余两步'); expect(requests).toHaveLength(2)
  expect(requests[1].conversationId, '续问必须保留首轮服务端会话').toBe('conv-101')
  expect(histories['conv-101']![0]!.content).toBe(firstPrompt)
  expect(histories['conv-102']).toBeUndefined()
  expect(wrapper.text()).toContain(firstPrompt)
  await reopen(); expect(wrapper.text()).toContain(firstPrompt); expect(wrapper.text()).toContain('继续完成剩余两步')
})
it('保留契约：首轮失败关闭重开应恢复原问题', async () => {
  const { context } = await setup(); await startNew(); await submit(firstPrompt)
  expect(wrapper.text()).toContain(firstPrompt); expect(wrapper.text()).toContain(partial)
  expect(histories['conv-101']![0]!.content).toBe(firstPrompt)
  get.mockClear(); await reopen()
  expect(wrapper.text(), '失败后重开必须恢复已提交的用户问题').toContain(firstPrompt)
  expect(get).toHaveBeenCalledWith('/copilot/conversations/101/messages', { source: 'ai' })
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('conv-101')
})
it('对照：新会话完整成功后关闭重开保留原问题与续问上下文', async () => {
  await setup(); await startNew(); failNext = false; await submit(firstPrompt); await reopen()
  expect(wrapper.text()).toContain(firstPrompt); await submit('继续完成剩余两步'); expect(requests[1].conversationId).toBe('conv-101')
})

// 保持真实 fetch → SSE 解码 → Vue 链路，测试替身只控制 HTTP 字节及持久化读取边界。
function controlledStream() {
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  let signal: AbortSignal | undefined
  const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
    signal = init.signal ?? undefined
    requests.push(JSON.parse(String(init.body)))
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { streamController = controller } }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    get signal() { return signal },
    async event(name: string, data: unknown) {
      const bytes = new TextEncoder().encode(`event: ${name}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`)
      // 故意切碎 SSE 字节，覆盖帧缓冲和增量 UTF-8 解码。
      for (let offset = 0; offset < bytes.length; offset += 3) streamController.enqueue(bytes.slice(offset, offset + 3))
      await flushPromises()
    },
    async end() { streamController.close(); await flushPromises() },
  }
}

it('元数据先于任何文本立即保存，首个 provider 错误后重开可恢复已提交问题', async () => {
  const { context } = await setup(); await startNew()
  const stream = controlledStream(); await submit(firstPrompt)
  histories['conv-111'] = [message('u1', 'user', firstPrompt)]
  await stream.event('conversation', { conversationId: 'conv-111' })
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('conv-111')
  await stream.event('error', { message: 'provider unavailable before delta' }); await stream.end()
  await reopen()
  expect(wrapper.text()).toContain(firstPrompt)
  expect(get).toHaveBeenCalledWith('/copilot/conversations/111/messages', { source: 'ai' })
})

it('元数据后截断仍保留会话编号，续问不会悄悄新建会话', async () => {
  const { context } = await setup(); await startNew()
  const stream = controlledStream(); await submit(firstPrompt)
  await stream.event('conversation', { conversationId: 'conv-111' })
  await stream.event('delta', { content: partial }); await stream.end()
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('conv-111')
  expect(wrapper.text()).toContain(partial)
  const nextStream = controlledStream(); await submit('继续')
  expect(requests[1].conversationId).toBe('conv-111')
  await nextStream.end()
})

it('元数据前断线不猜最近会话，阻止续问且重开保留警告，只在显式新建后恢复发送', async () => {
  const { context } = await setup(); await startNew()
  const stream = controlledStream(); await submit(firstPrompt); await stream.end()
  summaries.push({ id: 'conv-777', workflowId: context.value.workflowId, projectId: String(context.value.projectId) })
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('pending')
  expect(wrapper.text()).toContain(i18n.global.t('copilot.historyIdentityUnconfirmed'))
  expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  await submit('继续'); expect(requests).toHaveLength(1)
  get.mockClear(); await reopen()
  expect(get).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain(i18n.global.t('copilot.historyIdentityUnconfirmed'))
  await submit('继续'); expect(requests).toHaveLength(1)
  await startNew()
  const fresh = controlledStream(); await submit('重新提供完整问题')
  expect(requests).toHaveLength(2); expect(requests[1].conversationId).toBeUndefined()
  await fresh.end()
})

it.each(['new', 'close', 'scope'] as const)('取消/切换（%s）后旧元数据、增量与 complete 不得污染当前会话', async (action) => {
  const { store, context } = await setup(); await startNew()
  const oldKey = conversationSessionKey(context.value)
  const stream = controlledStream(); await submit(firstPrompt)
  if (action === 'new') await startNew()
  else if (action === 'close') await reopen()
  else { store.workflowId = 'workflow-other'; await flushPromises() }
  expect(stream.signal?.aborted).toBe(true)
  const currentKey = conversationSessionKey(context.value)
  const selectedBefore = readConversationSelection(currentKey)
  await stream.event('conversation', { conversationId: 'conv-999' })
  await stream.event('delta', { content: '旧增量不得出现' })
  await stream.event('complete', { ...message('stale', 'assistant', '旧成功不得出现'), conversationId: 'conv-999' })
  await stream.end()
  expect(readConversationSelection(currentKey)).toBe(selectedBefore)
  expect(readConversationSelection(oldKey)).not.toBe('conv-999')
  expect(wrapper.text()).not.toContain('旧增量不得出现')
  expect(wrapper.text()).not.toContain('旧成功不得出现')
})

it('收到元数据后关闭会中止流，但重开按已确认 ID 恢复而非 pending', async () => {
  const { context } = await setup(); await startNew()
  const stream = controlledStream(); await submit(firstPrompt)
  histories['conv-111'] = [message('u1', 'user', firstPrompt)]
  await stream.event('conversation', { conversationId: 'conv-111' })
  await reopen()
  expect(stream.signal?.aborted).toBe(true)
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('conv-111')
  expect(wrapper.text()).toContain(firstPrompt)
  await stream.event('conversation', { conversationId: 'conv-999' }); await stream.end()
  expect(readConversationSelection(conversationSessionKey(context.value))).toBe('conv-111')
})
