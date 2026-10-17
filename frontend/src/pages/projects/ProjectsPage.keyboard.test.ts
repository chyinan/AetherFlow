// @vitest-environment jsdom
// 正常单 USER 合成会话；真实页面/store/service/apiClient，底层 Axios 仅内存传输。
// 不验证真实授权。jsdom 不执行原生 Tab 默认导航；这里只验证可取消边界事件和实际 focus/focusin。
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: () => Promise.resolve() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: () => Promise.resolve() }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: () => Promise.resolve() }) }))

import { apiClient, rawAxiosInstance } from '@/api/client/apiClient'
import { tokenManager } from '@/api/client/tokenManager'
import UnsavedNavigationDialog from '@/components/workflow/UnsavedNavigationDialog.vue'
import { i18n } from '@/i18n'
import ProjectsPage from '@/pages/projects/ProjectsPage.vue'
import { useAuthStore } from '@/stores/authStore'
import { useProjectStore } from '@/stores/projectStore'

type Kind = 'project' | 'workflow' | 'rename'
type Row = { id: string; name: string; scenario: string; workflows: unknown[] }
type Call = { method: string; path: string; body: unknown }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const project = (id: string, name: string): Row => ({ id, name, scenario: 'media', workflows: [] })
let wrapper: VueWrapper | undefined
let router: Router | undefined
let calls: Call[]
let componentErrors: unknown[]
let projects: Row[]
let createGate: ReturnType<typeof deferred<Row>> | undefined
let oldAdapter: typeof apiClient.instance.defaults.adapter
let oldRawAdapter: typeof rawAxiosInstance.defaults.adapter
const message = (key: string) => i18n.global.t(`projects.${key}`)
function response(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { config, data: { code: 200, success: true, message: 'ok', data: copy(data) }, status: 200, statusText: 'OK', headers: {} }
}
const transport: AxiosAdapter = async config => {
  const method = (config.method ?? 'get').toUpperCase()
  const path = config.url!
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
  calls.push({ method, path, body: copy(body ?? null) })
  if (method === 'GET' && path === '/projects') return response(config, { records: projects, total: projects.length })
  if (method === 'GET' && path === '/workflows/definitions') return response(config, [
    { id: 101, name: '正常工作流甲', projectId: 1, version: 1, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
  ])
  if (method === 'POST' && path === '/projects') {
    if (!createGate) throw new Error('本审查未授权此内存创建')
    try {
      const result = await createGate.promise
      projects.push(copy(result))
      return response(config, result)
    } catch {
      const result: AxiosResponse = { config, data: { code: 422, success: false, message: '合成创建失败' }, status: 422, statusText: 'Unprocessable Entity', headers: {} }
      throw new AxiosError('合成创建失败', AxiosError.ERR_BAD_REQUEST, config, undefined, result)
    }
  }
  throw new Error(`禁止未预期内存请求 ${method} ${path}`)
}
const form = () => wrapper!.get<HTMLFormElement>('form')
const field = () => form().get<HTMLInputElement>('input')
const headerTrigger = () => wrapper!.get<HTMLButtonElement>('header button')
function triggerFor(kind: Kind) {
  if (kind === 'project') return headerTrigger()
  if (kind === 'rename') return wrapper!.get<HTMLButtonElement>(`a[href="/workflows/101"] button[title="${message('renameWorkflow')}"]`)
  const result = wrapper!.findAll<HTMLButtonElement>('article button').find(node => node.text() === message('newWorkflow'))
  if (!result) throw new Error('没有正常新建工作流按钮')
  return result
}
function key(target: HTMLElement, value: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}
function observe(name: string, extra: Record<string, unknown> = {}) {
  const active = document.activeElement
  const value = {
    name, activeTag: active?.tagName, activeText: active?.textContent?.trim(), activeHtml: active?.outerHTML,
    formCount: wrapper?.findAll('form').length ?? 0,
    focusInForm: wrapper?.findAll('form').some(node => node.element.contains(active)) ?? false,
    bodyOverflow: document.body.style.overflow,
    backgroundHeaderInert: wrapper?.find('header').exists() ? Boolean(wrapper.find('header').element.closest('[inert]')) : false,
    backgroundMainInert: wrapper?.find('main').exists() ? Boolean(wrapper.find('main').element.closest('[inert]')) : false,
    route: router?.currentRoute.value.fullPath,
    calls: copy(calls), componentErrorMessages: componentErrors.map(error => String(error)),
    html: wrapper?.html(), ...extra,
  }
  return value
}
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  tokenManager.setSession({ accessToken: 'synthetic-user-review', user: {
    id: 'project-dialog-user', name: '合成普通用户', role: 'operator', roles: ['operator'], rawRoles: ['USER'], workspace: 'fixture',
  } })
  const auth = useAuthStore()
  expect(auth.user?.rawRoles).toEqual(['USER'])
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/workflows/:id', component: { template: '<main data-testid="workflow-destination" tabindex="-1">受控工作流目的页</main>' } },
  ] })
  await router.push('/projects'); await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n], config: { errorHandler: error => componentErrors.push(error) } } })
  await flushPromises()
  expect(useProjectStore().projects).toHaveLength(1)
  expect(wrapper.find('a[href="/workflows/101"]').exists()).toBe(true)
  return { router, store: useProjectStore() }
}
async function open(kind: Kind) {
  const trigger = triggerFor(kind)
  trigger.element.focus()
  await trigger.trigger('click'); await flushPromises()
  expect(wrapper!.findAll('form')).toHaveLength(1)
  return trigger
}
async function clickClose(which: 'first' | 'last' = 'first') {
  const buttons = form().findAll<HTMLButtonElement>('button[type="button"]')
  const button = which === 'first' ? buttons[0]! : buttons.at(-1)!
  button.element.focus(); await button.trigger('click'); await flushPromises()
}
beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); tokenManager.clearSession()
  i18n.global.locale.value = 'zh-CN'
  document.body.style.overflow = 'auto'
  calls = []; componentErrors = []; projects = [project('1', '正常项目甲')]; createGate = undefined
  oldAdapter = apiClient.instance.defaults.adapter; oldRawAdapter = rawAxiosInstance.defaults.adapter
  apiClient.instance.defaults.adapter = transport; rawAxiosInstance.defaults.adapter = transport
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('本审查禁止真实 fetch') }))
})
afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined; router = undefined
  await flushPromises()
  apiClient.instance.defaults.adapter = oldAdapter; rawAxiosInstance.defaults.adapter = oldRawAdapter
  tokenManager.clearSession(); document.body.replaceChildren(); document.body.style.overflow = ''
  vi.unstubAllGlobals(); vi.restoreAllMocks()
})

