// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { BatchRunResult } from '@/api/modules/runtime'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'

const originalAdapter = axiosInstance.defaults.adapter
let wrapper: VueWrapper | undefined
let rows: BatchRunResult[] = []
let status: 'FAILED' | 'SUCCESS' | 'WAITING' = 'FAILED'
let responseWait: Promise<void> | undefined
const requests: string[] = []

beforeEach(() => {
  rows = []
  status = 'FAILED'
  responseWait = undefined
  requests.length = 0
  i18n.global.locale.value = 'zh-CN'
  axiosInstance.defaults.adapter = async config => {
    const url = config.url ?? ''
    if (config.method !== 'get') throw new Error(`非预期写入：${url}`)
    let data: unknown
    if (url.includes('/batch-results?')) {
      requests.push(url)
      await responseWait
      const params = new URL(url, 'https://fixture.invalid').searchParams
      const offset = Number(params.get('offset'))
      data = { nodeId: params.get('nodeId'), status, offset, total: rows.length, results: rows.slice(offset, offset + Number(params.get('limit'))) }
    } else if (url === '/workflow/node-types' || url === '/workflow/nodes/catalog') data = []
    else throw new Error(`非预期读取：${url}`)
    return { config, data: JSON.stringify({ code: 0, success: true, data }), status: 200, statusText: 'OK', headers: {} }
  }
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
  i18n.global.locale.value = 'zh-CN'
  vi.restoreAllMocks()
})

async function open(kind: 'iteration' | 'loop' = 'iteration') {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'refreshArtifactsFromBackend').mockResolvedValue(undefined)
  const workflow = useWorkflowStore()
  workflow.resetToEmptyWorkflow()
  const node = workflow.addNodeFromTemplate(nodeTemplates.find(template => template.kind === kind)!, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)
  useRunStore().currentRun = {
    id: 'run-421', workflowId: workflow.workflowId, workflowName: '片段批处理',
    backendInstanceId: 421, backendStatus: status, status: status === 'FAILED' ? 'failed' : status === 'SUCCESS' ? 'success' : 'paused',
    startedAt: '', durationMs: 0, trigger: 'manual', owner: '', traceId: '', queueName: '',
    progress: 0, nodeStates: [], artifactCount: 0, artifactNames: [],
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  const tab = wrapper.findAll('button').find(button => button.text() === i18n.global.t('workflow.inspector.lastRun'))!
  await tab.trigger('click')
  await flushPromises()
  expect(requests).toEqual([`/workflow/runtime/instances/421/batch-results?nodeId=${encodeURIComponent(node.id)}&offset=0&limit=50`])
  return wrapper.get('[data-test="loop-run-results"]')
}

function unfold(panel: Awaited<ReturnType<typeof open>>, index = 0) {
  const row = panel.findAll<HTMLDetailsElement>('details')[index]!
  row.element.open = true
  return row
}

it('真实检查器展开失败项时，显示后端返回的输入及其独立的空输出，便于识别失败片段', async () => {
  // NestedWorkflowRunner 对第一步就失败的条目也同时返回 item、空 variables 和 error。
  const item = { segment: '第二段采访', duration: 17 }
  rows = [
    { index: 0, item: { segment: '第一段采访' }, status: 'SUCCESS', variables: { summary: '摘要' } },
    { index: 1, item, status: 'FAILED', variables: {}, error: '模型暂时不可用' },
  ]
  const panel = await open()
  const failed = unfold(panel, 1)
  expect(failed.get('summary').text()).toBe('第 2 项 · FAILED')
  expect(failed.text()).toContain('模型暂时不可用')
  expect(failed.findAll('pre').map(pre => pre.element.textContent)).toEqual([JSON.stringify(item, null, 2), '{}'])
  expect(failed.text()).toContain('输入项')
  expect(failed.text()).toContain('输出变量')
})

it('普通结构化输入及输出均保留；刷新本项不会重复输出、收起条目或丢失其摘要焦点', async () => {
  status = 'WAITING'
  const item = ['动态片段', { index: 5 }]
  rows = [{ index: 0, item, status: 'WAITING', variables: { text: '第一稿' } }]
  const panel = await open()
  const row = unfold(panel)
  const summary = row.get<HTMLElement>('summary')
  summary.element.focus()
  expect(row.findAll('pre').map(pre => pre.element.textContent)).toEqual([
    JSON.stringify(item, null, 2), JSON.stringify({ text: '第一稿' }, null, 2),
  ])

  let complete!: () => void
  responseWait = new Promise<void>(resolve => { complete = resolve })
  await panel.get('button').trigger('click')
  await flushPromises()
  expect(panel.text()).toContain('显示上次读取的结果')
  status = 'SUCCESS'
  rows = [{ index: 0, item, status, variables: { text: '最终稿' } }]
  complete()
  await flushPromises()
  expect(requests).toHaveLength(2)
  expect(panel.get('details').element).toBe(row.element)
  expect(row.element.open).toBe(true)
  expect(document.activeElement).toBe(summary.element)
  expect(row.findAll('pre').map(pre => pre.element.textContent)).toEqual([
    JSON.stringify(item, null, 2), JSON.stringify({ text: '最终稿' }, null, 2),
  ])
})

it('合法空值、布尔、数值和空字符串都作为独立批次输入显示', async () => {
  status = 'SUCCESS'
  const items = [null, false, 0, '']
  rows = items.map((item, index) => ({ index, item, status: 'SUCCESS', variables: {} }))
  const panel = await open()
  expect(items.map((_item, index) => unfold(panel, index).findAll('pre').map(pre => pre.element.textContent)))
    .toEqual(items.map(item => [JSON.stringify(item), '{}']))
})

it('没有 input 字段的循环轮次只显示原有变量，不伪造输入', async () => {
  status = 'SUCCESS'
  rows = [{ index: 0, status, variables: { state: 2 } }]
  const row = unfold(await open('loop'))
  expect(row.findAll('pre').map(pre => pre.element.textContent)).toEqual([JSON.stringify({ state: 2 }, null, 2)])
  expect(row.text()).not.toContain('输入项')
})

it('仅有 item 的旧记录仍只显示一份原值；英文和日文标签随语言切换', async () => {
  rows = [{ index: 0, item: '旧批次输入', status }]
  const row = unfold(await open())
  expect(row.findAll('pre').map(pre => pre.element.textContent)).toEqual(['"旧批次输入"'])
  i18n.global.locale.value = 'en-US'
  await flushPromises()
  expect(row.text()).toContain('Input item')
  expect(row.text()).not.toContain('Output variables')
  i18n.global.locale.value = 'ja-JP'
  await flushPromises()
  expect(row.text()).toContain('入力項目')
  expect(row.findAll('pre')).toHaveLength(1)
})
