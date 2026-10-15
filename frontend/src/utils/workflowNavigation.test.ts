// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { observeWorkflowNavigation } from './workflowNavigation'
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
async function setup() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:id', component: { template: '<div />' } }] })
  const state = observeWorkflowNavigation(router)
  await router.push('/a'); await router.isReady()
  return { router, state }
}
describe('工作流较新导航意图', () => {
  it('异步守卫前即记录，重复安装复用同一状态，接受或拒绝均清理', async () => {
    const { router, state } = await setup(); expect(observeWorkflowNavigation(router)).toBe(state)
    const gate = deferred<boolean>(); router.beforeEach(to => to.path === '/b' ? gate.promise : undefined)
    const pending = router.push('/b'); await flushPromises()
    expect(state.pending?.path).toBe('/b'); expect(router.currentRoute.value.path).toBe('/a')
    gate.resolve(false); await pending; expect(state.pending).toBeNull()
    await router.push('/c'); expect(state.pending).toBeNull(); expect(router.currentRoute.value.path).toBe('/c')
  })
  it('旧导航迟到结束不能清掉更新导航的等待状态', async () => {
    const { router, state } = await setup()
    const b = deferred<boolean>(); const c = deferred<boolean>()
    router.beforeEach(to => to.path === '/b' ? b.promise : to.path === '/c' ? c.promise : undefined)
    const old = router.push('/b'); await flushPromises()
    const current = router.push('/c'); await flushPromises(); const latest = state.pending
    b.resolve(true); await old; expect(state.pending).toBe(latest); expect(state.pending?.path).toBe('/c')
    c.resolve(true); await current; expect(state.pending).toBeNull(); expect(router.currentRoute.value.path).toBe('/c')
  })
  it('守卫抛错或重定向最终结束都清理，不把旧意图遗留给复制', async () => {
    const { router, state } = await setup(); const error = new Error('导航失败'); const onError = vi.fn(); router.onError(onError)
    router.beforeEach(to => { if (to.path === '/b') throw error; if (to.path === '/c') return '/d' })
    await expect(router.push('/b')).rejects.toBe(error); expect(onError).toHaveBeenCalled(); expect(state.pending).toBeNull()
    await router.push('/c'); expect(router.currentRoute.value.path).toBe('/d'); expect(state.pending).toBeNull()
    await router.push('/d'); expect(state.pending).toBeNull()
  })
  it('较新重复当前地址取消旧未决目标，即时清理过时 pending', async () => {
    const { router, state } = await setup(); const gate = deferred<boolean>()
    router.beforeEach(to => to.path === '/b' ? gate.promise : undefined)
    const old = router.push('/b'); await flushPromises()
    await router.push('/a'); expect(state.pending).toBeNull()
    gate.resolve(true); await old; expect(router.currentRoute.value.path).toBe('/a'); expect(state.pending).toBeNull()
  })
  it('重复当前地址后紧接新目标，不清掉更晚的新守卫等待', async () => {
    const { router, state } = await setup(); const b = deferred<boolean>(); const c = deferred<boolean>()
    router.beforeEach(to => to.path === '/b' ? b.promise : to.path === '/c' ? c.promise : undefined)
    const old = router.push('/b'); await flushPromises()
    const duplicate = router.push('/a'); const current = router.push('/c'); await flushPromises(); await duplicate
    expect(state.pending?.path).toBe('/c')
    b.resolve(true); await old; expect(state.pending?.path).toBe('/c')
    c.resolve(true); await current; expect(state.pending).toBeNull(); expect(router.currentRoute.value.path).toBe('/c')
  })
  it('多个未决目标被当前地址取消，逆序结束仍保持当前页且无残留', async () => {
    const { router, state } = await setup(); const b = deferred<boolean>(); const c = deferred<boolean>()
    router.beforeEach(to => to.path === '/b' ? b.promise : to.path === '/c' ? c.promise : undefined)
    const old = router.push('/b'); await flushPromises(); const current = router.push('/c'); await flushPromises()
    await router.push('/a'); expect(state.pending).toBeNull()
    c.resolve(true); await current; b.resolve(true); await old
    expect(state.pending).toBeNull(); expect(router.currentRoute.value.path).toBe('/a')
  })
  it('旧守卫迟到抛错不能清除较新的守卫等待', async () => {
    const { router, state } = await setup(); const b = deferred<boolean>(); const c = deferred<boolean>(); const error = new Error('旧导航失败')
    router.onError(() => undefined)
    router.beforeEach(to => to.path === '/b' ? b.promise.then(() => { throw error }) : to.path === '/c' ? c.promise : undefined)
    const old = router.push('/b'); const rejected = expect(old).rejects.toBe(error); await flushPromises()
    const current = router.push('/c'); await flushPromises(); b.resolve(true); await rejected
    expect(state.pending?.path).toBe('/c'); c.resolve(true); await current; expect(state.pending).toBeNull()
  })

})
