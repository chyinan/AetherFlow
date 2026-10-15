import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

import { runApi, type RunPage } from '@/services/api/runApi'
import { settingsApi } from '@/services/api/settingsApi'
import { workflowApi } from '@/services/api/workflowApi'
import { useAuthStore } from '@/stores/authStore'
import type { WorkflowRun } from '@/types/run'

export const homeRunStatuses = {
  active: ['PENDING', 'RUNNING', 'RETRYING', 'WAITING'],
  failed: ['FAILED'],
  completed: ['SUCCESS'],
} as const
export type HomeRunGroup = keyof typeof homeRunStatuses
export const homeRunPageSize = 4

export interface HomeRunSnapshot {
  items: WorkflowRun[]
  failedStatuses: string[]
  pages: Array<{ status: string; total: number; shown: number }>
}

// 每个区块独立处理失败与重试，不让部分失败伪装成空数据。
function resource<T>(fetch: () => Promise<T>, allowed: () => boolean) {
  const state = reactive({ loading: false, loaded: false, error: false, data: null as T | null })
  let generation = 0
  let pending: Promise<void> | undefined
  function clear() {
    generation += 1
    pending = undefined
    state.loading = false
    state.loaded = false
    state.error = false
    state.data = null
  }
  function load() {
    if (!allowed()) return Promise.resolve()
    if (pending) return pending
    const request = ++generation
    state.loading = true
    state.error = false
    state.loaded = false
    state.data = null
    // 延后执行以便先登记 pending；快速重复点击不会启动第二次请求。
    pending = Promise.resolve().then(() => {
      if (generation !== request || !allowed()) return
      return fetch()
    }).then(data => {
      if (generation !== request || !allowed()) return
      Object.assign(state, { data, loaded: true })
    }).catch(() => {
      if (generation === request && allowed()) state.error = true
    }).finally(() => {
      if (generation === request) {
        state.loading = false
        pending = undefined
      }
    })
    return pending
  }
  return { state, load, clear }
}

async function loadRunGroup(group: HomeRunGroup): Promise<HomeRunSnapshot> {
  const statuses = homeRunStatuses[group]
  const results = await Promise.allSettled(statuses.map(status => runApi.listRunsPage({ status, page: 1, pageSize: homeRunPageSize })))
  const pages: HomeRunSnapshot['pages'] = []
  const failedStatuses: string[] = []
  const runs = new Map<string, WorkflowRun>()
  results.forEach((result, index) => {
    const status = statuses[index]!
    if (result.status === 'rejected') {
      failedStatuses.push(status)
      return
    }
    const page: RunPage = result.value
    pages.push({ status, total: page.total, shown: page.items.length })
    // 各状态请求不是事务快照：状态变化可能让同一运行出现在两页，只展示一次。
    page.items.forEach(run => runs.set(run.id, run))
  })
  if (failedStatuses.length === statuses.length) throw new Error('运行区块加载失败')
  return { items: [...runs.values()], failedStatuses, pages }
}

export const useHomeStore = defineStore('home-workbenches', () => {
  const auth = useAuthStore()
  const personalAllowed = () => auth.isAuthenticated
  const adminAllowed = () => auth.isAuthenticated && auth.isAdmin
  const workflows = resource(() => workflowApi.listWorkflows(), personalAllowed)
  const active = resource(() => loadRunGroup('active'), personalAllowed)
  const failed = resource(() => loadRunGroup('failed'), personalAllowed)
  const completed = resource(() => loadRunGroup('completed'), personalAllowed)
  const members = resource(() => settingsApi.listMembers(), adminAllowed)
  const runResources = { active, failed, completed }
  function clearPersonal() {
    workflows.clear()
    Object.values(runResources).forEach(item => item.clear())
  }
  function clearAdmin() { members.clear() }
  watch(() => JSON.stringify([auth.isAuthenticated, auth.user?.userId ?? auth.user?.id, auth.isAdmin]), () => {
    clearPersonal()
    clearAdmin()
  }, { flush: 'sync' })
  return {
    workflows: workflows.state,
    active: active.state,
    failed: failed.state,
    completed: completed.state,
    members: members.state,
    loadWorkflows: workflows.load,
    loadRuns: (group: HomeRunGroup) => runResources[group].load(),
    loadMembers: members.load,
    clearPersonal,
    clearAdmin,
  }
})
