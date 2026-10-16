// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 只替换最底层传输；所有删除仅修改本测试内存 fixture，不会连接真实后端。
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: () => {} }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: () => Promise.resolve() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: () => Promise.resolve() }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: () => Promise.resolve() }) }))

import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import ProjectsPage from '@/pages/projects/ProjectsPage.vue'

type Entity = { id: number; name: string; projectId: number; version: number; status: string; definitionJson: string }
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let definitions: Entity[]
let wrapper: VueWrapper | undefined
let componentErrors: unknown[]
let confirm: ReturnType<typeof vi.spyOn>
function projectRows() {
  return [1, 2].map(id => {
    const rows = definitions.filter(row => row.projectId === id)
    return { id: String(id), name: id === 1 ? '项目甲' : '项目乙', scenario: 'media', workflowCount: rows.length,
      workflows: rows.map(row => ({ id: String(row.id), name: row.name, status: 'draft' })) }
  })
}
function persistDelete(id: number) { definitions = definitions.filter(row => row.id !== id) }
async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/elsewhere', component: defineComponent({ template: '<p>其他页面</p>' }) },
    { path: '/workflows/:id', component: defineComponent({ template: '<p>工作流编辑页</p>' }) },
  ] })
  await router.push('/projects'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, i18n, router], config: {
    errorHandler: error => componentErrors.push(error),
  } } })
  await flushPromises()
  return { router, store: useProjectStore() }
}
function deleteButton(id = '101') {
  return wrapper!.get(`a[href="/workflows/${id}"] button[title="${i18n.global.t('projects.deleteWorkflow')}"]`)
}
async function clickDelete(id = '101') { await deleteButton(id).trigger('click'); await flushPromises() }
const hasRow = (id: string) => wrapper!.find(`a[href="/workflows/${id}"]`).exists()

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  componentErrors = []
  i18n.global.locale.value = 'zh-CN'
  definitions = [
    { id: 101, name: '工作流甲', projectId: 1, version: 1, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
    { id: 102, name: '工作流乙', projectId: 2, version: 1, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
  ]
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  http.get.mockImplementation(async (path: string) => {
    if (path === '/projects') return { records: copy(projectRows()), total: 2 }
    if (path === '/workflows/definitions') return copy(definitions)
    throw new Error(`未预期的 GET ${path}`)
  })
  http.delete.mockImplementation(async (path: string) => { persistDelete(Number(path.split('/').at(-1))) })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

describe('正常／取消对照：真实页面、store 与 API 映射', () => {
  it('取消确认不删除、不改变列表或选择，也不导航', async () => {
    confirm.mockReturnValue(false)
    const { router, store } = await setup()
    store.selectProject('2')
    const before = copy(store.$state)
    const gets = http.get.mock.calls.length
    await clickDelete()
    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledWith(i18n.global.t('projects.deleteWorkflowConfirm', { name: '工作流甲' }))
    expect(http.delete).not.toHaveBeenCalled()
    expect(http.get).toHaveBeenCalledTimes(gets)
    expect(store.$state).toEqual(before)
    expect(hasRow('101')).toBe(true)
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(componentErrors).toEqual([])
  })

  it('确认后恰好一次映射到目标 DELETE，成功仅移除目标且无需回读列表', async () => {
    const { router, store } = await setup()
    store.selectProject('2'); store.linkWorkflowToProject('1', '101'); store.linkWorkflowToProject('2', '102')
    const gets = http.get.mock.calls.length
    await clickDelete()
    expect(http.delete).toHaveBeenCalledExactlyOnceWith('/workflows/definitions/101', { source: 'workflow' })
    expect(http.get).toHaveBeenCalledTimes(gets)
    expect(definitions.map(row => row.id)).toEqual([102])
    expect(store.workflowSummaries.map(row => row.id)).toEqual(['102'])
    expect(store.projects.find(row => row.id === '1')?.workflows).toEqual([])
    expect(store.projectWorkflows('2').map(row => row.id)).toEqual(['102'])
    expect(localStorage.getItem('aetherflow.project.workflowLinks.anonymous')).toBe('{"1":[],"2":["102"]}')
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
    expect(store.currentProjectId).toBe('2')
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(componentErrors).toEqual([])
  })

  it('删除仍等待时不提前移除或更改对应工作流', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    const { store } = await setup(); await clickDelete()
    expect(hasRow('101')).toBe(true)
    expect(store.projectWorkflows('1')[0]?.name).toBe('工作流甲')
    expect(definitions.map(row => row.id)).toEqual([101, 102])
    persistDelete(101); pending.resolve(); await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it('首次失败保留目标及 link，用户明确再次确认后可成功重试', async () => {
    http.delete.mockRejectedValueOnce(new Error('删除暂时不可用'))
    const { store } = await setup(); store.linkWorkflowToProject('1', '101')
    await clickDelete()
    expect(hasRow('101')).toBe(true)
    expect(store.projectWorkflows('1').map(row => row.id)).toEqual(['101'])
    expect(localStorage.getItem('aetherflow.project.workflowLinks.anonymous')).toBe('{"1":["101"]}')
    expect(http.delete).toHaveBeenCalledTimes(1)
    await clickDelete()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(http.delete).toHaveBeenCalledTimes(2)
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
  })

  it('失败后取消重试不再派发 DELETE', async () => {
    http.delete.mockRejectedValueOnce(new Error('删除暂时不可用'))
    await setup(); await clickDelete()
    confirm.mockReturnValue(false); await clickDelete()
    expect(http.delete).toHaveBeenCalledTimes(1)
    expect(hasRow('101')).toBe(true)
    expect(definitions.map(row => row.id)).toEqual([101, 102])
  })

  it('独立的另一工作流仍可由用户确认删除，不应使用全页全局互斥', async () => {
    const first = deferred<void>(); const second = deferred<void>()
    http.delete.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await setup(); await clickDelete('101'); await clickDelete('102')
    expect(http.delete.mock.calls.map(call => call[0])).toEqual(['/workflows/definitions/101', '/workflows/definitions/102'])
    persistDelete(102); second.resolve(); await flushPromises()
    expect(hasRow('101')).toBe(true); expect(hasRow('102')).toBe(false)
    persistDelete(101); first.resolve(); await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(componentErrors).toEqual([])
  })
})

describe('删除恢复的目标契约', () => {
  it('同一行的 DELETE 等待时重复点击只应发起一次确认与一次 DELETE', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValue(pending.promise)
    await setup()
    const button = deleteButton().element as HTMLButtonElement
    button.click(); button.click(); await flushPromises()
    const count = http.delete.mock.calls.length
    const confirms = confirm.mock.calls.length
    persistDelete(101); pending.resolve(); await flushPromises()
    expect(count).toBe(1)
    expect(confirms).toBe(1)
  })

  it('等待时应禁用目标行删除并提供可见等待反馈', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    await setup(); await clickDelete()
    const disabled = deleteButton().attributes('disabled') !== undefined
    const visible = wrapper!.text()
    persistDelete(101); pending.resolve(); await flushPromises()
    expect.soft(disabled).toBe(true)
    expect(visible).toMatch(/删除中|正在删除|Deleting|削除中/)
  })

  it('DELETE 失败由页面接住并向用户说明目标与可恢复操作', async () => {
    http.delete.mockRejectedValueOnce(new Error('删除暂时不可用'))
    await setup(); await clickDelete()
    expect(hasRow('101')).toBe(true)
    expect.soft(componentErrors).toEqual([])
    const alerts = wrapper!.findAll('[role="alert"]')
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.map(row => row.text()).join(' ')).toContain('工作流甲')
    expect(alerts.map(row => row.text()).join(' ')).toMatch(/重试|确认/)
  })

  it('另一行成功不得清掉本行失败提示或把错误归到错误目标', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('乙删除暂时不可用'))
    await setup(); await clickDelete('101'); await clickDelete('102')
    persistDelete(101); pending.resolve(); await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
    expect.soft(componentErrors).toEqual([])
    const text = wrapper!.findAll('[role="alert"]').map(row => row.text()).join(' ')
    expect(text).toContain('工作流乙')
    expect(text).not.toContain('工作流甲')
  })

  it('失败后的明确重试成功应清除该操作的错误提示', async () => {
    http.delete.mockRejectedValueOnce(new Error('删除暂时不可用'))
    await setup(); await clickDelete(); await clickDelete()
    expect(http.delete).toHaveBeenCalledTimes(2)
    expect(hasRow('101')).toBe(false)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it('删除项目中最后一个工作流后项目／页头工作流统计应为零', async () => {
    definitions = definitions.filter(row => row.projectId === 1)
    const { store } = await setup(); await clickDelete()
    expect(store.projectWorkflows('1')).toEqual([])
    expect(wrapper!.find('[data-state="no-workflows"]').exists()).toBe(true)
    expect.soft(store.projectMetrics('1')?.workflowCount).toBe(0)
    // 页头首个统计卡片中的数字与空状态不应互相矛盾。
    const count = wrapper!.get('main section.grid > div p.text-2xl').text()
    expect(count).toBe('0')
  })

  it('缓存列表重入自动读取的旧快照晚到，不应把已确认删除的行恢复', async () => {
    const { router, store } = await setup()
    definitions.find(row => row.id === 102)!.name = '工作流乙的列表新名称'
    const oldProjects = copy(projectRows()); const oldDefinitions = copy(definitions)
    await router.push('/elsewhere'); await flushPromises()
    const pendingProjects = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return pendingProjects.promise
      if (path === '/workflows/definitions') return oldDefinitions
      throw new Error(`未预期的 GET ${path}`)
    })
    await router.push('/projects'); await flushPromises()
    expect(store.loading).toBe(true)
    expect(hasRow('101')).toBe(true)
    await clickDelete()
    expect(hasRow('101')).toBe(false)
    expect(definitions.map(row => row.id)).toEqual([102])
    pendingProjects.resolve({ records: oldProjects, total: 2 }); await flushPromises()
    expect.soft(store.projectWorkflows('1')).toEqual([])
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
    expect(wrapper!.get('a[href="/workflows/102"]').text()).toContain('工作流乙的列表新名称')
    expect(componentErrors).toEqual([])
  })

  it('项目 GET 先回而工作流 GET 仍等待时的旧联合快照，也不得恢复已删除行', async () => {
    const { router, store } = await setup()
    const oldProjects = copy(projectRows()); const oldDefinitions = copy(definitions)
    await router.push('/elsewhere'); await flushPromises()
    const pendingDefinitions = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return { records: oldProjects, total: 2 }
      if (path === '/workflows/definitions') return pendingDefinitions.promise
      throw new Error(`未预期的 GET ${path}`)
    })
    await router.push('/projects'); await flushPromises(); await clickDelete()
    expect(hasRow('101')).toBe(false)
    pendingDefinitions.resolve(oldDefinitions); await flushPromises()
    expect.soft(store.projectWorkflows('1')).toEqual([])
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
  })

  it('离页后删除失败也应被操作自身接住，不泄漏组件事件错误', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    const { router, store } = await setup(); await clickDelete()
    await router.push('/elsewhere'); await flushPromises()
    pending.reject(new Error('旧删除失败')); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(wrapper!.text()).toBe('其他页面')
    expect(store.projectWorkflows('1').map(row => row.id)).toEqual(['101'])
    expect(componentErrors).toEqual([])
  })
})

