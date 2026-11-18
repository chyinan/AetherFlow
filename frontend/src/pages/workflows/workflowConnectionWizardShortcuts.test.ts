// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), getWorkflow: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({
  apiClient: { get: api.get, post: api.post, put: api.put },
  setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn(),
}))
vi.mock('@/services/api/workflowApi', async original => ({
  ...await original<typeof import('@/services/api/workflowApi')>(),
  workflowApi: { getWorkflow: api.getWorkflow },
}))

const profile: NodeConnection = {
  id: 'studio', name: '现有图像服务', provider: 'COMFYUI', baseUrl: 'http://studio.test:8188', readOnly: false,
}
const probe: NodeConnectionProbe = {
  status: 'usable', message: '已读取模拟服务目录', detectedFrom: 'backend',
  models: { checkpoints: ['base.safetensors', 'recent.safetensors'], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: [] },
  capabilities: ['IMAGE_GENERATION'],
}
const name = '还没保存的连接'
const url = 'http://new-studio.test:8188'
let wrapper: VueWrapper | undefined

function field<T extends HTMLElement>(id: string) {
  const element = document.querySelector<T>(`[data-testid="${id}"]`)
  if (!element) throw new Error(`未找到 ${id}`)
  return element
}

function fill(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(target: HTMLElement, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  target.dispatchEvent(event)
  return event
}

function dialog() { return document.querySelector('[data-testid="connection-dialog"]') }

async function setup(provider: NodeConnection['provider'] = 'COMFYUI') {
  api.get.mockImplementation(async (path: string) => {
    if (path === '/ai/node-connections') return { connections: [{ ...profile, provider }] }
    if (path === '/ai/node-connections/studio/probe' || path === '/ai/node-connections/new-studio/probe') return probe
    throw new Error(`未预期的读取：${path}`)
  })
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'loadFiles').mockResolvedValue(undefined)
  vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined)
  vi.spyOn(useRunStore(), 'loadRuns').mockResolvedValue(undefined)
  const router = createRouter({
    history: createMemoryHistory(), routes: [{ path: '/workflows/:id', component: WorkflowPage }],
  })
  await router.push('/workflows/101')
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n],
    stubs: { WorkflowCanvas: true, AICopilotPanel: true, RunConsole: true },
  } })
  await flushPromises()
  const node = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'image-generation')!, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, { provider, connectionId: profile.id, checkpoint: 'base.safetensors' })
  useUiStore().setSelectedNode(node.id)
  await flushPromises()
  await wrapper.get('[data-testid="model-checkpoint"]').setValue('recent.safetensors')
  await flushPromises()
  const config = () => store.nodes.find(item => item.id === node.id)!.data.config
  expect(config().checkpoint).toBe('recent.safetensors')
  const opener = field<HTMLButtonElement>('add-connection')
  return { store, config, opener }
}

async function openWizard(opener: HTMLButtonElement) {
  opener.focus()
  opener.click()
  await flushPromises()
  expect(dialog()?.parentElement?.parentElement).toBe(document.body)
  const nameInput = field<HTMLInputElement>('connection-name')
  expect(document.activeElement).toBe(nameInput)
  fill(nameInput, name)
  fill(field<HTMLInputElement>('connection-url'), url)
  await flushPromises()
}

