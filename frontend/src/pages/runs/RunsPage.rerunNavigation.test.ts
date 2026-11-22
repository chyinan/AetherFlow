// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import type { InternalAxiosRequestConfig } from 'axios'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, isNavigationFailure, NavigationFailureType, RouterView } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import { observeWorkflowNavigation } from '@/utils/workflowNavigation'
import RunsPage from './RunsPage.vue'

vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: { subscribeRun: () => () => {} },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const sourceRun = {
  id: 1, workflowId: 'wf-1', workflowName: '原失败运行', status: 'FAILED',
  nodes: [{ nodeId: 'failure', label: '失败节点', status: 'FAILED' }],
}
const childRun = { id: 33, workflowId: 'wf-1', workflowName: '派生运行', status: 'RUNNING', nodes: [] }
const rerunPath = '/workflow-instances/1/nodes/failure/rerun'
const sourcePath = '/runs/run-1?status=FAILED&page=2'
const childPath = '/runs/run-33?status=FAILED&page=2'
const changedSearchPath = sourcePath + '&q=latest'
const originalAdapter = axiosInstance.defaults.adapter
const files = { template: '<main data-testid="files-page" />' }
let wrapper: ReturnType<typeof mount> | undefined
let runStore: ReturnType<typeof useRunStore> | undefined

afterEach(() => {
  wrapper?.unmount()
  runStore?.stopRealtime()
  wrapper = runStore = undefined
  axiosInstance.defaults.adapter = originalAdapter
})

async function openAndConfirm(loadFiles: () => Promise<typeof files> = async () => files) {
  const post = deferred<typeof childRun>()
  const bodies: unknown[] = []
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const path = config.url ?? ''
    let data: unknown
    if (path === rerunPath && config.method === 'post') {
      bodies.push(JSON.parse(String(config.data)))
      data = await post.promise
    } else if (path === rerunPath + '/preview') {
      data = {
        sourceInstanceId: 1, nodeId: 'failure', revision: 'revision-1', eligible: true,
        invalidatedNodes: [{ nodeId: 'failure', label: '失败节点' }], preservedNodes: [], blockers: [],
      }
    } else if (path === '/workflow-instances') {
      data = { items: [sourceRun], total: 40 }
    } else if (path === '/workflow-instances/1') {
      data = sourceRun
    } else if (path === '/workflow-instances/33') {
      data = childRun
    } else if (path.startsWith('/workflow/runtime/observability/')) {
      const run = path.endsWith('/33') ? childRun : sourceRun
      data = { workflowId: run.workflowId, runtimeState: run.status }
    } else if (path.endsWith('/logs') || path.endsWith('/children') || path.startsWith('/workflow/runtime/events/')) {
      data = []
    } else {
      throw new Error(`非预期请求：${config.method} ${path}`)
    }
    return { config, status: 200, statusText: 'OK', data: { code: 200, message: '成功', data }, headers: {} }
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<main />' } },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', component: loadFiles },
  ] })
  observeWorkflowNavigation(router)
  await router.push('/')
  await router.push(sourcePath)
  const pinia = createPinia()
  runStore = useRunStore(pinia)
  const view = wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  const open = view.get('[data-testid="run-detail-region"]').findAll('button')
    .find(button => button.text() === i18n.global.t('runs.rerunNode'))
  expect(open).toBeDefined()
  await open!.trigger('click')
  await flushPromises()
  const confirm = document.body.querySelector<HTMLButtonElement>('[data-action="rerun"]')!
  expect(confirm.disabled).toBe(false)
  confirm.click()
  await flushPromises()
  expect(bodies).toEqual([{ expectedRevision: 'revision-1' }])
  return { post, bodies, router, view }
}

it('新页面组件仍在加载时，成功回执不取消该次导航', async () => {
  const load = deferred<typeof files>()
  const { post, bodies, router, view } = await openAndConfirm(() => load.promise)
  const leaving = router.push('/files')
  await flushPromises()
  post.resolve(childRun)
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(sourcePath)
  load.resolve(files)
  expect(await leaving).toBeUndefined()
  expect(router.currentRoute.value.fullPath).toBe('/files')
  await flushPromises()
  expect(view.find('[data-testid="files-page"]').exists()).toBe(true)
  expect(bodies).toHaveLength(1)
})

it('成功回执不覆盖已经提交的同一失败运行的筛选导航', async () => {
  const { post, router } = await openAndConfirm()
  await router.push(changedSearchPath)
  post.resolve(childRun)
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(changedSearchPath)
  expect(runStore?.currentRun?.id).toBe('run-1')
})

it('返回与回执同一轮发生时，保留返回，不把原历史条目替换成派生运行', async () => {
  const { post, bodies, router } = await openAndConfirm()
  const gate = deferred<boolean>()
  router.beforeResolve(to => to.path === '/' ? gate.promise : true)
  post.resolve(childRun)
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(sourcePath)
  gate.resolve(true)
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/')
  router.forward()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(sourcePath)
  expect(bodies).toHaveLength(1)
})

it('较新的导航真的取消后，原页面才打开已确认的派生运行', async () => {
  const { post, bodies, router, view } = await openAndConfirm()
  const gate = deferred<boolean>()
  router.beforeResolve(to => to.path === '/files' ? gate.promise : true)
  const attempt = router.push('/files')
  await flushPromises()
  post.resolve(childRun)
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(sourcePath)
  gate.resolve(false)
  expect(isNavigationFailure(await attempt, NavigationFailureType.aborted)).toBe(true)
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(childPath)
  expect(view.get('[data-testid="run-detail-region"] h2').text()).toBe(childRun.workflowName)
  expect(runStore?.currentRun?.backendStatus).toBe('RUNNING')
  expect(bodies).toHaveLength(1)
})

it.each([false, true])('无待决导航时保持成功或关闭后的原有行为（close=%s）', async close => {
  const { post, bodies, router } = await openAndConfirm()
  if (close) {
    document.body.querySelector<HTMLButtonElement>('[data-action="close"]')!.click()
    await flushPromises()
  }
  post.resolve(childRun)
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(close ? sourcePath : childPath)
  expect(document.body.querySelector('[data-action="rerun"]')).toBeNull()
  expect(bodies).toHaveLength(1)
})
