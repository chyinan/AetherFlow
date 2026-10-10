// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { RuntimeEvent } from '@/api/modules/runtime'
import type { WorkflowRun } from '@/types/run'

const transport = vi.hoisted(() => ({
  options: null as null | { onMessage: (message: { event: string; data: unknown }) => void },
  close: vi.fn(), logs: vi.fn(), events: vi.fn(), observation: vi.fn(),
}))
vi.mock('@/services/realtime/sseClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/realtime/sseClient')>(),
  createSseClient: (options: typeof transport.options) => {
    transport.options = options
    return { connect: vi.fn(), close: transport.close }
  },
}))
vi.mock('@/api/modules/workflow', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/modules/workflow')>(), getWorkflowInstanceLogs: transport.logs,
}))
vi.mock('@/api/modules/runtime', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/modules/runtime')>(), getRuntimeEvents: transport.events,
  getRuntimeObservation: transport.observation,
}))

import { realtimeClient } from '@/services/realtime/realtimeClient'
import { runApi } from '@/services/api/runApi'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import RunConsole from './RunConsole.vue'

const diagnosis = { provider: 'COMFYUI', stage: 'QUEUE', field: 'sampler', reason: 'REJECTED' }
function event(error = 'private-prefix [IMAGE_EXECUTION:COMFYUI:QUEUE:sampler:REJECTED] token=secret-response'): RuntimeEvent {
  return { eventId: 'event-1', eventType: 'WORKFLOW_FAILED', workflowId: '42', traceId: 'trace-42',
    nodeId: 'image-node', runtimeState: 'FAILED', occurredAt: '2026-10-10T10:00:00Z', attributes: { error } }
}
let wrapper: ReturnType<typeof mount> | undefined
let stop: (() => void) | undefined
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  transport.options = null
  transport.observation.mockResolvedValue({ workflowId: '42', runtimeState: 'FAILED' })
  const store = useRunStore()
  store.currentRun = { id: 'run-42', workflowId: 'workflow-1', workflowName: 'test', runtimeWorkflowId: '42',
    status: 'failed', startedAt: '', durationMs: 0, trigger: 'manual', owner: '', traceId: 'trace-42', queueName: '',
    progress: 0, nodeStates: [], artifactCount: 0, artifactNames: [] } satisfies WorkflowRun
  useWorkflowStore().workflowId = 'workflow-1'
  useWorkflowStore().nodes = [{ id: 'image-node', type: 'workflow', position: { x: 0, y: 0 },
    data: { kind: 'image-generation', label: 'Image', description: '', config: {}, inputs: [], outputs: [], status: 'failed' } }]
})
afterEach(() => { stop?.(); stop = undefined; wrapper?.unmount(); wrapper = undefined })
function render() {
  wrapper = mount(RunConsole, { global: { plugins: [getActivePinia()!, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': {} }, missingWarn: false, fallbackWarn: false })], stubs: { StatusBadge: true } } })
  return wrapper
}
function expectCardAndSafeStore() {
  const store = useRunStore()
  expect(store.logs[0]?.imageFailure).toEqual(diagnosis)
  expect(JSON.stringify(store.logs)).not.toContain('private-prefix')
  expect(JSON.stringify(store.logs)).not.toContain('secret-response')
  const panel = render()
  expect(panel.get('[data-testid="image-execution-failure"]').text()).toContain('工作流提交失败')
  expect(panel.text()).toContain('兼容采样器')
  expect(panel.find('[data-testid="locate-image-failure"]').exists()).toBe(true)
  expect(panel.text()).not.toContain('secret-response')
}

describe('真实运行事件到图像错误卡片的契约', () => {
  it('SSE 帧 attributes.error 经实时 mapper 和 store 显示封闭诊断', async () => {
    const store = useRunStore()
    stop = realtimeClient.subscribeRun({ runId: 'run-42', runtimeWorkflowId: '42' }, { onLog: (entry) => store.appendLog(entry) })
    transport.options!.onMessage({ event: 'runtime-event', data: JSON.stringify(event()) })
    await flushPromises()
    expect(transport.close).toHaveBeenCalled()
    expectCardAndSafeStore()
  })
  it('重新打开运行的历史帧保留同一安全诊断', async () => {
    const failed = event()
    transport.logs.mockResolvedValue([{ ...failed, id: 'history-1', level: 'error', message: 'Workflow 42 failed.' }])
    for (const log of await runApi.getLogs('run-42')) useRunStore().appendLog(log)
    expect(transport.logs).toHaveBeenCalledWith(42)
    expectCardAndSafeStore()
  })
  it('恢复快照的事件列表保留同一安全诊断', async () => {
    transport.events.mockResolvedValue([event()])
    const recovery = await runApi.recoverRuntime(useRunStore().currentRun!)
    for (const log of recovery.logs) useRunStore().appendLog(log)
    expect(transport.events).toHaveBeenCalledWith('42')
    expectCardAndSafeStore()
  })
  it('未知或未标记的后端错误不会作为原文暴露', async () => {
    transport.events.mockResolvedValue([event('secret-response [IMAGE_EXECUTION:COMFYUI:QUEUE:apiKey:REJECTED]')])
    const recovery = await runApi.recoverRuntime(useRunStore().currentRun!)
    expect(recovery.logs[0]?.imageFailure).toBeUndefined()
    expect(JSON.stringify(recovery.logs)).not.toContain('secret-response')
    for (const log of recovery.logs) useRunStore().appendLog(log)
    expect(render().find('[data-testid="image-execution-failure"]').exists()).toBe(false)
  })
  it('执行器源图校验的 AI_SERVICE 诊断可显示并定位源图', async () => {
    const store = useRunStore()
    stop = realtimeClient.subscribeRun({ runId: 'run-42', runtimeWorkflowId: '42' }, { onLog: (entry) => store.appendLog(entry) })
    transport.options!.onMessage({ event: 'runtime-event', data: JSON.stringify(event('[IMAGE_EXECUTION:AI_SERVICE:INPUT:sourceImage:VALIDATION] safe advice')) })
    await flushPromises()
    expect(store.logs[0]?.imageFailure).toEqual({ provider: 'AI_SERVICE', stage: 'INPUT', field: 'sourceImage', reason: 'VALIDATION' })
    const panel = render()
    expect(panel.get('[data-testid="image-execution-failure"]').text()).toContain('输入检查失败')
    expect(panel.get('[data-testid="locate-image-failure"]').text()).toContain('源图')
  })
})
