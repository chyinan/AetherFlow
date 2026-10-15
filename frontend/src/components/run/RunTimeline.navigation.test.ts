// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import RunTimeline from './RunTimeline.vue'
import type { RunNodeState } from '@/types/run'

let wrapper: ReturnType<typeof mount> | undefined
const failed: RunNodeState = { nodeId: 'summary-node', label: '摘要', status: 'failed' }
beforeEach(() => { i18n.global.locale.value = 'zh-CN' })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; i18n.global.locale.value = 'zh-CN' })

async function setup(nodes = [failed]) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs/:id', component: { template: '<div />' } },
    { path: '/workflows/:id', component: { template: '<div />' } },
  ] })
  await router.push('/runs/run-12?status=FAILED&page=3&pageSize=50#detail'); await router.isReady()
  wrapper = mount(RunTimeline, { props: {
    nodes, runId: 'run-12', workflowId: 'workflow-9', returnLocation: router.currentRoute.value.fullPath, canRerun: true,
  }, global: { plugins: [router, i18n] } })
  return { router }
}

it('失败节点可编辑且保留重跑入口，点击只导航并保留来源历史上下文', async () => {
  const { router } = await setup([failed, { nodeId: 'done', label: '完成', status: 'success' }])
  const link = wrapper!.get('[data-testid="edit-failed-node"]')
  expect(wrapper!.findAll('[data-testid="edit-failed-node"]')).toHaveLength(1)
  expect(link.element.tagName).toBe('A')
  expect(link.text()).toBe('编辑此节点')
  await wrapper!.get('button').trigger('click')
  expect(wrapper!.emitted('rerun')).toEqual([[failed]])
  await link.trigger('click'); await link.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/workflow-9')
  expect(router.currentRoute.value.query).toEqual({
    nodeId: 'summary-node', sourceRunId: 'run-12', runReturnLocation: '/runs/run-12?status=FAILED&page=3&pageSize=50#detail',
  })
  expect(wrapper!.emitted('rerun')).toHaveLength(1)
})

it('后端不能重跑时仍可查看当前节点配置，不改变重跑门禁', async () => {
  await setup()
  await wrapper!.setProps({ canRerun: false })
  expect(wrapper!.find('[data-testid="edit-failed-node"]').exists()).toBe(true)
  expect(wrapper!.find('button').exists()).toBe(false)
})

it('循环子记录保留原重跑提示，不猜循环根或同名节点', async () => {
  await setup([{ ...failed, nodeId: 'loop/iteration-0/summary-node' }])
  expect(wrapper!.find('[data-testid="edit-failed-node"]').exists()).toBe(false)
  expect(wrapper!.find('button').exists()).toBe(false)
  expect(wrapper!.text()).toContain('暂不能直接定位到画布节点')
  expect(wrapper!.text()).toContain('所属循环根节点重跑')
})

it('来源不完整不展示误导链接，恢复和更新运行后只使用最新来源', async () => {
  const { router } = await setup()
  await wrapper!.setProps({ workflowId: undefined })
  expect(wrapper!.find('[data-testid="edit-failed-node"]').exists()).toBe(false)
  expect(wrapper!.get('[data-testid="edit-node-unavailable"]').text()).toContain('运行来源不完整')
  await wrapper!.setProps({ workflowId: 'workflow-10', runId: 'run-13', returnLocation: '/runs/run-13?page=2' })
  await wrapper!.get('[data-testid="edit-failed-node"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/workflow-10')
  expect(router.currentRoute.value.query.sourceRunId).toBe('run-13')
  expect(router.currentRoute.value.query.runReturnLocation).toBe('/runs/run-13?page=2')
  await wrapper!.setProps({ nodes: [] })
  expect(wrapper!.find('[data-testid="edit-failed-node"]').exists()).toBe(false)
})

it.each([
  ['zh-CN', '编辑此节点'], ['en-US', 'Edit this node'], ['ja-JP', 'このノードを編集'],
] as const)('编辑入口支持 %s 并响应语言切换', async (locale, text) => {
  await setup()
  i18n.global.locale.value = locale; await flushPromises()
  expect(wrapper!.get('[data-testid="edit-failed-node"]').text()).toBe(text)
})
