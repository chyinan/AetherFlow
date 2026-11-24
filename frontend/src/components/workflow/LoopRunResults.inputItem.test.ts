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
let batchReadFailed = false
const requests: string[] = []

beforeEach(() => {
  rows = []
  status = 'FAILED'
  responseWait = undefined
  batchReadFailed = false
  requests.length = 0
  i18n.global.locale.value = 'zh-CN'
  axiosInstance.defaults.adapter = async config => {
    const url = config.url ?? ''
    if (config.method !== 'get') throw new Error(`非预期写入：${url}`)
    let data: unknown
    if (url.includes('/batch-results?')) {
      requests.push(url)
      await responseWait
      if (batchReadFailed) {
        return { config, data: { code: 503, message: '测试：批次读取暂不可用' }, status: 200, statusText: 'OK', headers: {} }
      }
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


const batchJourney = [
  {
    locale: 'en-US', title: 'Item results', refresh: 'Refresh', previous: 'Previous page', next: 'Next page',
    loading: 'Loading…', error: 'Could not load item results. Please retry.',
    refreshing: 'Refreshing. Showing the last loaded results…', previousResults: 'Showing the last loaded results.',
    first: 'Item 1 · SUCCESS', last: 'Item 51 · FAILED',
  },
  {
    locale: 'ja-JP', title: '項目別の結果', refresh: '更新', previous: '前のページ', next: '次のページ',
    loading: '読み込み中…', error: '項目別の結果を読み込めませんでした。再試行してください。',
    refreshing: '更新中です。前回読み込んだ結果を表示しています…', previousResults: '前回読み込んだ結果を表示しています。',
    first: '1 件目 · SUCCESS', last: '51 件目 · FAILED',
  },
] as const

it.each(batchJourney)('$locale：分页、失败重试和旧结果反馈均使用检查器所选语言', async labels => {
  i18n.global.locale.value = labels.locale
  status = 'FAILED'
  const originalError = 'Provider timed out on interview 51'
  rows = Array.from({ length: 51 }, (_, index) => ({
    index,
    item: `Interview ${index + 1}`,
    status: index === 50 ? 'FAILED' : 'SUCCESS',
    variables: { text: `原始输出 ${index + 1}` },
    ...(index === 50 ? { error: originalError } : {}),
  }))
  const panel = await open()
  const getButton = (label: string) => panel.findAll<HTMLButtonElement>('button').find(button => button.text() === label)!
  expect(panel.get('h3').text()).toBe(`${labels.title} · 51`)
  expect(panel.findAll('summary')[0]?.text()).toBe(labels.first)
  expect(getButton(labels.previous).element.disabled).toBe(true)
  expect(getButton(labels.next).element.disabled).toBe(false)

  let finishTurn!: () => void
  responseWait = new Promise<void>(resolve => { finishTurn = resolve })
  await getButton(labels.next).trigger('click')
  expect(panel.get('[role="status"]').text()).toBe(labels.loading)
  batchReadFailed = true
  finishTurn()
  await flushPromises()
  expect(panel.get('[role="alert"]').text()).toBe(labels.error)
  expect(getButton(labels.previous).element.disabled).toBe(false)
  expect(panel.find('summary').exists()).toBe(false)

  batchReadFailed = false
  responseWait = undefined
  await getButton(labels.refresh).trigger('click')
  await flushPromises()
  expect(panel.find('[role="alert"]').exists()).toBe(false)
  const detail = unfold(panel)
  expect(detail.get('summary').text()).toBe(labels.last)
  expect(detail.text()).toContain(originalError)
  expect(detail.get('pre').text()).toBe('"Interview 51"')
  expect(detail.findAll('pre')[1]?.text()).toContain('原始输出 51')
  expect(requests.map(url => new URL(url, 'https://fixture.invalid').searchParams.get('offset')))
    .toEqual(['0', '50', '50'])

  let finishRefresh!: () => void
  responseWait = new Promise<void>(resolve => { finishRefresh = resolve })
  await getButton(labels.refresh).trigger('click')
  expect(panel.get('[role="status"]').text()).toBe(labels.refreshing)
  expect(panel.get('details').element).toBe(detail.element)
  batchReadFailed = true
  finishRefresh()
  await flushPromises()
  expect(panel.get('[role="alert"]').text()).toContain(labels.error)
  expect(panel.get('[role="alert"]').text()).toContain(labels.previousResults)

  const other = batchJourney.find(next => next.locale !== labels.locale)!
  i18n.global.locale.value = other.locale
  await flushPromises()
  expect(panel.get('[role="alert"]').text()).toContain(other.error)
  expect(panel.get('[role="alert"]').text()).toContain(other.previousResults)
  expect(panel.get('details').element).toBe(detail.element)
  expect(detail.element.open).toBe(true)
  expect(detail.text()).toContain(originalError)
  expect(requests).toHaveLength(4)
})