describe.each(['project', 'workflow', 'rename'] as const)('%s 普通 USER 弹框的键盘闭环', kind => {
  it('打开后焦点进入表单，字段可聚焦，背景被隔离且滚动锁定', async () => {
    await setup(); const opener = await open(kind)
    const entered = form().element.contains(document.activeElement)
    const remainedOnOpenerInitially = document.activeElement === opener.element
    field().element.focus()
    const fieldFocused = document.activeElement === field().element
    headerTrigger().element.focus()
    const result = observe(`${kind}-opened-background-attempt`, { entered, fieldFocused, remainedOnOpenerInitially })
    expect.soft(entered).toBe(true)
    expect.soft(fieldFocused).toBe(true)
    expect.soft(result.focusInForm).toBe(true)
    expect.soft(result.backgroundHeaderInert).toBe(true)
    expect.soft(result.backgroundMainInert).toBe(true)
    expect.soft(result.bodyOverflow).toBe('hidden')
  })

  it('末项 Tab 和首项 Shift+Tab 均循环且消费边界事件', async () => {
    await setup(); await open(kind)
    const first = form().get<HTMLButtonElement>('button[type="button"]')
    const last = form().get<HTMLButtonElement>('button[type="submit"]')
    last.element.focus(); const forward = key(last.element, 'Tab'); await flushPromises()
    const forwardReturned = document.activeElement === first.element
    first.element.focus(); const backward = key(first.element, 'Tab', true); await flushPromises()
    const backwardReturned = document.activeElement === last.element
    observe(`${kind}-tab-boundaries`, { forwardReturned, backwardReturned, forwardPrevented: forward.defaultPrevented, backwardPrevented: backward.defaultPrevented })
    expect.soft(forwardReturned).toBe(true)
    expect.soft(backwardReturned).toBe(true)
    expect.soft(forward.defaultPrevented).toBe(true)
    expect.soft(backward.defaultPrevented).toBe(true)
  })

  it('字段内 Escape 关闭且焦点恢复原触发器，路由和请求不被改变', async () => {
    const { router } = await setup(); const opener = await open(kind)
    const beforeCalls = copy(calls)
    field().element.focus(); const event = key(field().element, 'Escape'); await flushPromises()
    observe(`${kind}-escape`, { defaultPrevented: event.defaultPrevented, restored: document.activeElement === opener.element })
    expect.soft(wrapper!.find('form').exists()).toBe(false)
    expect.soft(document.activeElement).toBe(opener.element)
    expect.soft(event.defaultPrevented).toBe(true)
    expect.soft(router.currentRoute.value.fullPath).toBe('/projects')
    expect.soft(calls).toEqual(beforeCalls)
  })

  it('顶部及底部关闭都恢复原触发器，重复打开不留下旧焦点锁', async () => {
    await setup(); const opener = await open(kind)
    await clickClose('first'); const topRestored = document.activeElement === opener.element
    await open(kind); await clickClose('last'); const bottomRestored = document.activeElement === opener.element
    observe(`${kind}-two-close-controls`, { topRestored, bottomRestored })
    expect.soft(wrapper!.find('form').exists()).toBe(false)
    expect.soft(topRestored).toBe(true)
    expect.soft(bottomRestored).toBe(true)
    expect.soft(document.body.style.overflow).toBe('auto')
    expect.soft(componentErrors).toEqual([])
  })

  it('表单有对应的具名模态语义，长表单保留视口内滚动入口', async () => {
    await setup(); await open(kind)
    const dialog = form()
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('tabindex')).toBe('-1')
    const title = document.getElementById(dialog.attributes('aria-labelledby') ?? '')
    const hint = document.getElementById(dialog.attributes('aria-describedby') ?? '')
    expect(title?.textContent?.trim()).toBe(kind === 'project' ? message('createProjectTitle') : kind === 'rename' ? message('renameWorkflow') : message('createWorkflowTitle'))
    expect(hint?.textContent?.trim()).toBe(message(kind === 'project' ? 'createPanelHint' : 'workflowPanelHint'))
    expect(dialog.classes()).toContain('overflow-y-auto')
    expect(dialog.classes()).toContain('max-h-[calc(100dvh-2rem)]')
  })
})

