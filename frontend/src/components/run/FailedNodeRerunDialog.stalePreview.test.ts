// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { axiosInstance } from '@/api/client'
import type { FailedNodeRerunPreview } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import FailedNodeRerunDialog from './FailedNodeRerunDialog.vue'

const staleMessage = '运行快照已变化，请重新预览重跑范围'
const originalAdapter = axiosInstance.defaults.adapter
const requests: Array<{ method: string; path: string; body?: unknown }> = []
let wrapper: ReturnType<typeof mount> | undefined
let replies: Array<(config: InternalAxiosRequestConfig) => Promise<AxiosResponse>> = []

function preview(revision: string, label: string, nodeId = 'failure'): FailedNodeRerunPreview {
  return { sourceInstanceId: 18, nodeId, revision, eligible: true,
    invalidatedNodes: [{ nodeId, label }], preservedNodes: [], blockers: [] }
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { config, status, statusText: String(status), data, headers: {} }
}

function success(data: unknown) {
  return async (config: InternalAxiosRequestConfig) => respond(config, 200, { code: 200, message: '成功', data })
}

function failure(status: number, message: string, code = status) {
  return async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError(message, 'ERR_BAD_REQUEST', config, undefined, respond(config, status, { code, message }))
  }
}

function panel() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')!
}

function action(name: string) {
  return panel().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!
}

async function click(name: string) {
  action(name).click()
  await flushPromises()
}

function payloads() {
  return requests.filter(request => request.method === 'post').map(request => request.body)
}

async function render() {
  wrapper = mount(FailedNodeRerunDialog, {
    props: { instanceId: 18, nodeId: 'failure', nodeLabel: '失败节点' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  await flushPromises()
  expect(panel().querySelector('[data-test="invalidated"]')?.textContent).toContain('旧预览范围')
  expect(action('rerun').disabled).toBe(false)
  return wrapper
}

beforeEach(() => {
  const first = preview('revision-1', '旧预览范围')
  replies = [success(first)]
  requests.length = 0
  axiosInstance.defaults.adapter = async config => {
    const method = config.method ?? ''
    const path = config.url ?? ''
    if (path !== '/workflow-instances/18/nodes/failure/rerun/preview'
      && path !== '/workflow-instances/18/nodes/failure/rerun'
      && path !== '/workflow-instances/18/nodes/other/rerun/preview') {
      throw new Error(`非预期请求：${method} ${path}`)
    }
    requests.push({ method, path, body: config.data ? JSON.parse(String(config.data)) : undefined })
    const reply = replies.shift()
    if (!reply) throw new Error(`缺少受控回执：${method} ${path}`)
    return reply(config)
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
})

describe('局部重跑：过期预览冲突', () => {
  it.each([
    ['HTTP 409', failure(409, staleMessage)],
    ['业务响应 409', async (config: InternalAxiosRequestConfig) => respond(config, 200, { code: 409, message: staleMessage })],
  ] as const)('%s 作废旧范围，只有重新预览并再次确认才提交新版本', async (_name, stale) => {
    replies.push(stale, success(preview('revision-2', '更新后的范围')), success({ id: 27 }))
    const view = await render()

    await click('rerun')
    expect(panel().querySelector('[role="alert"]')?.textContent).toContain(staleMessage)
    expect(action('reload')).not.toBeNull()
    expect(action('rerun').disabled).toBe(true)
    expect(panel().querySelector('[data-test="invalidated"]')).toBeNull()
    expect(requests.map(request => request.method)).toEqual(['get', 'post'])
    expect(view.emitted('completed')).toBeUndefined()

    await click('rerun')
    expect(payloads()).toEqual([{ expectedRevision: 'revision-1' }])
    await click('reload')
    expect(panel().querySelector('[role="alert"]')).toBeNull()
    expect(panel().querySelector('[data-test="invalidated"]')?.textContent).toContain('更新后的范围')
    expect(action('rerun').disabled).toBe(false)
    expect(payloads()).toEqual([{ expectedRevision: 'revision-1' }])

    await click('rerun')
    expect(payloads()).toEqual([{ expectedRevision: 'revision-1' }, { expectedRevision: 'revision-2' }])
    expect(view.emitted('completed')).toEqual([[27]])
  })

  it('重新预览失败或资格已变化时，不能提交旧版本', async () => {
    replies.push(
      failure(409, staleMessage),
      failure(422, '预览暂不可用'),
      success({ ...preview('revision-2', '新范围'), eligible: false, blockers: ['不能重跑'] }),
    )
    await render()
    await click('rerun')
    expect(action('rerun').disabled).toBe(true)

    await click('reload')
    expect(action('rerun').disabled).toBe(true)
    expect(panel().querySelector('[role="alert"]')?.textContent).toContain('预览暂不可用')
    await click('reload')
    expect(action('rerun').disabled).toBe(true)
    expect(panel().querySelector('[role="alert"]')?.textContent).toContain('不能重跑')
    await click('rerun')
    expect(payloads()).toEqual([{ expectedRevision: 'revision-1' }])
  })

  it.each([
    [409, '重跑请求正在创建，请使用相同预览重试'],
    [503, '服务暂不可用'],
    [422, staleMessage],
  ] as const)('保留其他响应的原有重试行为（%s：%s）', async (status, message) => {
    replies.push(failure(status, message), success({ id: 27 }))
    const view = await render()
    await click('rerun')

    expect(panel().querySelector('[role="alert"]')?.textContent).toContain(message)
    expect(panel().querySelector('[data-test="invalidated"]')?.textContent).toContain('旧预览范围')
    expect(action('rerun').disabled).toBe(false)
    expect(requests.map(request => request.method)).toEqual(['get', 'post'])
    await click('rerun')
    expect(payloads()).toEqual([{ expectedRevision: 'revision-1' }, { expectedRevision: 'revision-1' }])
    expect(view.emitted('completed')).toEqual([[27]])
  })

  it('切换节点后，迟到的旧冲突不能作废新节点预览', async () => {
    let reject!: () => void
    replies.push(config => new Promise((_, fail) => {
      reject = () => failure(409, staleMessage)(config).catch(fail)
    }), success(preview('revision-other', '另一节点范围', 'other')))
    const view = await render()
    await click('rerun')
    expect(action('rerun').disabled).toBe(true)
    await view.setProps({ nodeId: 'other' })
    await flushPromises()
    reject()
    await flushPromises()

    expect(panel().querySelector('[role="alert"]')).toBeNull()
    expect(panel().querySelector('[data-test="invalidated"]')?.textContent).toContain('另一节点范围')
    expect(action('rerun').disabled).toBe(false)
    expect(payloads()).toEqual([{ expectedRevision: 'revision-1' }])
  })
})
