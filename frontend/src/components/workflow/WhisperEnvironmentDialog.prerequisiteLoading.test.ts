// @vitest-environment jsdom
import { AxiosError, AxiosHeaders } from 'axios'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import type { WhisperEnvironment } from '@/api/modules/nodeConnections'
import WhisperEnvironmentDialog from './WhisperEnvironmentDialog.vue'

const transport = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: transport }))

const healthy: WhisperEnvironment = {
  status: 'usable', enabled: true, model: 'medium', device: 'cpu', computeType: 'int8',
  loadedModel: 'medium', dependencyAvailable: true, ffmpegAvailable: true,
  detectedFrom: 'backend', restartRequired: false, message: '',
}
const refreshCapabilities = vi.fn<(isCurrent: () => boolean) => Promise<boolean>>()
let wrapper: VueWrapper | undefined

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

function dialog() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')!
}
function prerequisites() {
  return dialog().querySelector<HTMLElement>('[data-testid="whisper-step-prerequisites"]')!
}
function button(action: string) {
  return document.body.querySelector<HTMLButtonElement>(`[data-action="${action}-whisper-environment"]`)!
}
async function click(action: string) {
  button(action).click()
  await flushPromises()
}
async function selectHost() {
  dialog().querySelector<HTMLInputElement>('[data-deployment="host"]')!.click()
  await flushPromises()
  await click('next')
}
function blockers() {
  return Array.from(prerequisites().querySelectorAll('[data-blocker]'), (item) => item.getAttribute('data-blocker'))
}
async function open(locale = 'en-US') {
  wrapper = mount(WhisperEnvironmentDialog, {
    props: { nodeId: 'asr', refreshCapabilities },
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale, fallbackLocale: 'en-US', messages: {} })] },
  })
  await click('open')
}

