// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import NodeConnectionSelector from './NodeConnectionSelector.vue'
import { nodeConnectionMessages } from './nodeConnectionMessages'

const root = '/ai/node-connections'
const shared = { id: 'studio-shared', name: 'Studio', provider: 'COMFYUI', baseUrl: 'http://studio-comfy:8188', readOnly: false } satisfies NodeConnection
const converted = { ...shared, provider: 'STABLE_DIFFUSION_WEBUI', baseUrl: 'http://studio-sd:7860' } satisfies NodeConnection
const replacement = { ...shared, id: 'secondary-comfy', name: 'Second Comfy' }
const models: NodeConnectionProbe['models'] = {
  checkpoints: ['scene-model.safetensors'], vaes: [], loras: [], samplers: ['euler'], schedulers: ['normal'], upscalers: ['bilinear'],
}
const graph = {
  '1': { class_type: 'LoadImage', inputs: { image: 'input.png' } },
  '2': { class_type: 'ImageScaleBy', inputs: { image: ['1', 0], upscale_method: 'bilinear', scale_by: 2 } },
  '3': { class_type: 'SaveImage', inputs: { images: ['2', 0], filename_prefix: 'results' } },
}
const graphTypes = ['ImageScaleBy', 'LoadImage', 'SaveImage']
const config = { connectionId: shared.id, provider: shared.provider, mode: 'workflow', workflowJson: graph, checkpoint: 'last-comfy-model', sampler: 'before', upscaler: 'before-algorithm' }

const mismatch = '[data-testid="checklist-connectionId-field-providerMismatch"]'
const select = '[data-testid="connection-select"]'
const retry = '[data-testid="refresh-connection"]'
const sync = '[data-testid="sync-connection-provider"]'
let wrapper: VueWrapper | undefined
let profile: NodeConnection
let catalogError: string
let serviceResult: 'usable' | 'unreachable' | 'request-failed'
let calls: Array<{ method?: string; path?: string; body: unknown; params: unknown }>
let restore: () => void

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
let catalogGate: ReturnType<typeof deferred> | undefined

async function render(nodeType: 'IMAGE_GENERATION' | 'UPSCALE', nodeConfig: Record<string, unknown> = config) {
  const page = mount(NodeConnectionSelector, {
    attachTo: document.body,
    props: { nodeId: 'node-fixture', nodeType, config: nodeConfig },
    global: { plugins: [createPinia(), i18n], stubs: { Teleport: true } },
  })
  wrapper = page
  await flushPromises()
  return page
}
function probes(id: string) {
  return calls.filter(call => call.path === `${root}/${id}/probe`)
}

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  profile = shared; catalogError = ''; serviceResult = 'usable'; catalogGate = undefined; calls = []
  const previous = axiosInstance.defaults.adapter
  const adapter: AxiosAdapter = async (request: InternalAxiosRequestConfig) => {
    const { url: path, method, params } = request
    const body: unknown = typeof request.data === 'string' ? JSON.parse(request.data) : request.data
    calls.push({ path, method, params, body })
    const response = (code: number, message: string, data: unknown) => ({ config: request, headers: {}, status: 200, statusText: 'OK', data: { code, message, data } })
    const ok = (data: unknown) => response(0, 'ok', data)
    if (method === 'get' && path === root) {
      if (catalogGate) await catalogGate.promise
      return catalogError ? response(503, catalogError, null) : ok({ connections: [profile, replacement] })
    }
    const connection = path === `${root}/${shared.id}/probe` ? profile : path === `${root}/${replacement.id}/probe` ? replacement : null
    if (connection && (method === 'post' || method === 'get')) {
      // Mirror the saved-profile type gate from NodeConnectionService.probeWorkflow.
      if (method === 'post' && connection.provider !== 'COMFYUI') return response(422, '请为 ComfyUI API 执行图提供实际节点类型', null)
      if (serviceResult === 'request-failed') return response(503, '连接测试暂时失败', null)
      const result: NodeConnectionProbe = {
        status: serviceResult, message: serviceResult === 'unreachable' ? '测试：服务暂时无法连接' : '测试：已读取目录',
        detectedFrom: 'backend', models, capabilities: ['IMAGE_GENERATION', 'UPSCALE'],
      }
      return ok(result)
    }
    throw new Error(`Unexpected fixture dispatch: ${method} ${path}`)
  }
  axiosInstance.defaults.adapter = adapter
  restore = () => { axiosInstance.defaults.adapter = previous }
})
afterEach(async () => {
  catalogGate?.resolve()
  await flushPromises()
  wrapper?.unmount()
  wrapper = undefined
  restore()
})

