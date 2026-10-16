// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SseHooks = { onReconnect?: (attempt: number) => void; onMessage?: (message: { event: string; data: string }) => void }
type SocketHooks = { onError?: (error: unknown) => void }
const transport = vi.hoisted(() => ({
  sse: vi.fn((_options: SseHooks) => ({ connect: vi.fn(), close: vi.fn() })),
  socket: vi.fn((_options: SocketHooks) => ({ connect: vi.fn(), close: vi.fn() })),
  environment: { mockFallback: false, runtimeWebSocketFallback: false },
}))
vi.mock('@/config/runtimeEnv', async original => {
  const module = await original<typeof import('@/config/runtimeEnv')>()
  return { ...module, runtimeEnv: { ...module.runtimeEnv,
    get mockFallback() { return transport.environment.mockFallback },
    get runtimeWebSocketFallback() { return transport.environment.runtimeWebSocketFallback },
  } }
})
vi.mock('@/services/realtime/sseClient', async original => ({
  ...await original<typeof import('@/services/realtime/sseClient')>(), createSseClient: transport.sse,
}))
vi.mock('@/services/realtime/runtimeSocket', () => ({ createRuntimeSocket: transport.socket }))

import LogStream from '@/components/run/LogStream.vue'
import { setStoredLocale, setStoredTimezone } from '@/i18n/locale'
import { realtimeClient } from '@/services/realtime/realtimeClient'
import type { RunLogEntry } from '@/types/run'

const occurredAt = '2026-10-16T20:34:05.000Z'
const time = (zone: string) => new Date(occurredAt).toLocaleTimeString('zh-CN', { hour12: false, timeZone: zone })
let stop: (() => void) | undefined
let wrapper: VueWrapper | undefined

beforeEach(() => {
  localStorage.clear(); setStoredLocale('zh-CN'); setStoredTimezone('UTC')
  vi.useFakeTimers(); vi.setSystemTime(new Date(occurredAt))
  transport.environment.mockFallback = false; transport.environment.runtimeWebSocketFallback = false
  transport.sse.mockClear(); transport.socket.mockClear()
})
afterEach(() => { stop?.(); stop = undefined; wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); localStorage.clear() })

describe('实时通道正常本地日志保留可重显示的时间', () => {
  it.each(['缺少运行时 ID', 'WebSocket 失败', '显式演示回退', '真实运行时事件'] as const)('%s 日志在偏好变更后展示当前时区', source => {
    const logs: RunLogEntry[] = []
    const onLog = (entry: RunLogEntry) => logs.push(entry)
    transport.environment.runtimeWebSocketFallback = source === 'WebSocket 失败'
    transport.environment.mockFallback = source === '显式演示回退'
    stop = realtimeClient.subscribeRun({ runId: 'run-73', ...(source !== '缺少运行时 ID' ? { runtimeWorkflowId: '73' } : {}) }, { onLog })
    const sse = transport.sse.mock.calls[0]?.[0]
    if (source === 'WebSocket 失败') {
      sse!.onReconnect!(2)
      transport.socket.mock.calls[0]![0].onError!(new Error('固定连接错误'))
    } else if (source === '显式演示回退') {
      sse!.onReconnect!(2)
    } else if (source === '真实运行时事件') {
      sse!.onMessage!({ event: 'message', data: JSON.stringify({ eventId: 'event-73', eventType: 'NODE_STARTED',
        workflowId: '73', traceId: 'trace-73', runtimeState: 'RUNNING', occurredAt }) })
    }
    expect(logs).toHaveLength(1)
    expect.soft(logs[0]).toMatchObject({ occurredAt, time: time('UTC') })
    const snapshot = structuredClone(logs)
    setStoredTimezone('Asia/Tokyo')
    wrapper = mount(LogStream, { props: { logs, runId: 'run-73' }, global: { plugins: [createI18n({
      legacy: false, locale: 'zh-CN', messages: {}, missingWarn: false, fallbackWarn: false,
    })] } })
    expect.soft(wrapper.text()).toContain(time('Asia/Tokyo'))
    expect(logs).toEqual(snapshot)
    expect(wrapper.text()).toContain(logs[0]!.message)
  })
})
