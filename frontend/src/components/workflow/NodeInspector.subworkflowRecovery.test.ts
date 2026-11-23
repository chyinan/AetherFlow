// @vitest-environment jsdom
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowGraphNode } from '@/types/workflow'
import NodeInspector from './NodeInspector.vue'

const definitionsPath = '/workflows/definitions'
const versionsPath = `${definitionsPath}/7/versions`
const definitions = [{ id: 7, name: '待复用工作流' }]
const versions = [{ definitionId: 7, version: 2 }]
const adapter = axiosInstance.defaults.adapter
let wrapper: ReturnType<typeof mount> | undefined
const requests: string[] = []
const replies = new Map<string, () => unknown>()

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}
function unavailable() { return new Error('受控服务暂不可用') }

function subworkflow(id: string, definitionId?: number): WorkflowGraphNode {
  return {
    id, type: 'workflow', position: { x: 0, y: 0 },
    data: {
      label: `子工作流 ${id}`, description: '', kind: 'subworkflow', status: 'idle',
      config: { definitionId: definitionId ?? 0, definitionVersion: definitionId ? 2 : 0, inputMappings: { text: 'request.text' } },
      inputs: [], outputs: [],
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  requests.length = 0; replies.clear()
  replies.set(definitionsPath, () => definitions)
  replies.set(versionsPath, () => versions)
  replies.set('/knowledge/datasets', () => ({ records: [], total: 0 }))
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? ''
    const method = config.method?.toUpperCase()
    requests.push(`${method} ${url}`)
    if (method !== 'GET' || (!replies.has(url) && url !== '/workflow/node/catalog')) {
      throw new Error(`非预期请求：${method} ${url}`)
    }
    const data = await replies.get(url)?.() ?? []
    if (data instanceof Error) throw new AxiosError(data.message, 'ERR_BAD_RESPONSE', config, undefined, {
      config, data: { code: 503, message: data.message }, status: 503, statusText: 'Service Unavailable', headers: {},
    })
    return { config, data: { code: 200, message: 'OK', data }, status: 200, statusText: 'OK', headers: {} }
  }
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = adapter
  vi.restoreAllMocks()
})

async function setup(definitionId?: number) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: NodeInspector }] })
  await router.push('/')
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(pinia), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(pinia), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore(pinia)
  store.resetToEmptyWorkflow()
  store.nodes = [subworkflow('a', definitionId), subworkflow('b')]
  const ui = useUiStore(pinia)
  ui.setSelectedNode('a')
  wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  return { store, ui }
}
function select(name: string) { return wrapper!.get<HTMLSelectElement>(`[data-config-field="${name}"]`) }
function retry(name: string) { return wrapper!.get<HTMLButtonElement>(`[data-action="retry-${name}"]`) }
function count(url: string) { return requests.filter(request => request === `GET ${url}`).length }
function expectReadOnly() { expect(requests.every(request => request.startsWith('GET '))).toBe(true) }
function graph(store: ReturnType<typeof useWorkflowStore>) {
  return JSON.stringify([store.nodes, store.edges, store.dirty, store.editRevision, store.historyPast, store.historyFuture])
}
const lists = [
  { name: 'definitions', path: definitionsPath, field: 'definitionId', result: definitions, status: '正在读取工作流列表', error: '无法读取工作流列表' },
  { name: 'versions', path: versionsPath, field: 'definitionVersion', result: versions, status: '正在读取版本', error: '无法读取版本' },
]