describe('请求交错与既有闭环对照，不重报已修代次问题', () => {
  it.each(['success', 'failure'] as const)('按钮关闭后改开工作流，旧项目创建 %s 不接管新弹框或当前焦点', async outcome => {
    createGate = deferred<Row>()
    await setup(); await open('project'); await field().setValue('等待项目')
    await form().trigger('submit'); await flushPromises()
    expect(calls.filter(call => call.method === 'POST')).toEqual([expect.objectContaining({ path: '/projects', body: expect.objectContaining({ name: '等待项目' }) })])
    expect(field().attributes('disabled')).toBeDefined()
    await clickClose(); await open('workflow'); await field().setValue('保留的新工作流')
    field().element.focus(); const currentField = field().element
    if (outcome === 'success') createGate.resolve(project('created', '等待项目'))
    else createGate.reject(new Error('受控旧创建失败'))
    await flushPromises()
    observe(`button-close-old-${outcome}-new-workflow`, { currentFocusPreserved: document.activeElement === currentField })
    expect(wrapper!.findAll('form')).toHaveLength(1)
    expect(field().element.value).toBe('保留的新工作流')
    expect(document.activeElement).toBe(currentField)
    expect(form().find('[role="alert"]').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it('当前创建失败提示保留草稿，Escape 仍能关闭并恢复原触发器', async () => {
    createGate = deferred<Row>()
    await setup(); const opener = await open('project'); await field().setValue('失败草稿')
    await form().trigger('submit'); await flushPromises()
    createGate.reject(new Error('受控当前失败')); await flushPromises()
    expect(form().find('[role="alert"]').exists()).toBe(true)
    expect(field().element.value).toBe('失败草稿')
    field().element.focus(); const event = key(field().element, 'Escape'); await flushPromises()
    observe('current-create-failure-escape', { restored: document.activeElement === opener.element, defaultPrevented: event.defaultPrevented })
    expect.soft(wrapper!.find('form').exists()).toBe(false)
    expect.soft(document.activeElement).toBe(opener.element)
    expect.soft(event.defaultPrevented).toBe(true)
    expect.soft(calls.filter(call => call.method === 'POST')).toHaveLength(1)
    expect.soft(componentErrors).toEqual([])
  })

  it('创建等待时 Escape 关闭，旧成功不关闭后来新建工作流也不偷焦点', async () => {
    createGate = deferred<Row>()
    await setup(); const opener = await open('project'); await field().setValue('仍在服务端等待')
    await form().trigger('submit'); await flushPromises()
    const close = form().get<HTMLButtonElement>('button[type="button"]')
    close.element.focus(); const event = key(close.element, 'Escape'); await flushPromises()
    const escaped = !wrapper!.find('form').exists()
    const restored = document.activeElement === opener.element
    // 基线即便 Escape 无效，也先安全关闭再结清受控旧请求，避免留下悬空状态。
    if (!escaped) await clickClose()
    await open('workflow'); await field().setValue('等待后的新草稿'); field().element.focus()
    const currentField = field().element
    createGate.resolve(project('pending-created', '仍在服务端等待')); await flushPromises()
    observe('pending-create-escape-then-new-workflow', { escaped, restored, defaultPrevented: event.defaultPrevented, currentFocusPreserved: document.activeElement === currentField })
    expect.soft(escaped).toBe(true)
    expect.soft(restored).toBe(true)
    expect.soft(event.defaultPrevented).toBe(true)
    expect.soft(field().element.value).toBe('等待后的新草稿')
    expect.soft(document.activeElement).toBe(currentField)
    expect.soft(calls.filter(call => call.method === 'POST')).toHaveLength(1)
    expect.soft(componentErrors).toEqual([])
  })

  it('正常新建工作流只导航到带项目和裁剪名称的编辑目的页，卸载后可重入', async () => {
    const { router } = await setup(); await open('workflow'); await field().setValue('  正常编辑草稿  ')
    await form().trigger('submit'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    expect(router.currentRoute.value.query).toEqual({ projectId: '1', name: '正常编辑草稿' })
    expect(wrapper!.find('[data-testid="workflow-destination"]').exists()).toBe(true)
    expect(wrapper!.find('form').exists()).toBe(false)
    expect(document.body.style.overflow).toBe('auto')
    expect(calls.filter(call => call.method !== 'GET')).toEqual([])
    await router.push('/projects'); await flushPromises(); await open('workflow')
    observe('workflow-navigation-reentry-control')
    expect(field().element.value).toBe(`正常项目甲${message('workflowSuffix')}`)
    expect(componentErrors).toEqual([])
  })

  it('同环境既有未保存导航弹框能循环/Escape/恢复，证明DOM事件对照可工作', async () => {
    const Control = defineComponent({ components: { UnsavedNavigationDialog }, setup() { return { opened: ref(false) } }, template: '<button data-testid="control-opener" @click="opened = true">对照打开</button><UnsavedNavigationDialog :open="opened" :busy="false" error="" @stay="opened = false" />' })
    wrapper = mount(Control, { attachTo: document.body, global: { plugins: [i18n] } })
    const opener = wrapper.get<HTMLButtonElement>('[data-testid="control-opener"]')
    opener.element.focus(); await opener.trigger('click'); await flushPromises()
    const dialog = new DOMWrapper<HTMLElement>(document.querySelector<HTMLElement>('[data-testid="unsaved-navigation-dialog"]')!)
    const first = dialog.get<HTMLButtonElement>('[data-action="leave-stay"]')
    const last = dialog.get<HTMLButtonElement>('[data-action="leave-discard"]')
    expect(document.activeElement).toBe(first.element)
    expect(document.body.style.overflow).toBe('hidden')
    expect(key(first.element, 'Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last.element)
    expect(key(last.element, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first.element)
    opener.element.focus(); expect(document.activeElement).toBe(first.element)
    expect(key(first.element, 'Escape').defaultPrevented).toBe(true)
    await flushPromises()
    observe('existing-unsaved-dialog-keyboard-control', { restored: document.activeElement === opener.element })
    expect(document.querySelector('[data-testid="unsaved-navigation-dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener.element)
    expect(document.body.style.overflow).toBe('auto')
  })
})


describe('项目弹框焦点清理与动态可用项', () => {
  it('项目创建等待时禁用字段不进入边界循环，两个关闭入口仍可操作', async () => {
    createGate = deferred<Row>()
    await setup(); const opener = await open('project'); await form().trigger('submit'); await flushPromises()
    const buttons = form().findAll<HTMLButtonElement>('button[type="button"]')
    const first = buttons[0]!; const last = buttons.at(-1)!
    expect(field().attributes('disabled')).toBeDefined()
    first.element.focus()
    expect(key(first.element, 'Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last.element)
    expect(key(last.element, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first.element)
    expect(key(first.element, 'Escape').defaultPrevented).toBe(true); await flushPromises()
    expect(document.activeElement).toBe(opener.element)
    createGate.resolve(project('waiting-created', '等待创建')); await flushPromises()
    expect(wrapper!.find('form').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it('弹框打开时离页释放滚动与键盘监听，返回后仍可重新进入', async () => {
    const { router } = await setup(); await open('workflow')
    expect(document.body.style.overflow).toBe('hidden')
    await router.push('/workflows/101'); await flushPromises()
    expect(document.body.style.overflow).toBe('auto')
    const destination = wrapper!.get<HTMLElement>('[data-testid="workflow-destination"]')
    destination.element.focus()
    expect(key(destination.element, 'Escape').defaultPrevented).toBe(false)
    expect(key(destination.element, 'Tab').defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(destination.element)
    await router.push('/projects'); await flushPromises(); await open('project')
    expect(form().element.contains(document.activeElement)).toBe(true)
    await clickClose()
    expect(document.body.style.overflow).toBe('auto')
    expect(componentErrors).toEqual([])
  })
})
