// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import NodeConnectionSelector from './NodeConnectionSelector.vue'

const api = vi.hoisted(() => ({
  getNodeConnections: vi.fn(),
  createNodeConnection: vi.fn(),
  updateNodeConnection: vi.fn(),
  probeNodeConnection: vi.fn(),
  probeSavedNodeConnection: vi.fn(),
}))
vi.mock('@/api/modules/nodeConnections', () => api)

const original: NodeConnection = {
  id: 'existing',
  name: '模拟连接',
  provider: 'COMFYUI',
  baseUrl: 'http://image-service.test:8188',
  readOnly: false,
}
const usable: NodeConnectionProbe = {
  status: 'usable',
  message: '模拟连接可用',
  detectedFrom: 'backend',
  models: { checkpoints: ['base.safetensors'], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: [] },
  capabilities: ['IMAGE_GENERATION'],
}
const draft = { name: '模拟草稿', provider: 'COMFYUI', baseUrl: 'http://draft-service.test:8188' }
let wrapper: VueWrapper | undefined

function byTestId<T extends HTMLElement>(id: string) {
  const element = document.querySelector<T>(`[data-testid="${id}"]`)
  if (!element) throw new Error(`未找到 ${id}`)
  return element
}

function dispatchInput(id: string, value: string) {
  const input = byTestId<HTMLInputElement>(id)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function openWizard(mode: 'add' | 'edit') {
  wrapper = mount(NodeConnectionSelector, {
    attachTo: document.body,
    props: {
      nodeId: 'synthetic-node',
      nodeType: 'IMAGE_GENERATION',
      config: { connectionId: original.id, provider: 'COMFYUI', checkpoint: 'base.safetensors' },
    },
    global: { plugins: [createPinia(), i18n] },
  })
  await flushPromises()
  const opener = byTestId<HTMLButtonElement>(`${mode}-connection`)
  opener.focus()
  opener.click()
  await flushPromises()
  expect(document.activeElement).toBe(byTestId('connection-name'))
  return opener
}

async function dismiss(method: 'cancel' | 'escape') {
  const cancel = byTestId<HTMLButtonElement>('cancel-connection')
  cancel.focus()
  expect(document.activeElement).toBe(cancel)
  if (method === 'cancel') {
    cancel.click()
  } else {
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    cancel.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(true)
  }
  await flushPromises()
  expect(document.querySelector('[data-testid="connection-dialog"]')).toBeNull()
}

describe('连接保存期间关闭向导的键盘落点', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.getNodeConnections.mockResolvedValue({ connections: [original] })
    api.probeNodeConnection.mockResolvedValue(usable)
    api.probeSavedNodeConnection.mockResolvedValue(usable)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.replaceChildren()
  })

  it.each([
    ['add', 'cancel', 'resolved'],
    ['add', 'escape', 'rejected'],
    ['edit', 'cancel', 'rejected'],
    ['edit', 'escape', 'resolved'],
  ] as const)('%s 保存未决时通过 %s 关闭，%s 后不夺回焦点', async (mode, method, result) => {
    const saved: NodeConnection = { ...original, ...draft, provider: 'COMFYUI', id: mode === 'edit' ? original.id : 'new-synthetic' }
    let complete!: () => void
    const pending = new Promise<NodeConnection>((resolve, reject) => {
      complete = () => result === 'resolved' ? resolve(saved) : reject(new Error('模拟保存失败'))
    })
    const write = mode === 'edit' ? api.updateNodeConnection : api.createNodeConnection
    write.mockReturnValueOnce(pending)
    const opener = await openWizard(mode)
    dispatchInput('connection-name', draft.name)
    dispatchInput('connection-url', draft.baseUrl)
    byTestId<HTMLButtonElement>('test-connection').click()
    await flushPromises()
    const save = byTestId<HTMLButtonElement>('save-connection')
    expect(save.disabled).toBe(false)
    save.focus()
    save.click()
    await flushPromises()
    expect(write).toHaveBeenCalledTimes(1)
    expect(opener.disabled).toBe(true)

    await dismiss(method)
    const panel = byTestId('node-connection')
    expect(panel.getAttribute('aria-label')).toBeTruthy()
    expect(document.activeElement).toBe(panel)
    expect(opener.disabled).toBe(true)

    const select = byTestId<HTMLSelectElement>('connection-select')
    select.focus()
    expect(document.activeElement).toBe(select)
    complete()
    await flushPromises()
    expect(document.activeElement).toBe(select)
    expect(opener.disabled).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)
    expect(wrapper!.emitted('apply')).toBeUndefined()
    expect(byTestId('connection-save-status').getAttribute('role')).toBe(result === 'resolved' ? 'status' : 'alert')
  })

  it('关闭后保存仍未决时，手动选择连接不会离开下拉框', async () => {
    let resolveSave!: (value: NodeConnection) => void
    api.createNodeConnection.mockReturnValueOnce(new Promise<NodeConnection>(resolve => { resolveSave = resolve }))
    await openWizard('add')
    dispatchInput('connection-name', draft.name)
    dispatchInput('connection-url', draft.baseUrl)
    byTestId<HTMLButtonElement>('test-connection').click()
    await flushPromises()
    byTestId<HTMLButtonElement>('save-connection').click()
    await flushPromises()
    await dismiss('cancel')

    const select = byTestId<HTMLSelectElement>('connection-select')
    select.focus()
    select.value = ''
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(document.activeElement).toBe(select)
    const manualApply = [{ connectionId: undefined, provider: 'COMFYUI' }, 'synthetic-node']
    expect(wrapper!.emitted('apply')).toEqual([manualApply])

    resolveSave({ ...original, id: 'saved-after-manual-selection' })
    await flushPromises()
    expect(document.activeElement).toBe(select)
    expect(wrapper!.emitted('apply')).toEqual([manualApply])
  })

  it.each(['add', 'edit'] as const)('%s 向导未保存时依旧回到原打开按钮', async (mode) => {
    const opener = await openWizard(mode)
    await dismiss('escape')
    expect(document.activeElement).toBe(opener)
    expect(api.createNodeConnection).not.toHaveBeenCalled()
    expect(api.updateNodeConnection).not.toHaveBeenCalled()
  })
})