describe('节点连接向导隔离工作流的撤销重做', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    api.getWorkflow.mockImplementation(async (id: string): Promise<WorkflowDefinition> => ({
      id, backendDefinitionId: Number(id), backendVersion: 1, name: '图像工作流', nodes: [], edges: [],
    }))
    api.post.mockImplementation(async (path: string, payload: Pick<NodeConnection, 'name' | 'baseUrl' | 'provider'>) => {
      if (path === '/ai/node-connections/probe') return probe
      if (path === '/ai/node-connections') return { id: 'new-studio', ...payload, readOnly: false }
      throw new Error(`未预期的提交：${path}`)
    })
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it.each([
    ['ComfyUI 的测试按钮', 'COMFYUI', 'test-connection', { ctrlKey: true }],
    ['SD WebUI 的取消按钮', 'STABLE_DIFFUSION_WEBUI', 'cancel-connection', { metaKey: true }],
  ] as const)('%s 上的撤销不更改检查点或清除连接草稿', async (_label, provider, buttonId, modifiers) => {
    const { store, config, opener } = await setup(provider)
    const history = store.historyPast.length
    const revision = store.editRevision
    await openWizard(opener)
    const button = field<HTMLButtonElement>(buttonId)
    button.focus()
    expect(document.activeElement).toBe(button)
    const event = press(button, 'z', modifiers)
    await flushPromises()

    expect.soft(config().checkpoint).toBe('recent.safetensors')
    expect.soft(store.historyPast).toHaveLength(history)
    expect.soft(store.editRevision).toBe(revision)
    expect.soft(event.defaultPrevented).toBe(false)
    expect(dialog()).not.toBeNull()
    expect(field<HTMLInputElement>('connection-name').value).toBe(name)
    expect(field<HTMLInputElement>('connection-url').value).toBe(url)
    expect(document.activeElement).toBe(button)
    expect(api.post).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })

  it.each([
    ['Ctrl+Y', 'y', { ctrlKey: true }],
    ['Ctrl+Shift+Y', 'Y', { ctrlKey: true, shiftKey: true }],
    ['Cmd+Shift+Z', 'Z', { metaKey: true, shiftKey: true }],
  ] as const)('%s 不重做向导背后的工作流编辑', async (_label, key, modifiers) => {
    const { store, config, opener } = await setup()
    expect(store.undo()).toBe(true)
    await flushPromises()
    expect(config().checkpoint).toBe('base.safetensors')
    const redo = store.historyFuture.length
    expect(redo).toBeGreaterThan(0)
    await openWizard(opener)
    const button = field<HTMLButtonElement>('test-connection')
    button.focus()
    const event = press(button, key, modifiers)
    await flushPromises()

    expect.soft(config().checkpoint).toBe('base.safetensors')
    expect.soft(store.historyFuture).toHaveLength(redo)
    expect.soft(event.defaultPrevented).toBe(false)
    expect(dialog()).not.toBeNull()
    expect(field<HTMLInputElement>('connection-name').value).toBe(name)
    expect(document.activeElement).toBe(button)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('输入框保留原生撤销默认行为，其他按键正常冒泡，Esc 关闭后画布快捷键恢复', async () => {
    const { config, opener } = await setup()
    await openWizard(opener)
    const input = field<HTMLInputElement>('connection-url')
    input.focus()
    expect(press(input, 'z', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(press(input, 'Z', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false)
    expect(config().checkpoint).toBe('recent.safetensors')
    const unrelated = vi.fn()
    window.addEventListener('keydown', unrelated)
    try {
      const button = field<HTMLButtonElement>('test-connection')
      button.focus()
      const otherKey = press(button, 'k', { ctrlKey: true })
      expect(unrelated).toHaveBeenCalledExactlyOnceWith(otherKey)
      expect(otherKey.defaultPrevented).toBe(false)
      expect(press(button, 'Escape').defaultPrevented).toBe(true)
      await flushPromises()
      expect(dialog()).toBeNull()
      expect(document.activeElement).toBe(opener)
      expect(press(opener, 'z', { ctrlKey: true }).defaultPrevented).toBe(true)
      await flushPromises()
      expect(config().checkpoint).toBe('base.safetensors')
      expect(press(opener, 'y', { ctrlKey: true }).defaultPrevented).toBe(true)
      await flushPromises()
      expect(config().checkpoint).toBe('recent.safetensors')
    } finally {
      window.removeEventListener('keydown', unrelated)
    }
  })

  it('测试成功后在保存按钮上按撤销不破坏通过的测试，可显式保存并应用一次', async () => {
    const { store, config, opener } = await setup()
    await openWizard(opener)
    field<HTMLButtonElement>('test-connection').click()
    await flushPromises()
    const save = field<HTMLButtonElement>('save-connection')
    expect(save.disabled).toBe(false)
    const history = store.historyPast.length
    save.focus()
    expect(document.activeElement).toBe(save)
    press(save, 'z', { metaKey: true })
    await flushPromises()
    expect.soft(config().checkpoint).toBe('recent.safetensors')
    expect.soft(store.historyPast).toHaveLength(history)
    expect(dialog()).not.toBeNull()
    expect(field<HTMLButtonElement>('save-connection')).toBe(save)
    expect(save.disabled).toBe(false)
    save.click()
    await flushPromises()

    expect(api.post.mock.calls).toEqual([
      ['/ai/node-connections/probe', { provider: 'COMFYUI', baseUrl: url, nodeType: 'IMAGE_GENERATION' }, { source: 'ai' }],
      ['/ai/node-connections', { name, provider: 'COMFYUI', baseUrl: url }, { source: 'ai' }],
    ])
    expect(config()).toMatchObject({ connectionId: 'new-studio', checkpoint: 'recent.safetensors' })
    expect(store.historyPast).toHaveLength(history + 1)
    expect(dialog()).toBeNull()
  })
})
