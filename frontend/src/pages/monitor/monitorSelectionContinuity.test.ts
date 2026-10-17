// @vitest-environment jsdom
// 正式回归：固定唯一合成 ADMIN 与同一 workspace，仅验证正常事件选择和显式恢复。
// 治理/遥测读取均为内存合成边界，不读取真实登录、文件、账号、文档或日志。
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationLog, MonitorMetric } from '@/types/dify'

const mocks = vi.hoisted(() => ({
  governance: vi.fn(), metrics: vi.fn(), logs: vi.fn(),
  auth: Object.freeze({
    isAdmin: true,
    user: Object.freeze({ id: 'monitor-synthetic-admin', name: '合成管理员', workspace: 'monitor-synthetic-workspace', rawRoles: Object.freeze(['ADMIN']) }),
  }),
}))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/api/modules/governance', () => ({
  governanceResourceKeys: ['workflowNode', 'embedding', 'ocr', 'queue', 'fileStatus', 'fileMetrics', 'authStatus', 'authMetrics', 'gateway'],
  getGovernanceSnapshot: mocks.governance,
}))
vi.mock('@/services/api/difyApi', () => ({ difyApi: { listMonitorMetrics: mocks.metrics, listConversationLogs: mocks.logs } }))

import { i18n } from '@/i18n'
import MonitorPage from '@/pages/monitor/MonitorPage.vue'

const keys = ['workflowNode', 'embedding', 'ocr', 'queue', 'fileStatus', 'fileMetrics', 'authStatus', 'authMetrics', 'gateway'] as const
type Snapshot = ReturnType<typeof snapshot>
type EventName = 'A' | 'B' | 'C'
type Call = { source: string; args: unknown[] }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function event(name: EventName, reviewRequired = false): ConversationLog {
  return {
    id: `event-${name.toLowerCase()}`, time: '2026-10-16T20:00:00.000Z', app: `合成服务 ${name}`,
    user: 'system-service', channel: 'api', intent: `合成事件 ${name}`, status: 'success',
    tokens: null, cost: '--', feedback: 'none', reviewRequired,
    ...(reviewRequired ? { reviewReason: '合成待复核说明' } : {}), latencyMs: 120,
  }
}
function metrics(): MonitorMetric[] {
  return [
    { id: 'provider-calls', label: '合成调用量', value: '12', delta: '', tone: 'online' },
    { id: 'provider-latency', label: '合成延迟', value: '120ms', delta: '', tone: 'online' },
    { id: 'provider-cost', label: '合成费用', value: '--', delta: '', tone: 'degraded' },
    { id: 'provider-error-rate', label: '合成错误率', value: '0%', delta: '', tone: 'online' },
  ]
}
function snapshot(queueState: 'available' | 'unavailable' = 'available') {
  return {
    workflowNode: null, embedding: null, ocr: null,
    queue: queueState === 'available' ? { status: 'synthetic-ready', busy: false, readyMessages: 2, totalMessages: 2, consumers: 1 } : null,
    fileStatus: null, fileMetrics: null, authStatus: null, authMetrics: null, gateway: null,
    resources: Object.fromEntries(keys.map(key => [key, key === 'queue' ? queueState : 'available'])),
  }
}