describe('离页／新操作反例', () => {
  it('删除等待中离页，旧成功只清理对应列表，不导航回来', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    const { router, store } = await setup(); await clickDelete()
    await router.push('/elsewhere'); await flushPromises()
    persistDelete(101); pending.resolve(); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(wrapper!.text()).toBe('其他页面')
    expect(store.projectWorkflows('1')).toEqual([])
    expect(store.projectWorkflows('2').map(row => row.id)).toEqual(['102'])
    expect(componentErrors).toEqual([])
  })

  it('离页重入后旧删除成功不会关闭当前新建工作流草稿', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    const { router } = await setup(); await clickDelete()
    await router.push('/elsewhere'); await router.push('/projects'); await flushPromises()
    const create = wrapper!.findAll('article button').find(button => button.text() === i18n.global.t('projects.newWorkflow'))!
    await create.trigger('click'); await wrapper!.get('form input').setValue('新的工作流草稿')
    persistDelete(101); pending.resolve(); await flushPromises()
    expect(wrapper!.find('form').exists()).toBe(true)
    expect((wrapper!.get('form input').element as HTMLInputElement).value).toBe('新的工作流草稿')
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(componentErrors).toEqual([])
  })

  it('删除成功后重新读取权威列表，仍能更新其他项目而不全局冻结读取', async () => {
    const { store } = await setup(); await clickDelete()
    definitions.find(row => row.id === 102)!.name = '工作流乙的权威新名称'
    await store.loadProjects(); await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(wrapper!.get('a[href="/workflows/102"]').text()).toContain('工作流乙的权威新名称')
    expect(store.projectMetrics('1')?.workflowCount).toBe(0)
    expect(store.projectMetrics('2')?.workflowCount).toBe(1)
    expect(componentErrors).toEqual([])
  })
})

