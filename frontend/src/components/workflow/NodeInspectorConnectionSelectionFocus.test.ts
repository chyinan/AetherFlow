// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosHeaders } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { axiosInstance } from '@/api/client/apiClient'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'

const profile: NodeConnection = {
  id: 'saved-comfy', name: '已有图像连接', provider: 'COMFYUI', baseUrl: 'http://comfy.test:8188', readOnly: false,
}
const probe: NodeConnectionProbe = {
  status: 'usable', message: '连接诊断完成', detectedFrom: 'backend', capabilities: ['IMAGE_GENERATION'],
  models: { checkpoints: ['base.safetensors'], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: [] },
}
const oldAdapter = axiosInstance.defaults.adapter
let wrapper: VueWrapper | undefined

async function render(config: Record<string, unknown> = { provider: 'COMFYUI' }) {
  const requests: string[] = []
  axiosInstance.defaults.adapter = async (request) => {
    const path = request.url!
    if (request.method === 'get' && path === '/workflow/node/catalog') {
      return { data: [], status: 200, statusText: 'OK', headers: new AxiosHeaders(), config: request }
    }
    requests.push(`${request.method} ${path}`)
    if (request.method !== 'get') throw new Error(`未预期的写入：${path}`)
    const data = path === '/ai/node-connections' ? { connections: [profile] }
      : /^\/ai\/node-connections\/(deployment-comfyui|deployment-sd|saved-comfy)\/probe$/.test(path) ? probe : null
    if (!data) throw new Error(`未预期的读取：${path}`)
    return { data, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config: request }
  }
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'image-generation')!, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, config)
  useUiStore().setSelectedNode(node.id)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  const inspector = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  wrapper = inspector
  await flushPromises()
  expect(inspector.get('[data-testid="selected-status"]').text()).toContain(probe.message)
  return { inspector, requests, nodeConfig: () => store.nodes.find((item) => item.id === node.id)!.data.config }
}

async function dismissWizard(opener: HTMLButtonElement, via: 'cancel' | 'escape') {
  opener.focus()
  opener.click()
  await flushPromises()
  const name = document.querySelector<HTMLInputElement>('[data-testid="connection-name"]')!
  expect(document.activeElement).toBe(name)
  if (via === 'cancel') document.querySelector<HTMLButtonElement>('[data-testid="cancel-connection"]')!.click()
  else name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
  expect(document.querySelector('[data-testid="connection-dialog"]')).toBeNull()
  expect(document.activeElement).toBe(opener)
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = oldAdapter
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('关闭连接向导后保留下拉框的键盘焦点', () => {
  it('取消添加后选择已有连接并完成自动诊断，不回到旧的添加按钮', async () => {
    const { inspector, requests, nodeConfig } = await render()
    await dismissWizard(inspector.get<HTMLButtonElement>('[data-testid="add-connection"]').element, 'cancel')
    const select = inspector.get<HTMLSelectElement>('[data-testid="connection-select"]')
    select.element.focus()
    await select.setValue(profile.id)
    await flushPromises()

    expect(nodeConfig()).toMatchObject({ connectionId: profile.id, provider: profile.provider })
    expect(requests).toEqual([
      'get /ai/node-connections',
      'get /ai/node-connections/deployment-comfyui/probe',
      'get /ai/node-connections/saved-comfy/probe',
    ])
    expect(document.activeElement).toBe(select.element)
  })

  it('退出编辑后切回部署默认，已移除的编辑按钮不会带走焦点', async () => {
    const { inspector, requests, nodeConfig } = await render({ provider: profile.provider, connectionId: profile.id })
    const opener = inspector.get<HTMLButtonElement>('[data-testid="edit-connection"]').element
    await dismissWizard(opener, 'escape')
    const select = inspector.get<HTMLSelectElement>('[data-testid="connection-select"]')
    select.element.focus()
    await select.setValue('')
    await flushPromises()

    expect(opener.isConnected).toBe(false)
    expect(nodeConfig().connectionId).toBeUndefined()
    expect(requests).toEqual([
      'get /ai/node-connections',
      'get /ai/node-connections/saved-comfy/probe',
      'get /ai/node-connections/deployment-comfyui/probe',
    ])
    expect(document.activeElement).toBe(select.element)
  })

  it('默认 Provider 连续切换和自动诊断时始终保留当前下拉框的焦点', async () => {
    const { inspector, requests, nodeConfig } = await render()
    await dismissWizard(inspector.get<HTMLButtonElement>('[data-testid="add-connection"]').element, 'escape')
    const select = inspector.get<HTMLSelectElement>('[data-testid="default-provider"]')
    select.element.focus()
    for (const provider of ['STABLE_DIFFUSION_WEBUI', 'COMFYUI']) {
      await select.setValue(provider)
      await flushPromises()
      expect(nodeConfig().provider).toBe(provider)
      expect.soft(document.activeElement).toBe(select.element)
    }

    expect(requests).toEqual([
      'get /ai/node-connections',
      'get /ai/node-connections/deployment-comfyui/probe',
      'get /ai/node-connections/deployment-sd/probe',
      'get /ai/node-connections/deployment-comfyui/probe',
    ])
  })
})
