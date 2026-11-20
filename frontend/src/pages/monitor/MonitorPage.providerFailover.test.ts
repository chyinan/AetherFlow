// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { ProviderRuntimeLogEntry } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import MonitorPage from './MonitorPage.vue'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAdmin: true, user: { id: 'synthetic-monitor', rawRoles: ['ADMIN'] } }),
}))
vi.mock('@/api/modules/governance', () => ({
  governanceResourceKeys: [],
  getGovernanceSnapshot: vi.fn(async () => ({ resources: {} })),
}))

const defaultAdapter = axiosInstance.defaults.adapter
const initialLocale = i18n.global.locale.value
let wrapper: VueWrapper | undefined
let logs: ProviderRuntimeLogEntry[]
let totalFailures: number
let requests: Array<[string | undefined, string | undefined, number | undefined]>

function event(id: string, data: Partial<ProviderRuntimeLogEntry>): ProviderRuntimeLogEntry {
  return { id, time: '2026-11-19T00:00:00Z', attempt: 1, ...data }
}

// 模拟当前 Java 回包：同一次回退先记录主提供商 ERROR，再记录 FAILOVER 和 SUCCESS。
const primaryError = event('primary-error', {
  eventType: 'ERROR', provider: 'OPENAI', level: 'error', errorMessage: '合成主提供商超时',
  message: '[ERROR] OPENAI: 合成主提供商超时', latencyMillis: 260,
})
const recovered = event('fallback-recovered', {
  eventType: 'FAILOVER', provider: 'OLLAMA', fromProvider: 'OPENAI', toProvider: 'OLLAMA',
  level: 'error', message: '[FAILOVER] OLLAMA: provider failover OPENAI -> OLLAMA', latencyMillis: 90,
})
const fallbackSuccess = event('fallback-success', {
  eventType: 'SUCCESS', provider: 'OLLAMA', level: 'info', latencyMillis: 90,
  message: '[SUCCESS] OLLAMA: provider request succeeded', metadata: { estimatedCostUsd: '0.001' },
})

async function render() {
  wrapper = mount(MonitorPage, {
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { RouterLink: { template: '<a href="#local"><slot /></a>' } } },
  })
  await flushPromises()
  expect(requests).toEqual(expect.arrayContaining([
    ['get', '/ai/provider/logs', 50],
    ['get', '/ai/provider/metrics', undefined],
    ['get', '/workflow/runtime/metrics', undefined],
  ]))
  expect(requests).toHaveLength(4)
  expect(requests.filter(([, url]) => url === '/ai/provider/logs')).toHaveLength(2)
  return wrapper
}

const reviewIds = (page: VueWrapper) => page.findAll('[data-review-id]').map(row => row.attributes('data-review-id'))

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  logs = [fallbackSuccess, recovered, primaryError]
  totalFailures = 1
  requests = []
  axiosInstance.defaults.adapter = async config => {
    requests.push([config.method, config.url, config.params?.limit])
    let payload: unknown
    switch (config.url) {
      case '/ai/provider/logs':
        payload = { logs }
        break
      case '/ai/provider/metrics':
        payload = { metrics: {
          OPENAI: { calls: 10, failures: totalFailures, maxLatencyMillis: 300 },
          OLLAMA: { calls: 1, failures: 0, maxLatencyMillis: 90 },
        } }
        break
      case '/workflow/runtime/metrics':
        payload = { currentWorkflowCount: 1 }
        break
      default:
        throw new Error(`监控回归不允许访问其他路由：${config.url}`)
    }
    return { data: { code: 200, message: 'ok', data: payload }, status: 200, statusText: 'OK', headers: {}, config }
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = defaultAdapter
  i18n.global.locale.value = initialLocale
})

describe('平台监控：已成功的服务商回退', () => {
  it('不会把已恢复回退与真实失败一起列入人工复核', async () => {
    const page = await render()
    expect(reviewIds(page)).toEqual(['primary-error'])
    expect(page.get('[data-testid="review-count"]').text()).toMatch(/^1\s*待复核$/)
  })

  it('保留可选事件及 Trace，但不显示失败或第二次成功', async () => {
    const page = await render()
    const eventRow = page.get('[data-event-id="fallback-recovered"]')
    expect(eventRow.text()).toContain('警告')
    expect(page.get('[data-event-id="fallback-success"]').text()).toContain('成功')
    await eventRow.trigger('click')
    const trace = page.get('#monitor-selected-trace')
    expect(trace.text()).toContain(recovered.message)
    expect(trace.text()).toContain('警告')
    expect(trace.text()).not.toContain('失败会话')
    expect(trace.text()).toContain('fallback-recovered')
    expect(page.get('.monitor-event-stream').element.previousElementSibling?.textContent).toMatch(/1\s*成功/)
  })

  it('不把同一次成功回退计成额外失败，也不误触发错误率告警', async () => {
    const page = await render()
    const errorMetric = page.findAll('article').find(item => item.text().startsWith('错误率'))
    expect(errorMetric?.text()).toContain('9%')
    expect(page.text()).not.toContain('超过阈值 10%')
    expect(page.text()).toContain('观察到 1 个失败事件')
  })

  it('单独一条已成功回退记录不制造失败计数或人工复核', async () => {
    logs = [recovered]
    totalFailures = 0
    const page = await render()
    expect(reviewIds(page)).toEqual([])
    expect(page.text()).toContain('当前没有观察到失败事件')
    expect(page.get('#monitor-selected-trace').text()).toContain('fallback-recovered')
  })

  it('保留自带错误详情的 FAILOVER 及名称相近的明确失败事件', async () => {
    logs = [
      event('explicit-fallback-error', { ...recovered, id: 'explicit-fallback-error', errorMessage: '回退目标实际失败' }),
      event('fallback-failed', { eventType: 'FAILOVER_FAILED', level: 'error', message: '替代服务不可用' }),
      fallbackSuccess,
    ]
    totalFailures = 2
    const page = await render()
    expect(reviewIds(page)).toEqual(['explicit-fallback-error', 'fallback-failed'])
    expect(page.text()).toContain('提供商错误率为 18%，超过阈值 10%')
    expect(page.text()).toContain('观察到 2 个失败事件')
  })

  it('仍将无日志成功回包显示为确定空状态', async () => {
    logs = []
    totalFailures = 0
    const page = await render()
    expect(reviewIds(page)).toEqual([])
    expect(page.text()).toContain('当前没有服务事件')
    expect(page.text()).toContain('当前没有观察到失败事件')
    expect(page.find('#monitor-selected-trace').exists()).toBe(false)
  })
})
