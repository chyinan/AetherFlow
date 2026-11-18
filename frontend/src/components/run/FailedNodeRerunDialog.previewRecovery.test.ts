// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client'
import type { FailedNodeRerunPreview } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import FailedNodeRerunDialog from './FailedNodeRerunDialog.vue'

const originalAdapter = axiosInstance.defaults.adapter
const load = vi.fn<(request: InternalAxiosRequestConfig) => Promise<AxiosResponse>>()
const started = vi.fn()
const unexpectedRequests: string[] = []
const endpoint = '/workflow-instances/18/nodes/failure/rerun/preview'
const preview: FailedNodeRerunPreview = {
  sourceInstanceId: 18,
  nodeId: 'failure',
  revision: 'revision-2',
  eligible: true,
  invalidatedNodes: [{ nodeId: 'failure', label: '本次预览的失败节点' }],
  preservedNodes: [],
  blockers: [],
}

let wrapper: ReturnType<typeof mount> | undefined

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function response(config: InternalAxiosRequestConfig, status = 200, data: unknown = preview): AxiosResponse {
  return { config, status, statusText: String(status), data, headers: {} }
}

function fail(config: InternalAxiosRequestConfig, status: number) {
  return Promise.reject(new AxiosError('预览暂不可用', 'ERR_BAD_RESPONSE', config, undefined, response(config, status, {})))
}

function panel() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')!
}

function action(name: string) {
  return panel().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!
}

function pressFromFocus(key: string, shiftKey = false) {
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
}

function open() {
  const trigger = wrapper!.get<HTMLButtonElement>('button')
  trigger.element.focus()
  trigger.element.click()
  return trigger.element
}

async function renderFailedPreview() {
  load.mockImplementation(config => fail(config, 503))
  wrapper = mount(defineComponent({
    setup() {
      const visible = ref(false)
      return () => h('div', [
        h('button', { type: 'button', onClick: () => { visible.value = true } }, '局部重跑'),
        visible.value ? h(FailedNodeRerunDialog, {
          instanceId: 18,
          nodeId: 'failure',
          nodeLabel: '失败节点',
          onClose: () => { visible.value = false },
          onCompleted: started,
        }) : null,
      ])
    },
  }), { attachTo: document.body, global: { plugins: [i18n] } })
  const trigger = open()
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1_000)
  await flushPromises()
  expect(load).toHaveBeenCalledTimes(3)
  expect(panel().querySelector('[role="alert"]')).not.toBeNull()
  return trigger
}

beforeEach(() => {
  load.mockReset()
  started.mockReset()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  axiosInstance.defaults.adapter = request => {
    if (request.method !== 'get' || request.url !== endpoint) {
      const description = `${request.method} ${request.url}`
      unexpectedRequests.push(description)
      throw new Error(`非预期请求：${description}`)
    }
    return load(request)
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
  vi.useRealTimers()
  expect(unexpectedRequests.splice(0)).toEqual([])
})

describe('失败节点局部重跑：键盘重试预览', () => {
  it('等待重试时焦点留在对话框内，Escape 可关闭并返回入口', async () => {
    const trigger = await renderFailedPreview()
    const pending = deferred<void>()
    load.mockImplementation(async config => { await pending.promise; return response(config) })
    action('reload').focus()
    action('reload').click()
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(4)
    expect(action('reload')).toBeNull()
    expect(action('rerun').disabled).toBe(true)
    expect(panel().querySelector('[role="status"]')).not.toBeNull()
    expect.soft(document.activeElement).toBe(panel())
    pressFromFocus('Escape')
    await flushPromises()
    expect.soft(panel()).toBeNull()
    expect.soft(document.activeElement).toBe(trigger)

    pending.resolve()
    await flushPromises()
    expect(panel()).toBeNull()
    expect(started).not.toHaveBeenCalled()
  })

  it('仍留在对话框等待时，失败后焦点回到重新出现的重试按钮', async () => {
    await renderFailedPreview()
    const previous = action('reload')
    previous.focus()
    load.mockImplementation(config => fail(config, 422))
    previous.click()
    await flushPromises()

    const replacement = action('reload')
    expect(replacement).not.toBe(previous)
    expect.soft(document.activeElement).toBe(replacement)
    expect(panel().querySelector('[role="alert"]')).not.toBeNull()
    expect(load).toHaveBeenCalledTimes(4)
    expect(started).not.toHaveBeenCalled()
  })

  it('成功只展示新预览，焦点不会落到确认按钮或发起运行', async () => {
    await renderFailedPreview()
    const pending = deferred<void>()
    load.mockImplementation(async config => { await pending.promise; return response(config) })
    action('reload').focus()
    action('reload').click()
    await flushPromises()
    pending.resolve()
    await flushPromises()

    expect.soft(document.activeElement).toBe(panel())
    expect(panel().querySelector('[data-test="invalidated"]')?.textContent).toContain('本次预览的失败节点')
    expect(action('rerun').disabled).toBe(false)
    expect(action('reload')).toBeNull()
    expect(panel().querySelector('[role="alert"]')).toBeNull()
    expect(load).toHaveBeenCalledTimes(4)
    expect(started).not.toHaveBeenCalled()
    pressFromFocus('Tab', true)
    expect(document.activeElement).toBe(action('rerun'))
  })

  it('等待期间主动移到取消按钮，失败后不抢回焦点', async () => {
    await renderFailedPreview()
    const pending = deferred<void>()
    load.mockImplementation(async config => { await pending.promise; return fail(config, 422) })
    action('reload').focus()
    action('reload').click()
    await flushPromises()
    const cancel = action('close')
    cancel.focus()
    pending.resolve()
    await flushPromises()

    expect(document.activeElement).toBe(cancel)
    expect(action('reload')).not.toBeNull()
    expect(load).toHaveBeenCalledTimes(4)
    expect(started).not.toHaveBeenCalled()
  })

  it('未聚焦重试按钮时，不改变对话框里原有的焦点', async () => {
    await renderFailedPreview()
    const cancel = action('close')
    cancel.focus()
    load.mockImplementation(config => fail(config, 422))
    action('reload').click()
    await flushPromises()

    expect(document.activeElement).toBe(cancel)
    expect(action('reload')).not.toBeNull()
    expect(load).toHaveBeenCalledTimes(4)
    expect(started).not.toHaveBeenCalled()
  })
})
