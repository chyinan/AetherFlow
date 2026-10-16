// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { mapRuntimeEventsToNodePatches } from '@/api/mappers/runtimeMapper'
import { runApi } from '@/services/api/runApi'
import type { RunNodeState } from '@/types/run'
import RunTimeline from './RunTimeline.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client/apiClient', async original => ({
  ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get },
}))

const wrappers: ReturnType<typeof mount>[] = []
function render(nodes: RunNodeState[]) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  const wrapper = mount(RunTimeline, { props: { nodes, runId: 'run-901' }, global: { plugins: [i18n, router] } })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => { vi.clearAllMocks(); i18n.global.locale.value = 'zh-CN' })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); i18n.global.locale.value = 'zh-CN' })

describe('运行时间线的已测耗时', () => {
  it.each([
    { durationMs: 0 },
    { startedAt: '2026-10-15T12:00:00.000Z', completedAt: '2026-10-15T12:00:00.000Z' },
  ])('运行详情映射保留零毫秒，时间线不能显示等待：%j', async timing => {
    mocks.get.mockResolvedValue({ id: 901, workflowId: 'workflow-101', status: 'SUCCESS', nodes: [
      { nodeId: 'instant-node', status: 'SUCCESS', ...timing },
    ] })
    const run = await runApi.getRun('run-901')
    expect(mocks.get).toHaveBeenCalledWith('/workflow-instances/901', { source: 'workflow' })
    expect(run.nodeStates[0]).toMatchObject({ status: 'success', durationMs: 0 })
    const wrapper = render(run.nodeStates)
    expect(wrapper.text()).toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it('同毫秒开始与完成事件恢复出的零耗时也显示为已测结果', () => {
    const occurredAt = '2026-10-15T12:00:00.000Z'
    const nodes = mapRuntimeEventsToNodePatches([
      { eventId: 'start', workflowId: '901', traceId: 'trace-901', nodeId: 'instant-node', eventType: 'NODE_STARTED', runtimeState: 'RUNNING', occurredAt },
      { eventId: 'done', workflowId: '901', traceId: 'trace-901', nodeId: 'instant-node', eventType: 'NODE_COMPLETED', runtimeState: 'RUNNING', occurredAt },
    ])
    expect(nodes[0]).toMatchObject({ status: 'success', durationMs: 0 })
    const wrapper = render(nodes)
    expect(wrapper.text()).toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it.each([1, 42, 1500])('正耗时 %i 毫秒保持原样', durationMs => {
    const wrapper = render([{ nodeId: 'node', label: '结果节点', status: 'success', durationMs }])
    expect(wrapper.text()).toContain(`${durationMs}ms`)
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it('尚无耗时的节点继续显示等待，后续零耗时更新立即替换提示', async () => {
    const wrapper = render([{ nodeId: 'node', label: '结果节点', status: 'queued' }])
    expect(wrapper.text()).toContain(i18n.global.t('workflow.waiting'))
    expect(wrapper.text()).not.toContain('undefinedms')
    await wrapper.setProps({ nodes: [{ nodeId: 'node', label: '结果节点', status: 'success', durationMs: 0 }] })
    expect(wrapper.text()).toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it('复用节点继续优先显示复用提示', () => {
    const wrapper = render([{ nodeId: 'node', label: '结果节点', status: 'success', durationMs: 0, reused: true }])
    expect(wrapper.text()).toContain(i18n.global.t('runs.rerunReused'))
    expect(wrapper.text()).not.toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })
})