let wrapper: VueWrapper | undefined
let calls: Call[] = []
let errors: string[] = []
let releases: Array<() => void> = []
function deferred<T>(fallback: T) {
  let done!: (value: T) => void
  let settled = false
  const promise = new Promise<T>(resolve => { done = resolve })
  const resolve = (value: T) => { if (!settled) { settled = true; done(clone(value)) } }
  releases.push(() => resolve(fallback))
  return { promise, resolve }
}
function record(source: string, args: unknown[]) { calls.push({ source, args: clone(args) }) }
function topRefresh() { return wrapper!.get<HTMLButtonElement>('header button') }
function eventButtons() { return wrapper!.findAll<HTMLButtonElement>('.monitor-event-stream button') }
function eventButton(name: EventName): DOMWrapper<HTMLButtonElement> {
  const button = eventButtons().find(item => item.findAll('p').some(line => line.text() === `合成服务 ${name}`))
  if (!button) throw new Error(`缺少真实可见事件按钮 ${name}`)
  expect(button.isVisible()).toBe(true)
  return button
}
function detailPanel() {
  return wrapper!.findAll('aside > section').find(section => section.findAll('span').some(span => span.text() === 'Trace'))
}
function traceId() {
  const panel = detailPanel()
  return panel?.findAll('span').find(span => span.text() === 'Trace')?.element.nextElementSibling?.textContent?.trim() ?? null
}
function expectDetail(name: EventName) {
  const panel = detailPanel()
  expect(panel, '右侧应呈现选中事件的可见详情').toBeDefined()
  expect(panel!.isVisible()).toBe(true)
  expect(panel!.text()).toContain(`合成服务 ${name}`)
  expect(panel!.text()).toContain(`合成事件 ${name}`)
  expect(traceId()).toBe(`event-${name.toLowerCase()}`)
}
async function withPage(body: () => Promise<void>) {
  try {
    const pinia = createPinia(); setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/monitor', component: MonitorPage },
      { path: '/home', component: { template: '<main>合成工作台目的页</main>' } },
      { path: '/models', component: { template: '<main>合成服务管理目的页</main>' } },
    ] })
    await router.push('/monitor'); await router.isReady()
    wrapper = mount(MonitorPage, { attachTo: document.body, global: {
      plugins: [pinia, router, i18n], config: { errorHandler: error => { errors.push(String(error)) } },
    } })
    await flushPromises()
    expect(eventButtons()).toHaveLength(2)
    expectDetail('A')
    await body()
  } finally {
    // 所有在途读取都在 finally 释放；此前任一断言失败也不会遗留 pending。
    for (const release of releases) release()
    await flushPromises()
    wrapper?.unmount(); wrapper = undefined
    document.body.replaceChildren()
  }
}
function holdPlatform() {
  const governance = deferred<Snapshot>(snapshot())
  const metric = deferred<MonitorMetric[]>(metrics())
  const logs = deferred<ConversationLog[]>([event('A'), event('B')])
  mocks.governance.mockImplementationOnce((...args: unknown[]) => { record('governance', args); return governance.promise })
  mocks.metrics.mockImplementationOnce((...args: unknown[]) => { record('metrics', args); return metric.promise })
  mocks.logs.mockImplementationOnce((...args: unknown[]) => { record('logs', args); return logs.promise })
  return {
    governance, metric, logs,
    async complete(nextLogs = [event('A'), event('B')], nextSnapshot = snapshot()) {
      governance.resolve(nextSnapshot); metric.resolve(metrics()); logs.resolve(nextLogs); await flushPromises()
    },
  }
}
async function startRefresh() {
  expect(topRefresh().text()).toBe('刷新平台状态')
  expect(topRefresh().element.disabled).toBe(false)
  await topRefresh().trigger('click'); await flushPromises()
  expect(topRefresh().element.disabled).toBe(true)
  expect(eventButtons()).toHaveLength(2)
  expect(wrapper!.text()).toContain('正在获取服务事件…')
  expect(eventButton('B').element.disabled).toBe(false)
}
async function clickEvent(name: EventName) {
  await eventButton(name).trigger('click'); await flushPromises(); expectDetail(name)
}
function expectTelemetryCalls(count: number) {
  expect(mocks.metrics).toHaveBeenCalledTimes(count); expect(mocks.logs).toHaveBeenCalledTimes(count)
  expect(mocks.metrics).toHaveBeenLastCalledWith({ includeProviderTelemetry: true })
  expect(mocks.logs).toHaveBeenLastCalledWith({ includeProviderTelemetry: true })
}

beforeEach(() => {
  calls = []; errors = []; releases = []
  i18n.global.locale.value = 'zh-CN'
  mocks.governance.mockReset().mockImplementation((...args: unknown[]) => { record('governance', args); return Promise.resolve(snapshot()) })
  mocks.metrics.mockReset().mockImplementation((...args: unknown[]) => { record('metrics', args); return Promise.resolve(metrics()) })
  mocks.logs.mockReset().mockImplementation((...args: unknown[]) => { record('logs', args); return Promise.resolve([event('A'), event('B')]) })
})
afterEach(async () => {
  try { for (const release of releases) release(); await flushPromises() }
  finally { wrapper?.unmount(); wrapper = undefined; document.body.replaceChildren() }
  expect(errors).toEqual([])
})

