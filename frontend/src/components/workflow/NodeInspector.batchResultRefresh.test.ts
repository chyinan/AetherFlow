// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { BatchRunResult } from '@/api/modules/runtime'
import NodeInspector from './NodeInspector.vue'

const mocks = vi.hoisted(() => ({ getBatchResults: vi.fn(), getNodeCatalog: vi.fn() }))
vi.mock('@/api/modules/runtime', async original => ({
  ...await original<typeof import('@/api/modules/runtime')>(), getBatchResults: mocks.getBatchResults,
}))
vi.mock('@/api/modules/node', async original => ({
  ...await original<typeof import('@/api/modules/node')>(), getNodeCatalog: mocks.getNodeCatalog,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let wrapper: VueWrapper | undefined
beforeEach(() => {
  mocks.getBatchResults.mockReset()
  mocks.getNodeCatalog.mockResolvedValue([])
  i18n.global.locale.value = 'zh-CN'
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

it('检查器收到同次运行的完成更新时，保留打开的逐项结果和键盘焦点', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'refreshArtifactsFromBackend').mockResolvedValue(undefined)
  const workflow = useWorkflowStore()
  workflow.resetToEmptyWorkflow()
  const node = workflow.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'loop')!, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)
  const runs = useRunStore()
  runs.currentRun = {
    id: 'run-421', workflowId: workflow.workflowId, workflowName: '批处理',
    backendInstanceId: 421, backendStatus: 'WAITING', status: 'paused',
    startedAt: '', durationMs: 0, trigger: 'manual', owner: '', traceId: '', queueName: '',
    progress: 0, nodeStates: [], artifactCount: 0, artifactNames: [],
  }
  function page(status: BatchRunResult['status'], text: string) {
    return { offset: 0, total: 1, results: [{ index: 0, status, variables: { text } }] }
  }
  let complete!: (value: ReturnType<typeof page>) => void
  const pending = new Promise<ReturnType<typeof page>>(resolve => { complete = resolve })
  mocks.getBatchResults.mockResolvedValueOnce(page('WAITING', '第一段')).mockReturnValueOnce(pending)
  wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n] } })
  const tab = wrapper.findAll('button').find(button => button.text() === i18n.global.t('workflow.inspector.lastRun'))!
  await tab.trigger('click')
  await flushPromises()

  const panel = wrapper.get('[data-test="loop-run-results"]')
  const detail = panel.get<HTMLDetailsElement>('details').element
  detail.open = true
  const summary = panel.get<HTMLElement>('summary').element
  summary.focus()
  expect(document.activeElement).toBe(summary)

  runs.patchCurrentRun({ backendStatus: 'SUCCESS', status: 'success', progress: 100 })
  await flushPromises()
  expect(mocks.getBatchResults.mock.calls).toEqual([[421, node.id, 0], [421, node.id, 0]])
  expect(panel.element.querySelector('details')).toBe(detail)
  expect(panel.text()).toContain('第一段')
  expect(document.activeElement).toBe(summary)

  complete(page('SUCCESS', '已完成的段落'))
  await flushPromises()
  expect(panel.get('details').element).toBe(detail)
  expect(detail.open).toBe(true)
  expect(document.activeElement).toBe(summary)
  expect(panel.get('summary').text()).toContain('SUCCESS')
  expect(panel.text()).toContain('已完成的段落')
})
