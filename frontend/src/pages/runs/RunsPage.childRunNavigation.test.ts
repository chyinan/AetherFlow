// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: { subscribeRun: () => () => {} },
}))

const origin = '/runs/run-101?q=Parent&workflowId=42&status=FAILED&page=3&pageSize=50&tag=a&tag=b'
const query = origin.slice(origin.indexOf('?'))
const originalAdapter = axiosInstance.defaults.adapter
const runs = [
  { id: 101, definitionId: 42, workflowName: 'Parent', status: 'FAILED' },
  { id: 102, definitionId: 43, workflowName: 'Child', status: 'SUCCESS' },
  { id: 103, definitionId: 42, workflowName: 'Original parent', status: 'FAILED' },
].map(run => ({ ...run, nodes: [] }))
let wrapper: ReturnType<typeof mount> | undefined
let store: ReturnType<typeof useRunStore> | undefined

afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  store?.stopRealtime(); store = undefined
  axiosInstance.defaults.adapter = originalAdapter
  vi.unstubAllGlobals()
})

async function open(wide = false) {
  const requests: string[] = []
  axiosInstance.defaults.adapter = async config => {
    const url = config.url!
    if (config.method !== 'get') throw new Error(`非预期写入：${config.method} ${url}`)
    requests.push(url)
    let data: unknown
    if (url === '/workflow-instances') data = { items: [runs[0]], total: 150 }
    else if (url === '/workflows/instances/101/children') data = [{
      parentNodeId: 'child-workflow', childInstanceId: 102, definitionId: 43, definitionVersion: 1,
      status: 'COMPLETED', reused: true, sourceParentInstanceId: 103,
    }]
    else if (url.endsWith('/logs') || url.startsWith('/workflow/runtime/events/')) data = []
    else {
      const run = runs.find(item => String(item.id) === url.split('/').at(-1))
      if (!run) throw new Error(`未配置响应：${url}`)
      data = url.startsWith('/workflow/runtime/observability/')
        ? { workflowId: String(run.id), runtimeState: run.status }
        : run
    }
    return { config, data, status: 200, statusText: 'OK', headers: {} }
  }
  vi.stubGlobal('matchMedia', () => ({ matches: wide }))
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
  ] })
  await router.push(origin)
  const pinia = createPinia()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  store = useRunStore(pinia)
  await flushPromises()
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click')
  await flushPromises()
  const region = wrapper.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  region.element.scrollIntoView = scroll
  const input = wrapper.get<HTMLInputElement>('[data-testid="history-search"]')
  return { router, region, scroll, input, requests, link: (id = 'child-run-link') => wrapper!.get<HTMLAnchorElement>(`[data-testid="${id}"]`) }
}

const pause = () => {
  let resume!: () => void
  const promise = new Promise<void>(resolve => { resume = resolve })
  return { promise, resume }
}

it.each([
  ['child-run-link', 102, false],
  ['child-run-link', 102, true],
  ['source-run-link', 103, false],
] as const)('打开已聚焦的 %s 后交接到运行 %s（宽屏=%s）', async (testId, id, wide) => {
  const { router, region, scroll, requests, link, input } = await open(wide)
  const anchor = link(testId)
  expect(anchor.attributes('href')).toBe(`/runs/run-${id}${query}`)
  anchor.element.focus()
  expect(document.activeElement).toBe(anchor.element)
  anchor.element.click()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(`/runs/run-${id}${query}`)
  expect(store?.currentRun?.id).toBe(`run-${id}`)
  expect(anchor.element.isConnected).toBe(false)
  expect(requests.filter(url => url === '/workflow-instances')).toHaveLength(1)
  expect(region.attributes('aria-label')).toContain(`run-${id}`)
  expect(document.activeElement).toBe(region.element)
  if (wide) expect(scroll).not.toHaveBeenCalled()
  else expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start' })

  scroll.mockClear()
  input.element.focus()
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(origin)
  router.forward()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(`/runs/run-${id}${query}`)
  expect(document.activeElement).toBe(input.element)
  expect(scroll).not.toHaveBeenCalled()
})

it('异步打开期间较新输入意图保留其焦点，也不定位到目标区域', async () => {
  const { router, scroll, input, link } = await open()
  const waiting = pause()
  router.beforeEach(() => waiting.promise)
  const anchor = link()
  anchor.element.focus()
  anchor.element.click()
  input.element.focus()
  await input.setValue('尚未应用的查询')
  waiting.resume()
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-102')
  expect(document.activeElement).toBe(input.element)
  expect(input.element.value).toBe('尚未应用的查询')
  expect(scroll).not.toHaveBeenCalled()
})

it('守卫拒绝后留在原记录和链接，不触发交接', async () => {
  const { router, scroll, link } = await open()
  router.beforeEach(() => false)
  const anchor = link()
  anchor.element.focus()
  anchor.element.click()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(origin)
  expect(document.activeElement).toBe(anchor.element)
  expect(scroll).not.toHaveBeenCalled()
})

it('Ctrl 点击保留原生锚点行为，无焦点链接的普通点击不抢前一个控件的焦点', async () => {
  const { router, scroll, input, link } = await open()
  const anchor = link()
  anchor.element.focus()
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
  let prevented: boolean | undefined
  // 在 Vue Router 之后观察默认行为，然后停止 jsdom 尝试非当前页导航。
  const afterLink = (event: Event) => { prevented = event.defaultPrevented; event.preventDefault() }
  anchor.element.addEventListener('click', afterLink, { once: true })
  anchor.element.dispatchEvent(event)
  await flushPromises()
  expect(prevented).toBe(false)
  expect(router.currentRoute.value.fullPath).toBe(origin)
  expect(document.activeElement).toBe(anchor.element)
  expect(scroll).not.toHaveBeenCalled()

  input.element.focus()
  anchor.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-102')
  expect(document.activeElement).toBe(input.element)
  expect(scroll).not.toHaveBeenCalled()
})