describe('子工作流读取恢复的键盘连续性', () => {
  it.each(lists)('$name 读取期间保留原重试焦点，去重后只把焦点交给恢复的下拉框', async list => {
    replies.set(list.path, unavailable)
    const { store } = await setup(7)
    await vi.waitFor(() => expect(wrapper!.text()).toContain(list.error))
    expect(count(list.path)).toBe(3)
    const before = graph(store)
    const response = deferred<typeof list.result>()
    replies.set(list.path, () => response.promise)
    const action = retry(list.name).element
    action.focus()
    action.click()
    await flushPromises()
    const during = {
      focused: document.activeElement === action,
      connected: action.isConnected,
      disabled: action.getAttribute('aria-disabled'),
      status: wrapper!.get('[role="status"]').text(),
    }
    action.click()
    await flushPromises()
    expect(count(list.path)).toBe(4)
    response.resolve(list.result)
    await flushPromises()
    expect({
      during,
      finalField: document.activeElement === select(list.field).element,
      selected: select(list.field).element.value,
      retryGone: !action.isConnected,
      unchanged: graph(store) === before,
    }).toEqual({
      during: { focused: true, connected: true, disabled: 'true', status: expect.stringContaining(list.status) },
      finalField: true,
      selected: list.name === 'definitions' ? '7' : '2',
      retryGone: true,
      unchanged: true,
    })
    expectReadOnly()
  })

  it.each(lists)('$name 再次失败仍可用同一键盘位置重试', async list => {
    replies.set(list.path, unavailable)
    const { store } = await setup(7)
    await vi.waitFor(() => expect(wrapper!.text()).toContain(list.error))
    const before = graph(store)
    const action = retry(list.name).element
    action.focus()
    action.click()
    await vi.waitFor(() => expect(count(list.path)).toBe(6))
    await vi.waitFor(() => expect(wrapper!.text()).toContain(list.error))
    expect({
      focused: document.activeElement === action,
      sameControl: retry(list.name).element === action,
      available: action.getAttribute('aria-disabled') !== 'true',
      unchanged: graph(store) === before,
    }).toEqual({ focused: true, sameControl: true, available: true, unchanged: true })
    expectReadOnly()
  })

  it('首次确认工作流列表为空时说明下一步，可重读直到有定义再正常选择固定版本', async () => {
    replies.set(definitionsPath, () => [])
    const { store } = await setup()
    const before = graph(store)
    expect(wrapper!.get('[role="status"]').text()).toContain('先保存要调用的工作流')
    const action = retry('definitions').element
    action.focus()
    action.click()
    await flushPromises()
    expect(retry('definitions').element).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(count(definitionsPath)).toBe(2)
    expect(graph(store)).toBe(before)
    replies.set(definitionsPath, () => definitions)
    action.click()
    await flushPromises()
    expect(document.activeElement).toBe(select('definitionId').element)
    expect(graph(store)).toBe(before)
    await select('definitionId').setValue('7')
    await flushPromises()
    await select('definitionVersion').setValue('2')
    expect(store.nodes[0]!.data.config).toMatchObject({ definitionId: 7, definitionVersion: 2, inputMappings: { text: 'request.text' } })
    expect(count(versionsPath)).toBe(1)
    expectReadOnly()
  })

  it('成功重读只交接仍在按钮上的焦点；用户已移到映射字段时保留其位置', async () => {
    replies.set(definitionsPath, unavailable)
    await setup(7)
    await vi.waitFor(() => expect(wrapper!.text()).toContain('无法读取工作流列表'))
    const response = deferred<typeof definitions>()
    replies.set(definitionsPath, () => response.promise)
    const action = retry('definitions').element
    action.focus()
    action.click()
    await flushPromises()
    const mapping = wrapper!.get<HTMLTextAreaElement>('[data-config-field="inputMappings"]').element
    mapping.focus()
    response.resolve(definitions)
    await flushPromises()
    expect(document.activeElement).toBe(mapping)
    expect(mapping.value).toContain('request.text')
  })

  it('旧节点取消注册后不能把焦点移动到新节点的下拉框', async () => {
    replies.set(versionsPath, unavailable)
    const { store, ui } = await setup(7)
    await vi.waitFor(() => expect(wrapper!.text()).toContain('无法读取版本'))
    const response = deferred<typeof versions>()
    replies.set(versionsPath, () => response.promise)
    const action = retry('versions').element
    action.focus()
    action.click()
    await flushPromises()
    ui.setSelectedNode('b')
    await flushPromises()
    const nextSelect = select('definitionId').element
    response.resolve(versions)
    await flushPromises()
    expect(document.activeElement).not.toBe(nextSelect)
    expect(store.nodes[1]!.data.config.definitionId).toBe(0)
    expect(select('definitionVersion').element.disabled).toBe(true)
  })
})
