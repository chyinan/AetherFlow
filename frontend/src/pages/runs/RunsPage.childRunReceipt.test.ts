// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client/apiClient', async original => ({
  ...await original<typeof import('@/api/client/apiClient')>(),
  apiClient: { get: transport.get },
}))
vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: { subscribeRun: () => () => {} },
}))

import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
let store: ReturnType<typeof useRunStore> | undefined

afterEach(() => {
  wrapper?.unmount()
  store?.stopRealtime()
  wrapper = store = undefined
  transport.get.mockReset()
  i18n.global.locale.value = 'zh-CN'
})

const fixtures = [
  { id: 10, workflowId: 'workflow-10', workflowName: '父流程', status: 'WAITING', nodes: [] },
  { id: 11, workflowId: 'workflow-11', workflowName: '已失败的父流程', status: 'FAILED', nodes: [] },
  { id: 20, workflowId: 'workflow-20', workflowName: '已成功的子流程', status: 'SUCCESS', nodes: [] },
  { id: 30, workflowId: 'workflow-30', workflowName: '已失败的子流程', status: 'FAILED', nodes: [] },
]

async function openParent(id = 10) {
  transport.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { items: fixtures.slice(0, 2), total: 2 }
    const detail = fixtures.find(run => url === `/workflow-instances/${run.id}`)
    if (detail) return detail
    if (url === '/workflows/instances/10/children') return [
      { parentNodeId: 'pending-call', childInstanceId: 20, definitionId: 20, definitionVersion: 1, status: 'WAITING' },
    ]
    if (url === '/workflows/instances/11/children') return [
      { parentNodeId: 'processed-call', childInstanceId: 30, definitionId: 30, definitionVersion: 1, status: 'COMPLETED' },
    ]
    if (url.endsWith('/logs') || url.startsWith('/workflow/runtime/events/')) return []
    if (url.startsWith('/workflow/runtime/observability/')) {
      const id = url.split('/').at(-1)
      const state = fixtures.find(run => String(run.id) === id)?.status
      return { workflowId: id, runtimeState: state }
    }
    throw new Error(`未配置测试响应：${url}`)
  })
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', component: { template: '<div />' } },
  ] })
  await router.push(`/runs/run-${id}?pageSize=50`)
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: { LogStream: true } } })
  store = useRunStore(pinia)
  await flushPromises()
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click')
  await flushPromises()
  return { router, wrapper, store }
}

const childRunLink = '[data-testid="child-run-link"]'
const detailRegion = '[data-testid="run-detail-region"]'
function callStatus(link: Element) {
  return link.parentElement?.querySelector('span')?.textContent?.trim()
}

it.each([
  ['zh-CN', '调用尚未处理完成', '成功'],
  ['en-US', 'Call processing pending', 'success'],
  ['ja-JP', '呼び出しの処理が未完了', '成功'],
] as const)('%s 子运行已成功时，父流程未处理完成的调用不冒充子运行状态', async (locale, pending, success) => {
  i18n.global.locale.value = locale
  const { router, wrapper, store } = await openParent()
  const original = router.currentRoute.value.fullPath
  const link = wrapper.get(childRunLink)
  const pendingStatus = callStatus(link.element)

  expect(link.attributes('href')).toBe('/runs/run-20?pageSize=50')
  await link.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-20?pageSize=50')
  expect(transport.get).toHaveBeenCalledWith('/workflow-instances/20', { source: 'workflow' })
  expect(store.currentRun?.backendStatus).toBe('SUCCESS')
  expect(wrapper.get(detailRegion).get('h2').text()).toBe('已成功的子流程')
  expect(wrapper.get(detailRegion).get('h2 + span').text()).toBe(success)
  expect(wrapper.find(childRunLink).exists()).toBe(false)

  router.back()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(original)
  expect(store.currentRun?.id).toBe('run-10')
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click')
  await flushPromises()
  expect(callStatus(wrapper.get(childRunLink).element)).toBe(pendingStatus)
  expect(pendingStatus).toBe(pending)
})

it('父流程的已处理调用仍可进入一个失败的子运行', async () => {
  const { router, wrapper, store } = await openParent(11)
  const link = wrapper.get(childRunLink)
  expect(callStatus(link.element)).toBe('调用已处理')
  await link.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-30?pageSize=50')
  expect(store.currentRun?.backendStatus).toBe('FAILED')
  expect(wrapper.get(detailRegion).get('h2 + span').text()).toBe('失败')
})
