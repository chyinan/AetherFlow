// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WhisperEnvironment } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), getWhisperEnvironment: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(),
  workflowApi: { getWorkflow: api.getWorkflow },
}))
vi.mock('@/api/modules/nodeConnections', async (original) => ({
  ...await original<typeof import('@/api/modules/nodeConnections')>(),
  getWhisperEnvironment: api.getWhisperEnvironment,
}))

const environment: WhisperEnvironment = {
  status: 'usable', enabled: true, model: 'small', device: 'cpu', computeType: 'int8',
  loadedModel: 'small', dependencyAvailable: true, ffmpegAvailable: true,
  detectedFrom: 'backend', restartRequired: false, message: '模拟环境就绪',
}
let wrapper: VueWrapper | undefined

function dialog() { return document.body.querySelector<HTMLElement>('[aria-modal="true"]') }

function element<T extends HTMLElement>(selector: string) {
  const found = document.body.querySelector<T>(selector)
  if (!found) throw new Error(`未找到控件 ${selector}`)
  return found
}

function action(name: string) {
  return element<HTMLButtonElement>(`[data-action="${name}-whisper-environment"]`)
}

function press(key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  document.activeElement?.dispatchEvent(event)
  return event
}

async function setup(redo = false) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'loadFiles').mockResolvedValue(undefined)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined)
  vi.spyOn(useRunStore(), 'loadRuns').mockResolvedValue(undefined)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/workflows/:id', component: WorkflowPage }] })
  await router.push('/workflows/101')
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n],
    stubs: { WorkflowCanvas: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  const node = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'whisper')!, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)
  const language = () => store.nodes.find(item => item.id === node.id)?.data.config.language
  const original = language()
  store.updateNodeConfig(node.id, 'language', 'ja')
  if (redo) expect(store.undo()).toBe(true)
  await flushPromises()
  expect(language()).toBe(redo ? original : 'ja')
  const opener = action('open')
  opener.focus()
  opener.click()
  await flushPromises()
  expect(dialog()?.parentElement?.parentElement).toBe(document.body)
  expect(document.activeElement).toBe(dialog())
  return { store, language, original, opener }
}

beforeEach(() => {
  vi.resetAllMocks()
  api.getWhisperEnvironment.mockResolvedValue(environment)
  api.getWorkflow.mockImplementation(async (id: string): Promise<WorkflowDefinition> => ({
    id, backendDefinitionId: Number(id), backendVersion: 1, name: '语音工作流', nodes: [], edges: [],
  }))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('Whisper 环境向导隔离画布撤销和重做', () => {
  it.each([
    ['初始弹窗', 'z', { ctrlKey: true }, false],
    ['下一步按钮', 'Z', { metaKey: true }, false],
    ['下一步按钮', 'Z', { metaKey: true, shiftKey: true }, true],
    ['下一步按钮', 'y', { ctrlKey: true }, true],
    ['下一步按钮', 'Y', { metaKey: true, shiftKey: true }, true],
  ] as const)('%s 不把 %s 快捷键传给画布', async (target, key, modifiers, redo) => {
    const { store, language, original } = await setup(redo)
    const previous = [store.historyPast.length, store.historyFuture.length, store.editRevision]
    if (target === '下一步按钮') {
      element<HTMLInputElement>('[data-deployment="compose"]').click()
      await flushPromises()
      action('next').focus()
      expect(document.activeElement).toBe(action('next'))
    }
    const event = press(key, modifiers)
    await flushPromises()
    expect.soft(language()).toBe(redo ? original : 'ja')
    expect.soft([store.historyPast.length, store.historyFuture.length, store.editRevision]).toEqual(previous)
    expect.soft(event.defaultPrevented).toBe(false)
    expect(dialog()).not.toBeNull()
    if (target === '下一步按钮') {
      expect(element<HTMLInputElement>('[data-deployment="compose"]').checked).toBe(true)
      expect(document.activeElement).toBe(action('next'))
    }
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
  })

  it('文字输入保留默认行为，其他按键照常冒泡；Esc 关闭后画布快捷键恢复', async () => {
    const { language, original, opener } = await setup()
    element<HTMLInputElement>('[data-deployment="host"]').click()
    await flushPromises()
    action('next').click(); await flushPromises()
    action('next').click(); await flushPromises()
    const input = element<HTMLInputElement>('[data-field="suggested-model"]')
    input.value = 'medium'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
    expect(press('z', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(press('Z', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false)
    expect(language()).toBe('ja')
    expect(input.value).toBe('medium')

    const unrelated = vi.fn()
    window.addEventListener('keydown', unrelated)
    try {
      const other = press('k', { ctrlKey: true })
      expect(unrelated).toHaveBeenCalledExactlyOnceWith(other)
      expect(other.defaultPrevented).toBe(false)
    } finally {
      window.removeEventListener('keydown', unrelated)
    }

    expect(press('Escape').defaultPrevented).toBe(true)
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(press('z', { ctrlKey: true }).defaultPrevented).toBe(true)
    await flushPromises()
    expect(language()).toBe(original)
    expect(press('y', { ctrlKey: true }).defaultPrevented).toBe(true)
    await flushPromises()
    expect(language()).toBe('ja')
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
  })
})