describe('删除协调的请求窗口与可恢复边界', () => {
  it('同一 store 的重复在途调用不重复发 DELETE，重复成功也不二次扣计数', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    const { store } = await setup()
    const first = store.deleteProjectWorkflow('1', '101')
    await store.deleteProjectWorkflow('1', '101')
    expect(http.delete).toHaveBeenCalledTimes(1)
    persistDelete(101); pending.resolve(); await first
    expect(store.projects[0]?.workflowCount).toBe(0)
    await store.deleteProjectWorkflow('1', '101')
    expect(store.projects[0]?.workflowCount).toBe(0)
    expect(store.deletingWorkflowIds).toEqual({})
  })

  it('等待中离页重入仍禁用同一目标，其他目标保持可操作', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    const { router } = await setup(); await clickDelete()
    await router.push('/elsewhere'); await router.push('/projects'); await flushPromises()
    expect(deleteButton().attributes('disabled')).toBeDefined()
    expect(deleteButton('102').attributes('disabled')).toBeUndefined()
    await clickDelete()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(http.delete).toHaveBeenCalledTimes(1)
    persistDelete(101); pending.resolve(); await flushPromises()
    expect(hasRow('101')).toBe(false)
  })

  it('离页重入后的旧失败归属原行，取消重试保留提示，确认重试才清理', async () => {
    const pending = deferred<void>(); const retry = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise).mockReturnValueOnce(retry.promise)
    const { router } = await setup(); await clickDelete()
    await router.push('/elsewhere'); await router.push('/projects'); await flushPromises()
    pending.reject(new Error('结果未知')); await flushPromises()
    expect(wrapper!.get('a[href="/workflows/101"] [role="alert"]').text()).toContain('工作流甲')
    confirm.mockReturnValueOnce(false); await clickDelete()
    expect(wrapper!.find('[role="alert"]').exists()).toBe(true)
    await clickDelete()
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(deleteButton().attributes('disabled')).toBeDefined()
    persistDelete(101); retry.resolve(); await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it('同一项目两个不同工作流并行删除，每个成功只扣一次且最后归零', async () => {
    definitions[1]!.projectId = 1
    const first = deferred<void>(); const second = deferred<void>()
    http.delete.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { store } = await setup(); await clickDelete('101'); await clickDelete('102')
    persistDelete(102); second.resolve(); await flushPromises()
    expect(store.projects[0]?.workflowCount).toBe(1)
    expect(hasRow('101')).toBe(true)
    persistDelete(101); first.resolve(); await flushPromises()
    expect(store.projects[0]?.workflowCount).toBe(0)
    expect(store.projectMetrics('1')?.workflowCount).toBe(0)
  })

  it('部分／未知列表仍保留服务端计数，仅扣已知目标而不把全部计数清零', async () => {
    const { store } = await setup()
    store.projects[0]!.workflowCount = 5
    await clickDelete()
    expect(store.projects[0]?.workflowCount).toBe(4)
    expect(store.projectMetrics('1')?.workflowCount).toBe(4)
    expect(store.projectMetrics('2')?.workflowCount).toBe(1)
  })

  it('部分列表的工作流读取失败，项目嵌入旧行晚到仍过滤目标并保留警告', async () => {
    const { store } = await setup()
    const oldProjects = copy(projectRows()); const pending = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return pending.promise
      if (path === '/workflows/definitions') throw new Error('工作流列表不可用')
      throw new Error(`未预期的 GET ${path}`)
    })
    const loading = store.loadProjects(); await flushPromises(); await clickDelete()
    pending.resolve({ records: oldProjects, total: 2 }); await loading; await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
    expect(store.projects[0]?.workflowCount).toBe(0)
    expect(store.loadError).toBe(i18n.global.t('projects.workflowLoadWarning'))
    expect(store.workflowLoadDeletions).toEqual({})
  })

  it('项目读取失败不再次扣当前缓存计数，已确认删除保持有效', async () => {
    const { store } = await setup()
    const pending = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return pending.promise
      if (path === '/workflows/definitions') return copy(definitions)
      throw new Error(`未预期的 GET ${path}`)
    })
    const loading = store.loadProjects().catch(() => {})
    await clickDelete(); pending.reject(new Error('项目列表不可用')); await loading; await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(store.projects[0]?.workflowCount).toBe(0)
    expect(store.workflowLoadDeletions).toEqual({})
  })

  it.each(['loadProjects', 'refreshProjects'] as const)('%s 仅过滤本次读取窗口内确认的目标并保留其他新数据', async action => {
    const { store } = await setup()
    definitions[1]!.name = '乙的本次新名称'
    const oldProjects = copy(projectRows()); const oldDefinitions = copy(definitions)
    const pending = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return { records: oldProjects, total: 2 }
      if (path === '/workflows/definitions') return pending.promise
      throw new Error(`未预期的 GET ${path}`)
    })
    const loading = store[action](); await flushPromises(); await clickDelete()
    pending.resolve(oldDefinitions); await loading; await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(wrapper!.get('a[href="/workflows/102"]').text()).toContain('乙的本次新名称')
    expect(store.workflowLoadDeletions).toEqual({})
  })

  it('同一 store 较新读取覆盖旧请求时，两窗口均清理，旧回执不恢复或重复扣数', async () => {
    const { store } = await setup()
    const oldProjects = copy(projectRows()); const oldDefinitions = copy(definitions)
    const first = deferred<unknown>(); const second = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return { records: oldProjects, total: 2 }
      if (path === '/workflows/definitions') return oldDefinitions
      throw new Error(`未预期的 GET ${path}`)
    })
    http.get.mockImplementationOnce(() => first.promise)
    const loadingFirst = store.loadProjects()
    http.get.mockImplementationOnce(() => second.promise)
    const loadingSecond = store.loadProjects()
    await clickDelete()
    second.resolve({ records: oldProjects, total: 2 }); await loadingSecond; await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(store.projects[0]?.workflowCount).toBe(0)
    first.resolve({ records: oldProjects, total: 2 }); await loadingFirst; await flushPromises()
    expect(hasRow('101')).toBe(false)
    expect(store.projects[0]?.workflowCount).toBe(0)
    expect(store.workflowLoadDeletions).toEqual({})
  })

  it('删除成功后才开始的权威读取允许重新显示相同 ID，不保留永久墓碑', async () => {
    const { store } = await setup()
    const sameId = copy(definitions[0]!)
    await clickDelete()
    definitions.push({ ...sameId, name: '服务端重新给出的同 ID 工作流' })
    await store.loadProjects(); await flushPromises()
    expect(wrapper!.get('a[href="/workflows/101"]').text()).toContain('服务端重新给出的同 ID 工作流')
    expect(store.projectMetrics('1')?.workflowCount).toBe(1)
    expect(store.workflowLoadDeletions).toEqual({})
  })

  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s 的等待与错误提示包含目标名，失败不自动重试', async locale => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    await setup(); i18n.global.locale.value = locale; await flushPromises()
    await clickDelete()
    expect(wrapper!.get('a[href="/workflows/101"] [role="status"]').text()).toContain('工作流甲')
    pending.reject(new Error('结果未知')); await flushPromises()
    const alert = wrapper!.get('a[href="/workflows/101"] [role="alert"]').text()
    expect(alert).toContain('工作流甲')
    expect(alert).not.toContain('projects.deleteWorkflowFailedHint')
    expect(http.delete).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })
})

