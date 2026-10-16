// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const backend = vi.hoisted(() => ({ logs: vi.fn() }))
vi.mock('@/api/modules/workflow', async original => ({
  ...await original<typeof import('@/api/modules/workflow')>(),
  getWorkflowInstanceLogs: backend.logs,
}))

import LogStream from '@/components/run/LogStream.vue'
import { mapRuntimeEventToLogEntry } from '@/api/mappers/runtimeMapper'
import { setStoredLocale, setStoredTimezone, type AppLocale } from '@/i18n/locale'
import { runApi } from '@/services/api/runApi'
import type { RunLogEntry } from '@/types/run'

const locales = ['zh-CN', 'en-US', 'ja-JP'] as const
const occurredAt = '2026-10-16T20:34:05Z'
const instant = new Date(occurredAt)
const canonicalTime = (locale: AppLocale, timeZone?: string) => new Intl.DateTimeFormat(locale, {
  hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false, ...(timeZone ? { timeZone } : {}),
}).format(instant)
const runtimeEvent = Object.freeze({ eventId: 'runtime-log', eventType: 'NODE_STARTED' as const,
  workflowId: '73', traceId: 'trace-73', nodeId: 'node-1', runtimeState: 'RUNNING' as const, occurredAt })
const backendLog = Object.freeze({ id: 'http-log', message: '固定历史日志', level: 'info', occurredAt })
let wrapper: VueWrapper | undefined

function render(logs: RunLogEntry[], locale: AppLocale) {
  const i18n = createI18n({ legacy: false, locale, messages: {}, missingWarn: false, fallbackWarn: false })
  wrapper = mount(LogStream, { props: { logs, runId: 'run-73' }, global: { plugins: [i18n] } })
  return i18n
}

beforeEach(() => { localStorage.clear(); backend.logs.mockReset() })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; localStorage.clear(); vi.restoreAllMocks() })

describe('运行日志保留原始时刻并按当前偏好展示', () => {
  it.each(locales)('%s 同一批真实 HTTP/运行事件日志在 UTC、东京、上海和设备区重新展示', async locale => {
    setStoredLocale(locale); setStoredTimezone('UTC')
    backend.logs.mockResolvedValue([backendLog])
    const logs = [...await runApi.getLogs('run-73'), mapRuntimeEventToLogEntry(runtimeEvent)]
    const snapshot = structuredClone(logs)
    expect.soft(logs.map(log => (log as RunLogEntry & { occurredAt?: string }).occurredAt)).toEqual([occurredAt, occurredAt])
    render(logs, locale)
    expect(wrapper!.text()).toContain(canonicalTime(locale, 'UTC'))
    for (const zone of ['Asia/Tokyo', 'Asia/Shanghai', 'UTC']) {
      wrapper!.unmount(); wrapper = undefined
      setStoredTimezone(zone)
      render(logs, locale)
      expect.soft(wrapper!.text()).toContain(canonicalTime(locale, zone))
      expect(logs).toEqual(snapshot)
    }
    wrapper!.unmount(); wrapper = undefined
    localStorage.removeItem('aetherflow.timezone')
    render(logs, locale)
    expect.soft(wrapper!.text()).toContain(canonicalTime(locale))
    expect(backend.logs).toHaveBeenCalledTimes(1)
    expect(backendLog.occurredAt).toBe(occurredAt)
    expect(runtimeEvent.occurredAt).toBe(occurredAt)
  })

  it.each(locales)('%s 旧日志、演示时分秒与无效原始时间保持已有 time', locale => {
    setStoredLocale(locale); setStoredTimezone('Asia/Tokyo')
    const logs: Array<RunLogEntry & { occurredAt?: string }> = [
      { id: 'legacy', time: '旧日志自定义时间', level: 'info', message: '旧日志' },
      { id: 'demo', time: '10:00:01', level: 'debug', message: '演示日志' },
      { id: 'invalid', time: '无效来源的既有显示', occurredAt: 'invalid-timestamp', level: 'warn', message: '无效日期' },
      { id: 'empty', time: '空来源的既有显示', occurredAt: '', level: 'error', message: '空日期' },
    ]
    const snapshot = structuredClone(logs)
    render(logs, locale)
    logs.forEach(log => expect(wrapper!.text()).toContain(log.time))
    expect(logs).toEqual(snapshot)
  })

  it('日志对象不变时，已挂载组件继续响应语言切换', async () => {
    setStoredTimezone('Asia/Tokyo')
    const logs: Array<RunLogEntry & { occurredAt?: string }> = [
      { id: 'raw', time: '固定旧显示', occurredAt, level: 'info', message: '固定正文' },
    ]
    const i18n = render(logs, 'zh-CN')
    expect.soft(wrapper!.text()).toContain(canonicalTime('zh-CN', 'Asia/Tokyo'))
    for (const locale of ['en-US', 'ja-JP', 'zh-CN'] as const) {
      setStoredLocale(locale); i18n.global.locale.value = locale
      await flushPromises()
      expect.soft(wrapper!.text()).toContain(canonicalTime(locale, 'Asia/Tokyo'))
    }
    expect(logs[0]?.time).toBe('固定旧显示')
    expect(logs[0]?.occurredAt).toBe(occurredAt)
  })

  it('真实映射器对缺失及无效时间保留兼容显示', async () => {
    setStoredTimezone('UTC')
    vi.useFakeTimers(); vi.setSystemTime(instant)
    try {
      backend.logs.mockResolvedValue([
        { ...backendLog, id: 'missing', occurredAt: undefined },
        { ...backendLog, id: 'invalid', occurredAt: 'invalid-timestamp' },
      ])
      const logs = await runApi.getLogs('run-73')
      const runtime = mapRuntimeEventToLogEntry({ ...runtimeEvent, occurredAt: 'invalid-timestamp' })
      expect(logs[0]?.time).toBe(canonicalTime('zh-CN', 'UTC'))
      expect(logs[1]?.time).toBe('invalid-timestamp')
      expect(runtime.time).toBe('invalid-timestamp')
      render([...logs, runtime], 'zh-CN')
      expect(wrapper!.text()).toContain('invalid-timestamp')
    } finally { vi.useRealTimers() }
  })
})