describe('监控页事件选择刷新连续性正式回归', () => {
  it('初始默认首条，真实事件按钮能把右侧详情切到 B', () => withPage(async () => {
    await clickEvent('B'); 
    expectTelemetryCalls(1); expect(mocks.governance).toHaveBeenCalledTimes(1)
  }))

  it('刷新前已选 B，相同事件集合返回后仍查看 B', () => withPage(async () => {
    await clickEvent('B'); const pending = holdPlatform(); await startRefresh()
    await pending.complete(); 
    expectTelemetryCalls(2); expect(eventButtons()).toHaveLength(2); expectDetail('B')
  }))

  it('刷新等待中真实点击 B，相同事件集合回执不能覆盖较新选择', () => withPage(async () => {
    const pending = holdPlatform(); await startRefresh(); await clickEvent('B'); 
    await topRefresh().trigger('click'); expectTelemetryCalls(2); expect(mocks.governance).toHaveBeenCalledTimes(2)
    await pending.complete(); 
    expect(eventButton('B').isVisible()).toBe(true); expect(topRefresh().element.disabled).toBe(false); expectDetail('B')
  }))

  it('事件读取已返回但指标仍在等待时点击 B，最终整批回执仍保留 B', () => withPage(async () => {
    const pending = holdPlatform(); await startRefresh()
    pending.logs.resolve([event('A'), event('B')]); pending.governance.resolve(snapshot()); await flushPromises()
    expect(topRefresh().element.disabled).toBe(true)
    await clickEvent('B'); 
    pending.metric.resolve(metrics()); await flushPromises(); 
    expectTelemetryCalls(2); expectDetail('B')
  }))

  it('同次等待中 B 后又点击 A，最后一次可见选择 A 保留', () => withPage(async () => {
    const pending = holdPlatform(); await startRefresh(); await clickEvent('B'); await clickEvent('A')
    await pending.complete(); expectDetail('A'); expectTelemetryCalls(2)
  }))

  it('B 真正移出返回集合时回退现存首条 A', () => withPage(async () => {
    await clickEvent('B'); const pending = holdPlatform(); await startRefresh()
    await pending.complete([event('A')]); 
    expect(eventButtons()).toHaveLength(1); expectDetail('A'); expect(traceId()).not.toBe('event-b')
  }))

  it('B 真正移出时仍遵守待复核事件的既有默认优先级', () => withPage(async () => {
    await clickEvent('B'); const pending = holdPlatform(); await startRefresh()
    await pending.complete([event('A'), event('C', true)]); 
    expect(eventButtons()).toHaveLength(2); expectDetail('C')
  }))

  it('返回全空事件集合时清空详情并显示正常空态', () => withPage(async () => {
    await clickEvent('B'); const pending = holdPlatform(); await startRefresh()
    await pending.complete([]); 
    expect(eventButtons()).toHaveLength(0); expect(detailPanel()).toBeUndefined(); expect(traceId()).toBeNull()
    expect(wrapper!.text()).toContain('当前没有服务事件'); expect(topRefresh().element.disabled).toBe(false)
  }))

  it('既有 queue 显式单项重试只恢复该来源、防重复且不重读遥测或更换 B', () => withPage(async () => {
    const pending = holdPlatform(); await startRefresh(); await pending.complete([event('A'), event('B')], snapshot('unavailable'))
    await clickEvent('B')
    const retry = deferred<Snapshot>(snapshot())
    mocks.governance.mockImplementationOnce((...args: unknown[]) => { record('governance', args); return retry.promise })
    const button = wrapper!.get<HTMLButtonElement>('[data-source="queue"] button')
    expect(button.text()).toBe('重试此项'); expect(wrapper!.find('[data-source="queue"]').text()).toContain('暂时无法获取，请重试')
    await button.trigger('click'); await flushPromises(); 
    expect(button.element.disabled).toBe(true); expect(button.text()).not.toBe('重试此项'); expect(topRefresh().element.disabled).toBe(true)
    await button.trigger('click'); await topRefresh().trigger('click')
    expect(mocks.governance).toHaveBeenCalledTimes(3); expect(mocks.governance).toHaveBeenLastCalledWith(['queue']); expectTelemetryCalls(2); expectDetail('B')
    retry.resolve(snapshot()); await flushPromises(); 
    expect(wrapper!.find('[data-source="queue"]').text()).toContain('已获取')
    expect(wrapper!.find('[data-source="queue"] button').exists()).toBe(false)
    expect(topRefresh().element.disabled).toBe(false); expectDetail('B'); expectTelemetryCalls(2)
  }))

  it('刷新中选 B 经 queue 部分失败与真实重试恢复闭环后仍查看同一 B', () => withPage(async () => {
    const pending = holdPlatform(); await startRefresh(); await clickEvent('B'); 
    await pending.complete([event('A'), event('B')], snapshot('unavailable')); 
    expect(wrapper!.find('[data-source="queue"]').text()).toContain('暂时无法获取，请重试')
    expect(eventButtons()).toHaveLength(2)
    await wrapper!.get('[data-source="queue"] button').trigger('click'); await flushPromises(); 
    expect(mocks.governance).toHaveBeenLastCalledWith(['queue']); expect(mocks.governance).toHaveBeenCalledTimes(3)
    expect(wrapper!.find('[data-source="queue"]').text()).toContain('已获取'); expectTelemetryCalls(2)
    expect(topRefresh().element.disabled).toBe(false); expectDetail('B')
  }))
})
