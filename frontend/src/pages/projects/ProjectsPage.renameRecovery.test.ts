// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: () => {} }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: () => Promise.resolve() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: () => Promise.resolve() }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: () => Promise.resolve() }) }))

import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import ProjectsPage from '@/pages/projects/ProjectsPage.vue'

type Entity = { id: number; name: string; projectId: number; version: number; status: string; definitionJson: string }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
let definitions: Entity[]
let wrapper: VueWrapper
let componentErrors: unknown[]
const projectRows = () => [
  { id: '1', name: '项目甲', scenario: 'media', workflows: [] },
  { id: '2', name: '项目乙', scenario: 'document', workflows: [] },
]
const entity = (id: number) => definitions.find(row => row.id === id)!
function persist(id: number, name: string) {
  const row = entity(id)
  row.name = name
  row.version += 1
  return copy(row)
}
async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/elsewhere', component: defineComponent({ template: '<p>其他页面</p>' }) },
    { path: '/workflows/:id', component: defineComponent({ template: '<p>工作流编辑页</p>' }) },
  ] })
  await router.push('/projects')
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, i18n, router], config: {
    errorHandler: error => componentErrors.push(error),
  } } })
  await flushPromises()
  return { router, store: useProjectStore() }
}
async function openRename(id = '101', name = '甲的新名称') {
  await wrapper.get(`a[href="/workflows/${id}"] button[title="${i18n.global.t('projects.renameWorkflow')}"]`).trigger('click')
  await wrapper.get('form input').setValue(name)
}
async function close() { await wrapper.get('form button[type="button"]').trigger('click') }
async function submit() { await wrapper.get('form').trigger('submit'); await flushPromises() }
function formName() { return (wrapper.get('form input').element as HTMLInputElement).value }

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  componentErrors = []
  i18n.global.locale.value = 'zh-CN'
  definitions = [
    { id: 101, name: '工作流甲', projectId: 1, version: 1, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
    { id: 102, name: '工作流乙', projectId: 2, version: 1, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
  ]
  http.get.mockImplementation(async (path: string) => {
    if (path === '/projects') return { records: projectRows(), total: 2 }
    if (path === '/workflows/definitions') return copy(definitions)
    const match = /^\/workflows\/definitions\/(\d+)$/.exec(path)
    if (match) return copy(entity(Number(match[1])))
    throw new Error(`未预期的 GET ${path}`)
  })
  http.put.mockImplementation(async (path: string, payload: { name: string }) => {
    const id = Number(path.split('/').at(-1))
    return persist(id, payload.name)
  })
})
afterEach(() => wrapper?.unmount())

describe('缺陷回归契约：工作流重命名与弹框归属', () => {
  it('旧重命名成功不应关闭重新打开的另一工作流草稿', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    await setup(); await openRename(); await submit(); await close()
    await openRename('102', '乙仍在输入的名称')
    expect(formName()).toBe('乙仍在输入的名称')
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(formName()).toBe('乙仍在输入的名称')
  })

  it('旧重命名成功不应关闭重新打开的新建工作流草稿', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    await setup(); await openRename(); await submit(); await close()
    const create = wrapper.findAll('article button').find(button => button.text() === i18n.global.t('projects.newWorkflow'))!
    await create.trigger('click'); await wrapper.get('form input').setValue('未提交的新工作流')
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(formName()).toBe('未提交的新工作流')
  })

  it('同一弹框保存等待中再次提交应保持单飞', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValue(pending.promise)
    await setup(); await openRename(); await submit(); await submit()
    const count = http.put.mock.calls.length
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(count).toBe(1)
  })

  it.each(['读取定义', '保存定义'])('%s失败应有可恢复提示并被组件接住', async stage => {
    await setup(); await openRename('101', '保留的名称')
    const error = new Error(`${stage}暂时不可用`)
    if (stage === '读取定义') http.get.mockRejectedValueOnce(error)
    else http.put.mockRejectedValueOnce(error)
    await submit()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(formName()).toBe('保留的名称')
    expect.soft(componentErrors).toEqual([])
    expect(wrapper.find('form [role="alert"]').exists()).toBe(true)
  })

  it('保存已确认而项目列表回读失败，重命名动作仍应返回已保存记录', async () => {
    const { store } = await setup()
    http.get.mockImplementationOnce(async path => {
      expect(path).toBe('/workflows/definitions/101')
      return copy(entity(101))
    }).mockRejectedValueOnce(new Error('项目列表暂时不可用'))
    const result = await store.renameProjectWorkflow('1', '101', '已落定的名称').then(
      value => ({ value, error: null }), error => ({ value: undefined, error }),
    )
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(entity(101).name).toBe('已落定的名称')
    expect(store.loadError).not.toBeNull()
    expect(result.error).toBeNull()
    expect(result.value?.name).toBe('已落定的名称')
  })

  it('页面上的保存成功与回读失败应分离，关闭已完成草稿并保留已保存名称', async () => {
    const { store } = await setup(); await openRename('101', '已经保存的甲')
    const originalGet = http.get.getMockImplementation()!
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/projects') throw new Error('项目列表回读失败')
      return originalGet(path, ...rest)
    })
    await submit()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(entity(101).name).toBe('已经保存的甲')
    expect(store.loadError).not.toBeNull()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(store.projectWorkflows('1')[0]?.name).toBe('已经保存的甲')
    expect(componentErrors).toEqual([])
  })

  it('旧重命名失败不得泄漏组件错误或污染重开的新草稿', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    await setup(); await openRename(); await submit(); await close()
    await openRename('102', '乙的新草稿')
    pending.reject(new Error('旧保存失败')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(formName()).toBe('乙的新草稿')
    expect(wrapper.find('form [role="alert"]').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })
})