describe('节点连接发生 Provider 变更后的诊断与恢复', () => {
  it.each(['IMAGE_GENERATION', 'UPSCALE'] as const)('%s：重测共享连接后指出 Provider 不匹配，不让 SD 接收 Comfy 图探测；换兼容连接可恢复', async nodeType => {
    const page = await render(nodeType)
    expect(probes(shared.id)).toEqual([expect.objectContaining({ method: 'post', body: { workflowNodeTypes: graphTypes } })])
    expect(page.find(mismatch).exists()).toBe(false)
    profile = converted
    await page.get(retry).trigger('click')
    await flushPromises()

    expect(page.get(mismatch).text()).toContain(nodeConnectionMessages['zh-CN'].checklistReason.providerMismatch)
    expect(page.text()).not.toContain('请为 ComfyUI API 执行图提供实际节点类型')
    expect(probes(shared.id).map(call => call.method)).toEqual(['post', 'get'])
    expect(probes(shared.id)[1]).toMatchObject({ body: undefined, params: { nodeType } })
    expect(probes(shared.id)[1]?.params).not.toHaveProperty('checkpoint')
    const catalogField = page.find('[data-testid="model-checkpoint"]')
    if (nodeType === 'IMAGE_GENERATION') {
      expect(catalogField.element.matches(':disabled')).toBe(true)
      expect(catalogField.text()).toContain('last-comfy-model')
      expect(catalogField.text()).not.toContain('scene-model.safetensors')
      expect(page.find('[data-testid="unsupported-checkpoint"]').exists()).toBe(false)
    }
    expect(page.emitted('apply')).toBeUndefined()
    expect(page.emitted('updateConfig')).toBeUndefined()
    await page.get('[data-testid="locate-connectionId-field-providerMismatch"]').trigger('click')
    expect(document.activeElement).toBe(page.get(select).element)
    await page.get(select).setValue(replacement.id)
    expect(page.emitted('apply')).toEqual([[{ connectionId: replacement.id, provider: 'COMFYUI' }, 'node-fixture']])
    await page.setProps({ config: { ...config, connectionId: replacement.id } })
    await flushPromises()
    expect(page.find(mismatch).exists()).toBe(false)
    expect(probes(replacement.id)).toEqual([expect.objectContaining({ method: 'post', body: { workflowNodeTypes: graphTypes } })])
    expect(page.props('config').workflowJson).toStrictEqual(graph)
    expect(page.props('config').checkpoint).toBe('last-comfy-model')
    expect(calls.some(call => call.method === 'put' || (call.method === 'post' && !call.path?.endsWith('/probe')))).toBe(false)
  })

  it.each(['unreachable', 'request-failed'] as const)('%s：已有目录足以提示 Provider 不匹配，仍显示独立的探测结果并保留显式同步', async result => {
    profile = converted
    serviceResult = result
    const plain = { ...config, mode: 'txt2img', workflowJson: {} as typeof graph }
    const page = await render('IMAGE_GENERATION', plain)
    const message = result === 'unreachable' ? '测试：服务暂时无法连接' : '连接测试暂时失败'
    expect(page.text()).toContain(message)
    expect(page.find(mismatch).exists()).toBe(true)
    expect(page.emitted('apply')).toBeUndefined()
    await page.get(sync).trigger('click')
    expect(page.emitted('apply')).toEqual([[{ connectionId: shared.id, provider: converted.provider }, 'node-fixture']])
    expect(page.emitted('updateConfig')).toBeUndefined()
  })

  it('目录刷新失败不把缓存描述成当前 Provider；下一次取得目录后恢复提示', async () => {
    profile = converted
    const page = await render('IMAGE_GENERATION')
    expect(page.find(mismatch).exists()).toBe(true)
    const oldSync = page.get(sync)
    catalogGate = deferred()
    const failedMessage = '读取共享连接目录失败'
    catalogError = failedMessage
    await page.get(retry).trigger('click')
    expect(page.find(mismatch).exists()).toBe(false)
    await oldSync.trigger('click')
    expect(page.emitted('apply')).toBeUndefined()
    catalogGate.resolve()
    await flushPromises()
    expect(page.text()).toContain(failedMessage)
    expect(page.find(mismatch).exists()).toBe(false)
    expect(probes(shared.id)).toHaveLength(1)
    catalogError = ''
    await page.get(retry).trigger('click')
    await flushPromises()
    expect(page.find(mismatch).exists()).toBe(true)
    expect(page.text()).not.toContain(failedMessage)
    expect(probes(shared.id).map(call => call.method)).toEqual(['get', 'get'])
  })

  it('已确认相同 Provider 的导入图仍传原节点类型，普通配置不使用图探测', async () => {
    const page = await render('IMAGE_GENERATION')
    expect(probes(shared.id)).toEqual([expect.objectContaining({ method: 'post', body: { workflowNodeTypes: graphTypes } })])
    await page.setProps({ config: { ...config, mode: 'txt2img', workflowJson: {} } })
    await flushPromises()
    expect(probes(shared.id)[1]).toEqual(expect.objectContaining({ method: 'get', params: { nodeType: 'IMAGE_GENERATION', checkpoint: 'last-comfy-model' } }))
    expect(page.find(mismatch).exists()).toBe(false)
  })

  it('先解除 Provider 不匹配再提示选择 Checkpoint；兼容 ComfyUI 仍保留必选提示', async () => {
    profile = converted
    const page = await render('IMAGE_GENERATION', { ...config, mode: 'txt2img', workflowJson: {}, checkpoint: '' })
    const required = '[data-testid="checkpoint-required"]'
    const checkpoint = '[data-testid="model-checkpoint"]'
    expect(page.find(mismatch).exists()).toBe(true)
    expect(page.get(checkpoint).element.matches(':disabled')).toBe(true)
    expect(page.find(required).exists()).toBe(false)
    profile = shared
    await page.get(retry).trigger('click')
    await flushPromises()
    expect(page.find(mismatch).exists()).toBe(false)
    expect(page.get(checkpoint).element.matches(':disabled')).toBe(false)
    expect(page.find(required).exists()).toBe(true)
    expect(page.find('[data-testid="checklist-checkpoint-field-required"]').exists()).toBe(true)
  })

  it('已确认缺少连接时只显示原缺失回退提示，不探测或提供同步', async () => {
    const page = await render('IMAGE_GENERATION', { ...config, connectionId: 'unknown-fixture' })
    expect(page.find('[data-testid="missing-connection"]').exists()).toBe(true)
    expect(probes('unknown-fixture')).toHaveLength(0)
    expect(page.find(mismatch).exists()).toBe(false)
    expect(page.find(sync).exists()).toBe(false)
  })
})