beforeEach(() => {
  transport.get.mockReset().mockResolvedValue(healthy)
  refreshCapabilities.mockReset().mockResolvedValue(true)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

describe('Whisper prerequisite refresh', () => {
  it.each([
    ['en-US', 'Prerequisite results will appear when the refresh finishes.', 'The current snapshot shows none of these blockers.'],
    ['zh-CN', '刷新完成后将显示前置检查结果。', '当前快照未发现上述阻碍'],
    ['ja-JP', '更新が完了すると前提条件の確認結果が表示されます。', '現在の検出結果には上記の問題はありません'],
  ])('does not diagnose an outage while the first read is pending (%s)', async (locale, pendingText, clearText) => {
    const read = deferred<WhisperEnvironment>()
    transport.get.mockReturnValueOnce(read.promise)
    await open(locale)
    await selectHost()

    expect(dialog().getAttribute('aria-busy')).toBe('true')
    expect(blockers()).toEqual([])
    expect(prerequisites().textContent).toContain(pendingText)
    expect(prerequisites().textContent).not.toContain(clearText)
    expect(button('next').disabled).toBe(false)
    expect(transport.get).toHaveBeenCalledExactlyOnceWith('/ai/node-connections/whisper', { source: 'ai' })

    read.resolve(healthy)
    await flushPromises()
    expect(dialog().getAttribute('aria-busy')).toBe('false')
    expect(blockers()).toEqual([])
    expect(prerequisites().textContent).not.toContain(pendingText)
    expect(prerequisites().textContent).toContain(clearText)
  })

  it.each(['environment-first', 'capability-first'] as const)(
    'shows neither an outage nor a stale success while the refresh is incomplete (%s)',
    async (order) => {
      await open()
      await selectHost()
      expect(prerequisites().textContent).toContain('The current snapshot shows none of these blockers.')

      const read = deferred<WhisperEnvironment>()
      const capabilities = deferred<boolean>()
      transport.get.mockReturnValueOnce(read.promise)
      refreshCapabilities.mockReturnValueOnce(capabilities.promise)
      await click('refresh')
      if (order === 'environment-first') read.resolve({ ...healthy, status: 'unreachable' })
      else capabilities.resolve(true)
      await flushPromises()

      expect(dialog().getAttribute('aria-busy')).toBe('true')
      expect(blockers()).toEqual([])
      expect(prerequisites().textContent).toContain('Prerequisite results will appear when the refresh finishes.')
      expect(prerequisites().textContent).not.toContain('The current snapshot shows none of these blockers.')
      expect(button('refresh').disabled).toBe(true)
      expect(transport.get).toHaveBeenCalledTimes(2)
      expect(refreshCapabilities).toHaveBeenCalledTimes(2)

      if (order === 'environment-first') capabilities.resolve(true)
      else read.resolve({ ...healthy, status: 'unreachable' })
      await flushPromises()
      expect(blockers()).toEqual(['unreachable'])
      expect(prerequisites().textContent).not.toContain('Prerequisite results will appear when the refresh finishes.')
      expect(button('refresh').disabled).toBe(false)

      await click('refresh')
      expect(blockers()).toEqual([])
      expect(prerequisites().textContent).toContain('The current snapshot shows none of these blockers.')
    },
  )

  it.each([
    ['en-US', 429, 'Too many requests', 'Prerequisite status is unknown. Select Refresh actual status to retry.'],
    ['zh-CN', 503, 'Gateway temporarily unavailable', '前置条件状态未知，请点击「刷新实际状态」重试。'],
    ['ja-JP', 429, 'Too many requests', '前提条件の状態は不明です。「実際の状態を更新」を選んで再試行してください。'],
  ] as const)('does not diagnose a rejected status request as a Python outage (%s, HTTP %i)', async (locale, status, reason, unknownText) => {
    await open(locale)
    await selectHost()
    const config = { headers: new AxiosHeaders(), url: '/ai/node-connections/whisper' }
    transport.get.mockRejectedValueOnce(new AxiosError(reason, AxiosError.ERR_BAD_RESPONSE, config, undefined, {
      config, status, statusText: reason, headers: new AxiosHeaders(), data: { message: reason },
    }))

    await click('refresh')
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(reason)
    expect(dialog().querySelector('[data-testid="whisper-status"]')).toBeNull()
    expect(blockers()).toEqual([])
    expect(prerequisites().textContent).toContain(unknownText)
    expect(button('refresh').disabled).toBe(false)
    expect(button('next').disabled).toBe(false)
    expect(refreshCapabilities).toHaveBeenCalledTimes(2)

    transport.get.mockResolvedValueOnce({ ...healthy, status: 'unreachable', loadedModel: null })
    await click('refresh')
    expect(prerequisites().textContent).not.toContain(unknownText)
    expect(blockers()).toEqual(['unreachable'])
  })

  it('keeps an edited suggestion through a completed read failure and a successful retry', async () => {
    await open()
    await selectHost()
    await click('next')
    const suggestion = dialog().querySelector<HTMLInputElement>('[data-field="suggested-model"]')!
    suggestion.value = 'medium'
    suggestion.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    await click('back')
    transport.get.mockRejectedValueOnce(new Error('Temporary read failure'))
    await click('refresh')
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Could not read the Whisper environment')
    expect(blockers()).toEqual([])
    expect(prerequisites().textContent).toContain('Prerequisite status is unknown')
    expect(button('next').disabled).toBe(false)

    await click('refresh')
    expect(dialog().querySelector('[role="alert"]')).toBeNull()
    expect(blockers()).toEqual([])
    await click('next')
    expect(dialog().querySelector<HTMLInputElement>('[data-field="suggested-model"]')?.value).toBe('medium')
    await click('next')
    dialog().querySelector<HTMLInputElement>('[data-field="applied"]')!.click()
    await flushPromises()
    await click('next')
    expect(button('finish')).toBeNull()
    await click('verify')
    expect(button('finish').disabled).toBe(false)
    await click('finish')
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(button('open'))
  })
})