describe('反例：正常行为、关闭及导航边界', () => {
  it('正常重命名去除首尾空白、更新对应列表并关闭弹框', async () => {
    const { router, store } = await setup(); await openRename('101', '  甲的新名称  '); await submit()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.put.mock.calls[0]?.[0]).toBe('/workflows/definitions/101')
    expect(http.put.mock.calls[0]?.[1].name).toBe('甲的新名称')
    expect(store.projectWorkflows('1')[0]?.name).toBe('甲的新名称')
    expect(store.projectWorkflows('2')[0]?.name).toBe('工作流乙')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(componentErrors).toEqual([])
  })

  it('空白名称不会请求读取或保存定义，仍保留弹框', async () => {
    await setup(); await openRename('101', '   ')
    const before = http.get.mock.calls.length
    await submit()
    expect(http.get.mock.calls.length).toBe(before)
    expect(http.put).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('未提交草稿关闭再打开不会提交或沿用旧名称', async () => {
    await setup(); await openRename('101', '未提交的甲'); await close(); await openRename('102', '乙的草稿')
    expect(formName()).toBe('乙的草稿')
    expect(http.put).not.toHaveBeenCalled()
  })

  it('关闭旧草稿后，旧成功本身不会重新打开弹框', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    const { store } = await setup(); await openRename(); await submit(); await close()
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(store.projectWorkflows('1')[0]?.name).toBe('甲的新名称')
  })

  it('重命名等待期间离开项目页，旧成功不会强行导航回来', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    const { router, store } = await setup(); await openRename(); await submit()
    await router.push('/elsewhere'); await flushPromises()
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(wrapper.text()).toBe('其他页面')
    expect(store.projectWorkflows('1')[0]?.name).toBe('甲的新名称')
    expect(componentErrors).toEqual([])
  })

  it('卸载重入后属于新组件，旧成功不关闭新组件的弹框', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    const { router } = await setup(); await openRename(); await submit()
    await router.push('/elsewhere'); await router.push('/projects'); await flushPromises()
    await openRename('102', '新页面乙草稿')
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(formName()).toBe('新页面乙草稿')
  })

  it('等待期间选中另一现存项目，列表回读不会抢走该选择', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    const { store } = await setup(); await openRename(); await submit()
    store.selectProject('2')
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(store.currentProjectId).toBe('2')
  })

  it('保存失败后仍可显式重试，失败本身没有清空已输入名称', async () => {
    await setup(); await openRename('101', '重试名称')
    http.put.mockRejectedValueOnce(new Error('暂时不可用'))
    await submit()
    expect(formName()).toBe('重试名称')
    expect(http.put).toHaveBeenCalledTimes(1)
    await submit()
    expect(http.put).toHaveBeenCalledTimes(2)
    expect(entity(101).name).toBe('重试名称')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('新建工作流分支只关闭草稿并携名称导航，没有重命名请求', async () => {
    const { router } = await setup()
    const create = wrapper.findAll('article button').find(button => button.text() === i18n.global.t('projects.newWorkflow'))!
    await create.trigger('click'); await wrapper.get('form input').setValue(' 新的工作流 '); await submit()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    expect(router.currentRoute.value.query).toEqual({ projectId: '1', name: '新的工作流' })
    expect(http.put).not.toHaveBeenCalled()
  })
})


