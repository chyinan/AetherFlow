import { isNavigationFailure, NavigationFailureType, type RouteLocationNormalized, type Router } from 'vue-router'

const observers = new WeakMap<Router, { pending: RouteLocationNormalized | null }>()

/** 必须先于异步全局守卫安装，供编辑器识别尚未提交的较新导航意图。 */
export function observeWorkflowNavigation(router: Router) {
  const existing = observers.get(router)
  if (existing) return existing
  const state: { pending: RouteLocationNormalized | null } = { pending: null }
  observers.set(router, state)
  router.beforeEach((to) => { state.pending = to })
  const settle = (to: RouteLocationNormalized) => {
    if (state.pending === to) state.pending = null
  }
  router.afterEach((to, _from, failure) => {
    // 点击当前地址也会取消旧导航，但不会经过 beforeEach。
    if (isNavigationFailure(failure, NavigationFailureType.duplicated)) state.pending = null
    else settle(to)
  })
  router.onError((_error, to) => settle(to))
  return state
}