describe('项目计数只依据同一项目快照的成员证据', () => {
  it.each([
    { projectOld: true, summaryOld: true },
    { projectOld: true, summaryOld: false },
    { projectOld: false, summaryOld: true },
    { projectOld: false, summaryOld: false },
  ])('混合快照：项目旧=$projectOld／工作流旧=$summaryOld，部分计数5删除后始终为4', async ({ projectOld, summaryOld }) => {
    const { store } = await setup()
    store.projects[0]!.workflowCount = 5
    const oldProjects = copy(projectRows()); oldProjects[0]!.workflowCount = 5
    const newProjects = copy(oldProjects)
    newProjects[0]!.workflows = []; newProjects[0]!.workflowCount = 4
    const oldDefinitions = copy(definitions)
    const newDefinitions = oldDefinitions.filter(row => row.id !== 101)
    const projectResponse = deferred<unknown>(); const workflowResponse = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return projectResponse.promise
      if (path === '/workflows/definitions') return workflowResponse.promise
      throw new Error(`未预期的 GET ${path}`)
    })
    const loading = store.loadProjects(); await clickDelete()
    projectResponse.resolve({ records: projectOld ? oldProjects : newProjects, total: 2 })
    await flushPromises()
    workflowResponse.resolve(summaryOld ? oldDefinitions : newDefinitions)
    await loading; await flushPromises()
    expect(store.projects[0]?.workflowCount).toBe(4)
    expect(store.projectMetrics('1')?.workflowCount).toBe(4)
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
    expect(store.workflowLoadDeletions).toEqual({})
  })

  it('未知嵌入列表仅有旧 summary 时保留原项目计数，不猜测该计数包含目标', async () => {
    const { store } = await setup()
    const unknownProjects = copy(projectRows())
    unknownProjects[0]!.workflows = []; unknownProjects[0]!.workflowCount = 5
    const oldDefinitions = copy(definitions); const pending = deferred<unknown>()
    http.get.mockImplementation(async (path: string) => {
      if (path === '/projects') return pending.promise
      if (path === '/workflows/definitions') return oldDefinitions
      throw new Error(`未预期的 GET ${path}`)
    })
    const loading = store.loadProjects(); await clickDelete()
    pending.resolve({ records: unknownProjects, total: 2 }); await loading; await flushPromises()
    expect(store.projects[0]?.workflowCount).toBe(5)
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
  })
})

describe('删除结果与已交付重命名恢复的代次协作', () => {
  it('只有确认成功才推进目标代次，其他工作流代次保持不变', async () => {
    const { store } = await setup()
    store.workflowRenameRequestIds = { '101': 7, '102': 11 }
    await clickDelete('101')
    expect(store.workflowRenameRequestIds).toEqual({ '101': 8, '102': 11 })
    expect(hasRow('101')).toBe(false)
    expect(hasRow('102')).toBe(true)
  })

  it('旧 DELETE 等待后失败不会使仍合法的重命名代次失效', async () => {
    const pending = deferred<void>()
    http.delete.mockReturnValueOnce(pending.promise)
    const { store } = await setup()
    store.workflowRenameRequestIds = { '101': 7, '102': 11 }
    await clickDelete()
    expect(store.workflowRenameRequestIds).toEqual({ '101': 7, '102': 11 })
    pending.reject(new Error('旧删除结果未确认')); await flushPromises()
    expect(store.workflowRenameRequestIds).toEqual({ '101': 7, '102': 11 })
    expect(hasRow('101')).toBe(true)
    expect(wrapper!.get('a[href="/workflows/101"] [role="alert"]').text()).toContain('工作流甲')
    expect(componentErrors).toEqual([])
  })
})
