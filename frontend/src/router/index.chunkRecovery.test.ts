import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { Router } from 'vue-router'

const time = 2_000_000
const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/RunsPage-old.js')

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: () => actual.createMemoryHistory('/af/') }
})
vi.mock('@/i18n/index', () => ({ i18n: { global: { t: (key: string) => key } } }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    ensureFreshSession: async () => true,
    hasAnyRole: () => true,
  }),
}))

const page = defineComponent({ template: '<div />' })

async function setup(initialPath = '/workflows/demo') {
  vi.resetModules()
  vi.spyOn(Date, 'now').mockReturnValue(time)
  const cache = new Map<string, string>()
  const assign = vi.fn()
  const reload = vi.fn()
  vi.stubGlobal('window', {
    document: { title: '' },
    location: { assign, reload },
    sessionStorage: {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
    },
  })
  const { router } = await import('./index')
  for (const route of router.getRoutes()) {
    if (route.components) route.components.default = page
  }
  router.options.history.replace(initialPath)
  return { router, assign, reload, cache }
}

function failRunChunk(router: Router, loader = async () => { throw chunkError() }) {
  const record = router.getRoutes().find((route) => route.name === 'run-detail')!
  record.components!.default = loader
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('路由分块加载恢复', () => {
  it('启动后运行详情分块加载失败时，按完整目标地址打开而不是重载编辑器', async () => {
    const { router, assign, reload } = await setup()
    await router.push('/workflows/demo')
    failRunChunk(router)

    const target = '/runs/run-42?view=outputs%20only#bottom'
    await expect(router.push(target)).rejects.toThrow('dynamically imported module')

    expect(router.currentRoute.value.fullPath).toBe('/workflows/demo')
    expect(router.options.history.location).toBe('/workflows/demo')
    expect(assign).toHaveBeenCalledExactlyOnceWith(`/af${target}`)
    expect(reload).not.toHaveBeenCalled()
  })

  it('首次直达失败只重载当前历史项，同一故障短时间内不循环刷新', async () => {
    const target = '/runs/run-42?view=outputs#bottom'
    const { router, assign, reload } = await setup(target)
    failRunChunk(router)
    await expect(router.push(target)).rejects.toThrow('dynamically imported module')
    await expect(router.push(target)).rejects.toThrow('dynamically imported module')

    expect(router.options.history.location).toBe(target)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(assign).not.toHaveBeenCalled()
  })

  it('较早的分块请求迟到失败时不抢占已完成的较新导航', async () => {
    const { router, assign, reload, cache } = await setup()
    await router.push('/workflows/demo')
    let fail: (error: Error) => void = () => undefined
    let loading: () => void = () => undefined
    const started = new Promise<void>((resolve) => { loading = resolve })
    failRunChunk(router, () => new Promise<never>((_, reject) => {
      fail = reject
      loading()
    }))

    const rejected = expect(router.push('/runs/run-42')).rejects.toThrow('dynamically imported module')
    await started
    await router.push('/projects')
    fail(chunkError())
    await rejected

    expect(router.currentRoute.value.fullPath).toBe('/projects')
    expect(reload).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(cache.size).toBe(0)
  })

  it('较新的导航还在等待守卫时，旧分块错误不会接管', async () => {
    const { router, assign, reload, cache } = await setup()
    await router.push('/workflows/demo')
    let fail: (error: Error) => void = () => undefined
    let loading: () => void = () => undefined
    const started = new Promise<void>((resolve) => { loading = resolve })
    failRunChunk(router, () => new Promise<never>((_, reject) => {
      fail = reject
      loading()
    }))
    let continueNavigation: () => void = () => undefined
    let reachedGuard: () => void = () => undefined
    const guarded = new Promise<void>((resolve) => { reachedGuard = resolve })
    router.beforeEach((to) => {
      if (to.name !== 'projects') return true
      return new Promise<boolean>((resolve) => {
        continueNavigation = () => resolve(true)
        reachedGuard()
      })
    })

    const rejected = expect(router.push('/runs/run-42')).rejects.toThrow('dynamically imported module')
    await started
    const next = router.push('/projects')
    await guarded
    fail(chunkError())
    await rejected
    expect(router.currentRoute.value.fullPath).toBe('/workflows/demo')
    expect(assign).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(cache.size).toBe(0)

    continueNavigation()
    await next
    expect(router.currentRoute.value.fullPath).toBe('/projects')
  })

  it('非分块异常保持原样，不强制换页', async () => {
    const { router, assign, reload, cache } = await setup()
    await router.push('/workflows/demo')
    failRunChunk(router, async () => { throw new Error('运行详情不可用') })
    await expect(router.push('/runs/run-42')).rejects.toThrow('运行详情不可用')

    expect(reload).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(cache.size).toBe(0)
  })
})
