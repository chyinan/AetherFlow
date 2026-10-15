// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeEvent, RuntimeExecutionSnapshot, RuntimeState } from '@/api/modules/runtime'
import type { RunNodeState, WorkflowRun } from '@/types/run'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), subscribe: vi.fn((_options: unknown, _handlers: unknown) => vi.fn()) }))
vi.mock('@/api/client/apiClient', async original => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get, post: mocks.post } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
let events: RuntimeEvent[]
let runtimeState: RuntimeState
let currentNodeId: string
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function event(nodeId: string, completed = false, instanceId = 101): RuntimeEvent {
  return {
    eventId: `${instanceId}-${nodeId}-${completed ? 'done' : 'waiting'}`, workflowId: String(instanceId), traceId: 'trace', nodeId,
    eventType: completed ? 'NODE_COMPLETED' : 'NODE_WAITING', runtimeState: completed ? 'RUNNING' : 'WAITING',
    attributes: completed ? {} : { approved: false, approvalStatus: 'pending', reviewer: 'ops', method: 'webapp' },
  }
}
function action(name: string) { return document.body.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)! }
function comment() { return document.body.querySelector<HTMLTextAreaElement>('textarea')! }
function dialog() { return document.body.querySelector('[role="dialog"]') }
function approvalPosts() { return mocks.post.mock.calls.filter(call => String(call[0]).includes('/approval')) }
function handlers() { return mocks.subscribe.mock.calls.at(-1)![1] as { onNodePatch: (patch: RunNodeState) => void; onRunPatch: (patch: Partial<WorkflowRun>) => void } }
async function enterComment(text: string) { comment().value = text; comment().dispatchEvent(new Event('input', { bubbles: true })); await flushPromises() }
async function moveToNextApproval() {
  events = [event('approval-a', true), event('approval-b')]
  currentNodeId = 'approval-b'
  // 通过真实刷新入口批量恢复两个节点，允许已有弹窗在一次渲染中切换目标。
  await refresh()
}
async function refresh() {
  await wrapper!.get('header button').trigger('click')
  await flushPromises()
}
async function close() {
  document.body.querySelector<HTMLButtonElement>('[role="dialog"] header button')!.click()
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  events = [event('approval-a')]
  runtimeState = 'WAITING'; currentNodeId = 'approval-a'
  mocks.get.mockImplementation(async (url: string) => {
    const record = (id: number) => ({ id, workflowId: `wf-${id}`, definitionId: id, workflowName: `审批流程${id}`, status: id === 101 ? runtimeState : 'WAITING', nodes: [
      { nodeId: 'approval-a', status: 'WAITING' }, { nodeId: 'approval-b', status: 'PENDING' },
    ] })
    if (url === '/workflow-instances') return { total: 2, items: [record(101), record(202)] }
    if (url.endsWith('/logs')) return []
    if (url.startsWith('/workflow-instances/')) return record(Number(url.split('/').at(-1)))
    if (url.startsWith('/workflow/runtime/observability/')) return { workflowId: url.split('/').at(-1), runtimeState, currentNodeId, progress: 0.5 }
    if (url.startsWith('/workflow/runtime/events/')) return url.endsWith('/202') ? [event('approval-a', false, 202)] : events
    throw new Error(`非预期读取 ${url}`)
  })
  mocks.post.mockResolvedValue({ workflowId: '101', runtimeState: 'RUNNING', currentNodeId: 'next' })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime(); document.body.innerHTML = '' })
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage }, { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/other', component: { template: '<p>另一页</p>' } },
    { path: '/files', component: { template: '<p>文件页占位</p>' } },
  ] })
  await router.push('/runs/run-101'); await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n], stubs: {
    FailedNodeRerunDialog: true, SubworkflowChildRuns: true, RunTimeline: true, LogStream: true,
  } } })
  await flushPromises()
  expect(dialog()?.textContent).toContain('approval-a')
  return { router, store: useRunStore() }
}

