// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { WorkflowGraphNode } from '@/types/workflow'
import RunNodeRecoveryBanner from './RunNodeRecoveryBanner.vue'

const api = vi.hoisted(() => ({ getRun: vi.fn(), getLogs: vi.fn() }))
vi.mock('@/services/api/runApi', () => ({ runApi: api }))
const node = (id: string) => ({ id, type: 'workflow', position: { x: 800, y: 600 }, data: { kind: 'summary', label: id, config: {} } }) as WorkflowGraphNode
const run = (id = 'run-1', workflowId = '101', nodeId = 'summary-1') => ({ id, workflowId, definitionId: Number(workflowId), nodeStates: [{ nodeId, status: 'failed' }] })
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (v: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j }); return { promise, resolve, reject } }
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => { vi.clearAllMocks(); i18n.global.locale.value = 'zh-CN'; api.getRun.mockResolvedValue(run()); api.getLogs.mockResolvedValue([{ nodeId: 'summary-1', level: 'error', message: '模型不可用' }]) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
async function setup(props: Record<string, unknown> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/workflows/101'); await router.isReady()
  wrapper = mount(RunNodeRecoveryBanner, { props: { workflowId: '101', definitionId: 101, version: 4, nodes: [node('summary-1'), node('other')], nodeId: 'summary-1', sourceRunId: 'run-1', returnLocation: '/runs/run-1?status=failed&page=3#timeline', ...props }, global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

describe('失败节点恢复来源与精确定位', () => {
  it('验证来源后精确定位、显示错误和版本边界，并保留返回运行历史查询', async () => {
    const view = await setup()
    expect(view.emitted('autoLocate')).toEqual([['summary-1', 0]])
    expect(view.text()).toContain('模型不可用')
    expect(view.get('[data-testid="source-version-warning"]').text()).toContain('版本 4')
    expect(view.text()).toContain('不能确认与当时完全一致')
    expect(view.get('[data-action="return-source-run"]').attributes('href')).toBe('/runs/run-1?status=failed&page=3#timeline')
    await view.get('[data-action="locate-source-node"]').trigger('click')
    expect(view.emitted('locate')).toEqual([['summary-1']])
  })
  it('节点删除、版本变化不猜名称或其他ID，且删除后的按钮立即失效', async () => {
    const view = await setup({ nodes: [node('renamed-summary')], version: 8 })
    expect(view.emitted('autoLocate')).toBeUndefined()
    expect(view.text()).toContain('可能已被删除或替换')
    expect(view.text()).toContain('版本 8')
    await view.setProps({ nodes: [node('summary-1')] })
    expect(view.find('[data-action="locate-source-node"]').exists()).toBe(true)
    await view.setProps({ nodes: [] })
    expect(view.find('[data-action="locate-source-node"]').exists()).toBe(false)
  })
  it('循环子节点不拆分映射到根节点', async () => {
    api.getRun.mockResolvedValue(run('run-1', '101', 'loop-1/iteration-2/summary'))
    const view = await setup({ nodeId: 'loop-1/iteration-2/summary', nodes: [node('loop-1')] })
    expect(view.emitted('autoLocate')).toBeUndefined()
    expect(view.text()).toContain('属于循环或子流程')
  })
  it.each([
    run('run-1', '102'), run('run-2'), { ...run(), nodeStates: [{ nodeId: 'summary-1', status: 'success' }] }, { ...run(), nodeStates: [] },
  ])('不属于目标定义或失败节点的来源不定位也不读取错误详情', async (value) => {
    api.getRun.mockResolvedValue(value)
    const view = await setup()
    expect(view.emitted('autoLocate')).toBeUndefined()
    expect(view.text()).toContain('无法确认来源运行或节点')
    expect(api.getLogs).not.toHaveBeenCalled()
  })
  it('新深链取代旧请求，迟到来源及日志不接管当前页面', async () => {
    const first = deferred<any>(); api.getRun.mockReturnValueOnce(first.promise)
    const view = await setup()
    api.getRun.mockResolvedValueOnce(run('run-2', '101', 'other'))
    api.getLogs.mockResolvedValueOnce([{ nodeId: 'other', level: 'error', message: '新错误' }])
    await view.setProps({ sourceRunId: 'run-2', nodeId: 'other', returnLocation: '/runs/run-2?page=7' }); await flushPromises()
    first.resolve(run()); await flushPromises()
    expect(view.emitted('autoLocate')).toEqual([['other', 0]])
    expect(view.text()).toContain('新错误')
    expect(view.text()).not.toContain('模型不可用')
    expect(view.get('[data-action="return-source-run"]').attributes('href')).toBe('/runs/run-2?page=7')
  })
  it('迟到旧错误日志与卸载请求均不能发出新定位或覆盖反馈', async () => {
    const oldLogs = deferred<any>(); api.getLogs.mockReturnValueOnce(oldLogs.promise)
    const locate = vi.fn()
    const view = await setup({ onAutoLocate: locate })
    api.getRun.mockResolvedValueOnce(run('run-2', '101', 'other')); api.getLogs.mockResolvedValueOnce([])
    await view.setProps({ sourceRunId: 'run-2', nodeId: 'other' }); await flushPromises()
    oldLogs.resolve([{ nodeId: 'summary-1', level: 'error', message: '旧错误' }]); await flushPromises()
    expect(view.text()).not.toContain('旧错误')
    const late = deferred<any>(); api.getRun.mockReturnValueOnce(late.promise)
    await view.setProps({ sourceRunId: 'run-3' }); await flushPromises()
    view.unmount(); wrapper = undefined
    late.resolve(run('run-3', '101', 'other')); await flushPromises()
    expect(locate.mock.calls).toEqual([['summary-1', 0], ['other', 0]])
  })
  it('读取失败可重试，错误文本不会进入href且以纯文本显示', async () => {
    api.getRun.mockRejectedValueOnce(new Error('denied'))
    const view = await setup({ returnLocation: 'https://example.com' })
    expect(view.text()).not.toContain('denied')
    api.getLogs.mockResolvedValueOnce([{ nodeId: 'summary-1', level: 'error', message: '<script>alert(1)</script>' }])
    await view.findAll('button').find(button => button.text() === '重新读取来源运行')!.trigger('click'); await flushPromises()
    expect(view.text()).toContain('<script>alert(1)</script>')
    expect(view.find('script').exists()).toBe(false)
    expect(view.get('a').attributes('href')).toBe('/runs/run-1')
  })
  it('日志读取失败仍保留有效定位、版本提示及返回链', async () => {
    api.getLogs.mockRejectedValueOnce(new Error('unavailable'))
    const view = await setup({ version: null })
    expect(view.emitted('autoLocate')).toEqual([['summary-1', 0]])
    expect(view.text()).toContain('没有可读取的节点错误详情')
    expect(view.text()).toContain('运行接口未提供源定义版本')
  })
  it.each(['en-US', 'ja-JP'] as const)('支持%s本地文案', async locale => {
    i18n.global.locale.value = locale
    const view = await setup()
    expect(view.text()).not.toContain('sourceTitle')
    expect(view.text()).not.toContain('sourceVersion')
  })
})