describe('恢复与交错边界', () => {
  it('读取定义等待期间也锁定输入与提交，关闭仍可用', async () => {
    const pending = deferred<Entity>()
    await setup(); await openRename()
    http.get.mockReturnValueOnce(pending.promise)
    await submit(); await submit()
    expect(http.put).not.toHaveBeenCalled()
    expect(wrapper.get('form input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('form [role="status"]').text()).toBe(i18n.global.t('projects.renamingHint'))
    expect(wrapper.get('form button[type="button"]').attributes('disabled')).toBeUndefined()
    await close()
    pending.resolve(copy(entity(101))); await flushPromises()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it.each(['成功', '失败'])('旧%s和finally不能解除重开草稿的等待锁或覆盖提示', async result => {
    const old = deferred<Entity>()
    const current = deferred<Entity>()
    http.put.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await setup(); await openRename(); await submit(); await close()
    await openRename('102', '乙的待保存名称'); await submit()
    expect(http.put).toHaveBeenCalledTimes(2)
    if (result === '成功') old.resolve(persist(101, '甲的新名称'))
    else old.reject(new Error('旧保存失败'))
    await flushPromises()
    expect(wrapper.get('form input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('form [role="status"]').exists()).toBe(true)
    expect(wrapper.find('form [role="alert"]').exists()).toBe(false)
    expect(formName()).toBe('乙的待保存名称')
    await submit()
    expect(http.put).toHaveBeenCalledTimes(2)
    current.resolve(persist(102, '乙的待保存名称')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it('新重命名先成功后旧回执不重开弹框也不抢走项目选择', async () => {
    const old = deferred<Entity>()
    const current = deferred<Entity>()
    http.put.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const { store } = await setup(); await openRename(); await submit(); await close()
    await openRename('102', '乙先确认'); await submit()
    current.resolve(persist(102, '乙先确认')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    old.resolve(persist(101, '甲后确认')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(store.currentProjectId).toBe('2')
    expect(store.projectWorkflows('1')[0]?.name).toBe('甲后确认')
    expect(store.projectWorkflows('2')[0]?.name).toBe('乙先确认')
    expect(componentErrors).toEqual([])
  })

  it('底部关闭按钮同样使旧回执失效，新草稿可立即提交', async () => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    await setup(); await openRename(); await submit()
    await wrapper.findAll('form button[type="button"]')[1]!.trigger('click')
    await openRename('102', '乙的新草稿'); await submit()
    expect(http.put).toHaveBeenCalledTimes(2)
    pending.resolve(persist(101, '甲的新名称')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s等待和结果不确定提示可读，失败保留草稿并释放等待', async locale => {
    const pending = deferred<Entity>()
    http.put.mockReturnValueOnce(pending.promise)
    await setup(); await openRename('101', '尚需确认的名称')
    i18n.global.locale.value = locale
    await submit()
    expect(wrapper.get('form [role="status"]').text()).toBe(i18n.global.t('projects.renamingHint'))
    expect(wrapper.get('form [role="status"]').text()).not.toContain('projects.')
    pending.reject(new Error('无法确认服务端结果')); await flushPromises()
    expect(wrapper.get('form [role="alert"]').text()).toBe(i18n.global.t('projects.renameFailedHint'))
    expect(wrapper.get('form [role="alert"]').text()).not.toContain('projects.')
    expect(wrapper.find('form [role="status"]').exists()).toBe(false)
    expect(wrapper.get('form input').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(formName()).toBe('尚需确认的名称')
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })

  it('读取定义失败后的显式重试可完成保存，首次失败不触发PUT', async () => {
    await setup(); await openRename('101', '重试读取的名称')
    http.get.mockRejectedValueOnce(new Error('定义读取失败'))
    await submit()
    expect(http.put).not.toHaveBeenCalled()
    expect(wrapper.find('form [role="alert"]').exists()).toBe(true)
    await submit()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(entity(101).name).toBe('重试读取的名称')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it.each(['读取', '保存'])('store不吞掉真正的%s失败，也不提前更新名称', async stage => {
    const { store } = await setup()
    const failure = new Error(`${stage}失败`)
    if (stage === '读取') http.get.mockRejectedValueOnce(failure)
    else http.put.mockRejectedValueOnce(failure)
    await expect(store.renameProjectWorkflow('1', '101', '未确认名称')).rejects.toBe(failure)
    expect(store.projectWorkflows('1')[0]?.name).toBe('工作流甲')
    expect(store.projectWorkflows('2')[0]?.name).toBe('工作流乙')
    expect(http.put).toHaveBeenCalledTimes(stage === '读取' ? 0 : 1)
  })

  it('保存后列表重试只读取列表，清除列表提示且不重发PUT', async () => {
    const { store } = await setup(); await openRename('101', '已确认的新名称')
    const originalGet = http.get.getMockImplementation()!
    let unavailable = true
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/projects' && unavailable) throw new Error('列表暂时不可用')
      return originalGet(path, ...rest)
    })
    await submit()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(store.projectWorkflows('1')[0]?.name).toBe('已确认的新名称')
    const retry = wrapper.findAll('main button').find(button => button.text() === i18n.global.t('common.retry'))!
    unavailable = false
    await retry.trigger('click'); await flushPromises()
    expect(store.loadError).toBeNull()
    expect(store.projectWorkflows('1')[0]?.name).toBe('已确认的新名称')
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })

  it('仅工作流列表回读失败也保留已确认名称并关闭保存弹框', async () => {
    const { store } = await setup(); await openRename('101', '部分列表失败仍已保存')
    const originalGet = http.get.getMockImplementation()!
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/workflows/definitions') throw new Error('工作流列表暂时不可用')
      return originalGet(path, ...rest)
    })
    await submit()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(store.loadError).toBe(i18n.global.t('projects.workflowLoadWarning'))
    expect(store.projectWorkflows('1')[0]?.name).toBe('部分列表失败仍已保存')
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })
})

describe('同一工作流的迟到保存回执', () => {
  it('服务端先写A后写B，仅A回执迟到且其列表会失败时，不能回滚已确认的B', async () => {
    const delayedReceipt = deferred<Entity>()
    let receiptA!: Entity
    http.put.mockImplementationOnce(async (path: string, payload: { name: string }) => {
      receiptA = persist(Number(path.split('/').at(-1)), payload.name)
      return delayedReceipt.promise
    })
    const { store } = await setup()
    await openRename('101', '先写入但回执延迟的A'); await submit()
    expect(entity(101).name).toBe('先写入但回执延迟的A')
    await close(); await openRename('101', '后来确认的B'); await submit()
    expect(entity(101).name).toBe('后来确认的B')
    expect(store.projectWorkflows('1')[0]?.name).toBe('后来确认的B')
    expect(wrapper.find('form').exists()).toBe(false)
    const originalGet = http.get.getMockImplementation()!
    const readsBeforeOldReceipt = http.get.mock.calls.length
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/projects') throw new Error('旧保存后的列表不可用')
      return originalGet(path, ...rest)
    })
    delayedReceipt.resolve(receiptA); await flushPromises()
    expect(entity(101).name).toBe('后来确认的B')
    expect(store.projectWorkflows('1')[0]?.name).toBe('后来确认的B')
    expect(http.get.mock.calls.length).toBe(readsBeforeOldReceipt)
    expect(http.put).toHaveBeenCalledTimes(2)
    expect(componentErrors).toEqual([])
  })
})

describe('部分列表回读失败的同项目兄弟', () => {
  it('definitions列表失败时保留projects已给出的兄弟，并且只改目标名称', async () => {
    const { store } = await setup(); await openRename('101', '已确认的甲')
    const originalGet = http.get.getMockImplementation()!
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/workflows/definitions') throw new Error('定义列表暂时不可用')
      if (path === '/projects') return { records: [
        { id: '1', name: '项目甲', scenario: 'media', workflows: [
          { id: '101', name: '项目响应里的旧甲', status: 'draft' },
          { id: '103', name: '仍可获得的兄弟丙', status: 'running' },
        ] },
        projectRows()[1],
      ], total: 2 }
      return originalGet(path, ...rest)
    })
    await submit()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(store.projectWorkflows('1').map(row => ({ id: row.id, name: row.name, status: row.status }))).toEqual([
      { id: '101', name: '已确认的甲', status: 'draft' },
      { id: '103', name: '仍可获得的兄弟丙', status: 'running' },
    ])
    expect(wrapper.find('a[href="/workflows/103"]').exists()).toBe(true)
    expect(store.loadError).toBe(i18n.global.t('projects.workflowLoadWarning'))
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
    http.get.mockImplementation(originalGet)
    await store.loadProjects(); await flushPromises()
    expect(store.projectWorkflows('1').map(row => row.id)).toEqual(['101'])
    expect(store.loadError).toBeNull()
    expect(http.put).toHaveBeenCalledTimes(1)
  })
})

describe('局部恢复关联兼容', () => {
  it('无后端projectId时只补当前项目响应已有兄弟的便利关联', async () => {
    Reflect.deleteProperty(entity(101), 'projectId')
    localStorage.setItem('aetherflow.project.workflowLinks.anonymous', JSON.stringify({ '1': ['101'], '2': ['102'] }))
    const { store } = await setup(); await openRename('101', '已确认的甲')
    const originalGet = http.get.getMockImplementation()!
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/workflows/definitions') throw new Error('定义列表暂时不可用')
      if (path === '/projects') return { records: [
        { id: '1', name: '项目甲', workflows: [
          { id: '101', name: '旧甲', status: 'draft' },
          { id: '103', name: '项目甲的兄弟', status: 'running' },
        ] },
        { id: '2', name: '项目乙', workflows: [{ id: '104', name: '其他项目的嵌入条目', status: 'ready' }] },
      ], total: 2 }
      return originalGet(path, ...rest)
    })
    await submit()
    expect(store.projectWorkflows('1').map(row => row.id)).toEqual(['101', '103'])
    expect(store.projectWorkflows('1').map(row => row.name)).toEqual(['已确认的甲', '项目甲的兄弟'])
    expect(JSON.parse(localStorage.getItem('aetherflow.project.workflowLinks.anonymous')!)).toEqual({ '1': ['101', '103'], '2': ['102'] })
    expect(store.workflowSummaries.some(row => row.id === '104')).toBe(false)
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })

  it('保存结果未带projectId时保留原摘要已有的后端项目ID', async () => {
    const { store } = await setup(); await openRename('101', '已确认的甲')
    const originalGet = http.get.getMockImplementation()!
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/workflows/definitions/101') {
        const row = copy(entity(101)); Reflect.deleteProperty(row, 'projectId'); return row
      }
      if (path === '/workflows/definitions') throw new Error('定义列表暂时不可用')
      return originalGet(path, ...rest)
    })
    await submit()
    expect(store.workflowSummaries.find(row => row.id === '101')?.projectId).toBe(1)
    expect(store.projectWorkflows('1')[0]?.name).toBe('已确认的甲')
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })
})

describe('局部恢复不扩大数据覆盖', () => {
  it('改名只更新目标名称，保留当前项目响应中较新的目标状态', async () => {
    const { store } = await setup(); await openRename('101', '已确认的甲')
    const originalGet = http.get.getMockImplementation()!
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/workflows/definitions') throw new Error('定义列表暂时不可用')
      if (path === '/projects') return { records: [{ id: '1', name: '项目甲', workflows: [
        { id: '101', name: '旧甲', status: 'running' },
      ] }, projectRows()[1]], total: 2 }
      return originalGet(path, ...rest)
    })
    await submit()
    expect(store.projectWorkflows('1')[0]).toMatchObject({ id: '101', name: '已确认的甲', status: 'running' })
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })

  it('成功项目列表已移除目标项目时，不恢复项目或其工作流摘要', async () => {
    const { store } = await setup(); await openRename('101', '已确认的甲')
    const originalGet = http.get.getMockImplementation()!
    http.get.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path === '/workflows/definitions') throw new Error('定义列表暂时不可用')
      if (path === '/projects') return { records: [projectRows()[1]], total: 1 }
      return originalGet(path, ...rest)
    })
    await submit()
    expect(store.projects.map(row => row.id)).toEqual(['2'])
    expect(store.workflowSummaries.some(row => row.id === '101')).toBe(false)
    expect(store.projectWorkflows('1')).toEqual([])
    expect(wrapper.find('form').exists()).toBe(false)
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(componentErrors).toEqual([])
  })
})

describe('保存派发前的读取归属', () => {
  it('A定义读取延迟，B已保存确认后，A旧读取不得再派发PUT回滚服务端名称', async () => {
    const delayedDefinition = deferred<Entity>()
    const { store } = await setup(); await openRename('101', '过时的A名称')
    const readBeforeB = copy(entity(101))
    http.get.mockReturnValueOnce(delayedDefinition.promise)
    await submit()
    expect(http.put).not.toHaveBeenCalled()
    await close(); await openRename('101', '后来确认的B'); await submit()
    expect(entity(101).name).toBe('后来确认的B')
    expect(store.projectWorkflows('1')[0]?.name).toBe('后来确认的B')
    expect(http.put).toHaveBeenCalledTimes(1)
    delayedDefinition.resolve(readBeforeB); await flushPromises()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(entity(101).name).toBe('后来确认的B')
    expect(store.projectWorkflows('1')[0]?.name).toBe('后来确认的B')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })
})