describe('人工审批请求的归属与中断恢复', () => {
  it('刷新恢复进入下一审批后，前一回执不能把下一节点错误标为已批准', async () => {
    const pending = deferred<RuntimeExecutionSnapshot>(); mocks.post.mockReturnValue(pending.promise)
    const { store } = await setup()
    await enterComment('仅同意A')
    action('approve').click(); await flushPromises()
    await moveToNextApproval()
    pending.resolve({ workflowId: '101', runtimeState: 'RUNNING', currentNodeId: 'approval-b' }); await flushPromises()
    expect(store.currentRun?.nodeStates.find(node => node.nodeId === 'approval-b')).toMatchObject({ status: 'paused', approval: { approved: false, approvalStatus: 'pending' } })
    expect(dialog()?.textContent).toContain('approval-b')
    expect(comment().value).toBe('')
    expect(approvalPosts()).toHaveLength(1)
    expect(approvalPosts()[0]![0]).toContain('/nodes/approval-a/approval')
  })

  it('下一审批可独立输入和提交，前一失败回执不能显示在新审批里或解除新提交等待', async () => {
    const first = deferred<RuntimeExecutionSnapshot>(); const second = deferred<RuntimeExecutionSnapshot>()
    mocks.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await setup(); await enterComment('A意见'); action('approve').click(); await flushPromises()
    await moveToNextApproval()
    expect(comment().value).toBe('')
    expect(action('approve').disabled).toBe(false)
    await enterComment('B意见'); action('reject').click(); await flushPromises()
    first.reject(new Error('A的旧请求失败')); await flushPromises()
    expect(document.body.textContent).not.toContain('A的旧请求失败')
    expect(action('approve').disabled).toBe(true)
    expect(approvalPosts()).toHaveLength(2)
    expect(approvalPosts()[1]![0]).toContain('/nodes/approval-b/approval')
    expect(approvalPosts()[1]![1]).toMatchObject({ approved: false, comment: 'B意见' })
    second.resolve({ workflowId: '101', runtimeState: 'FAILED' }); await flushPromises()
  })

  it('关闭后刷新重开相同审批，旧回执不能关闭或清空重开的新表单', async () => {
    const pending = deferred<RuntimeExecutionSnapshot>(); mocks.post.mockReturnValue(pending.promise)
    const { store } = await setup(); action('approve').click(); await flushPromises(); await close()
    expect(dialog()).toBeNull(); await refresh(); await enterComment('重新核对')
    pending.resolve({ workflowId: '101', runtimeState: 'RUNNING' }); await flushPromises()
    expect(store.currentRun?.nodeStates[0]?.approval?.approvalStatus).toBe('pending')
    expect(comment().value).toBe('重新核对')
  })

  it.each(['成功', '失败'] as const)('切换到已缓存运行后，旧审批%s回执不能改变新运行或显示错误', async outcome => {
    const pending = deferred<RuntimeExecutionSnapshot>(); mocks.post.mockReturnValue(pending.promise)
    const { router, store } = await setup()
    // 先从真实页面恢复B并回到A，随后导航可直接复用缓存中的待审批节点。
    await router.push('/runs/run-202'); await flushPromises()
    await router.push('/runs/run-101'); await flushPromises()
    action('approve').click(); await flushPromises()
    await router.push('/runs/run-202'); await flushPromises()
    if (outcome === '成功') pending.resolve({ workflowId: '101', runtimeState: 'SUCCESS' })
    else pending.reject(new Error('A的跨运行旧错误'))
    await flushPromises()
    expect(store.currentRun).toMatchObject({ id: 'run-202', runtimeWorkflowId: '202', backendStatus: 'WAITING' })
    expect(store.currentRun?.nodeStates[0]?.approval?.approvalStatus).toBe('pending')
    expect(dialog()).not.toBeNull()
    expect(document.body.textContent).not.toContain('A的跨运行旧错误')
  })

  it.each(['SUCCESS', 'FAILED', 'CANCELLED'] as const)('后端已确认%s时，不再向残留pending节点提供审批动作', async terminal => {
    await setup(); await close()
    runtimeState = terminal
    handlers().onRunPatch({ backendStatus: terminal, status: terminal === 'SUCCESS' ? 'success' : terminal === 'FAILED' ? 'failed' : 'cancelled', progress: 100 })
    await refresh()
    expect(dialog()).toBeNull()
    expect(approvalPosts()).toHaveLength(0)
  })

  it('当前审批失败保留意见，可重试且重复点击只发送一次请求', async () => {
    const pending = deferred<RuntimeExecutionSnapshot>(); mocks.post.mockReturnValueOnce(pending.promise)
    await setup(); await enterComment('当前意见'); action('reject').click(); action('approve').click(); await flushPromises()
    expect(approvalPosts()).toHaveLength(1)
    pending.reject(new Error('暂时不可用')); await flushPromises()
    expect(dialog()?.textContent).toContain('暂时不可用'); expect(comment().value).toBe('当前意见')
    events = [event('approval-a', true)]; runtimeState = 'RUNNING'
    action('approve').click(); await flushPromises()
    expect(approvalPosts()).toHaveLength(2); expect(dialog()).toBeNull()
  })
})
