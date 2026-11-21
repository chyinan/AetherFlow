// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TextDecoder, TextEncoder } from 'node:util'
import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { apiClient } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), listWorkflowTemplates: vi.fn(), saveWorkflow: vi.fn(), startRun: vi.fn() }))
vi.mock('@/services/api/workflowApi', async original => ({ ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(), subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({ currentProject: null, projects: [], projectWorkflows: vi.fn(), loadProjects: vi.fn(), selectProjectByWorkflow: vi.fn(), updateWorkflowStatus: vi.fn(), linkWorkflowToProject: vi.fn() }) }))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function definition(id: string): WorkflowDefinition {
  return { id, name: `工作流 ${id}`, backendDefinitionId: Number(id) || undefined, backendVersion: 1,
    nodes: [{ id: `start-${id}`, type: 'workflow', position: { x: 0, y: 0 }, data: { label: '开始', kind: 'start', description: '', status: 'idle', config: { prompt: '原始输入' }, inputs: [], outputs: ['output'] } }], edges: [] }
}
let wrapper: ReturnType<typeof mount> | undefined
let errors: unknown[]
beforeEach(() => {
  vi.resetAllMocks()
  errors = []
  vi.stubGlobal('TextDecoder', TextDecoder)
  i18n.global.locale.value = 'zh-CN'
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.listWorkflowTemplates.mockImplementation(async () => [definition('sample')])
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => workflow)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function setup(path = '/workflows/101') {
  const pinia = createPinia(); setActivePinia(pinia); const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/elsewhere', component: { template: '<p>其他页面</p>' } },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n],
    config: { errorHandler: error => errors.push(error) },
    stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true, RunNodeRecoveryBanner: true, teleport: true },
  } })
  await flushPromises()
  return { store, router }
}
const templatesButton = () => wrapper!.get<HTMLButtonElement>('[data-action="workflow-templates"]')
const templateDialog = () => wrapper!.find('[aria-labelledby="workflow-template-title"]')
const templateLoadError = () => wrapper!.find('[data-testid="workflow-template-load-error"]')
const workflowButton = (key: string) => wrapper!.findAll('button').find(button => button.text() === i18n.global.t(`workflow.${key}`))!
async function openTemplates() { await templatesButton().trigger('click'); await flushPromises() }
async function selectTemplate() {
  await templateDialog().findAll('button').find(button => button.text().includes('工作流 sample'))!.trigger('click')
  await flushPromises()
}

describe('模板加载与应用的当前页交互', () => {
  it('等待同一请求期间重复点击只发一次请求', async () => {
    await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await templatesButton().trigger('click'); await templatesButton().trigger('click')
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(1)
    expect(templatesButton().attributes('disabled')).toBeDefined()
    pending.resolve([definition('sample')]); await flushPromises()
    expect(templateDialog().exists()).toBe(true)
    expect(errors).toEqual([])
  })
  it('当前请求失败可重试并应用模板，关闭后可重开且拒绝丢弃保留草稿', async () => {
    const { store } = await setup()
    api.listWorkflowTemplates.mockRejectedValueOnce(new Error('当前模板请求失败'))
    await openTemplates()
    expect(wrapper!.text()).toContain('当前模板请求失败')
    expect(templatesButton().attributes('disabled')).toBeUndefined()
    await openTemplates(); await selectTemplate()
    expect(store.workflowId).toBe('new'); expect(store.dirty).toBe(true)
    expect(store.workflowName).toBe('工作流 sample'); expect(templateDialog().exists()).toBe(false)
    store.updateNodeConfig('start-sample', 'prompt', '保留的修改')
    await openTemplates(); vi.mocked(window.confirm).mockReturnValue(false); await selectTemplate()
    expect(templateDialog().exists()).toBe(true)
    expect(store.nodes[0]!.data.config.prompt).toBe('保留的修改')
    await templateDialog().get('button').trigger('click')
    expect(templateDialog().exists()).toBe(false)
    expect(errors).toEqual([])
  })
  it('同一画布打开模板时保留先前的启动失败，成功打开或关闭选择器也不清除它', async () => {
    const { store } = await setup()
    api.startRun.mockRejectedValueOnce(new Error('启动请求尚未确认'))
    await workflowButton('run').trigger('click'); await flushPromises()
    expect(api.startRun).toHaveBeenCalledTimes(1)
    const originalRunError = store.runError
    expect(originalRunError).toContain('启动请求尚未确认')
    const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates()
    expect(store.runError).toBe(originalRunError)
    expect(wrapper!.text()).toContain('启动请求尚未确认')
    pending.resolve([definition('sample')]); await flushPromises()
    expect(templateDialog().exists()).toBe(true)
    await templateDialog().get('button').trigger('click'); await flushPromises()
    expect(wrapper!.text()).toContain('启动请求尚未确认')
    expect(store.workflowId).toBe('101')
  })
  it('模板迟到失败不覆盖同一画布上较新的启动失败', async () => {
    const { store } = await setup()
    const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates()
    api.startRun.mockRejectedValueOnce(new Error('稍后启动失败'))
    await workflowButton('run').trigger('click'); await flushPromises()
    expect(api.startRun).toHaveBeenCalledTimes(1)
    const currentRunError = store.runError
    expect(currentRunError).toContain('稍后启动失败')
    pending.reject(new Error('模板服务暂不可用')); await flushPromises()
    expect(store.runError).toBe(currentRunError)
    expect(wrapper!.text()).toContain('稍后启动失败')
    expect(templateLoadError().text()).toContain('模板服务暂不可用')
    expect(templateDialog().exists()).toBe(false)
  })
  it('已有保存错误时模板失败仍可见，重试保留当前画布和保存提示', async () => {
    const { store } = await setup()
    store.updateNodeConfig('start-101', 'prompt', '必须保留的编辑')
    await flushPromises()
    api.saveWorkflow.mockRejectedValueOnce({ status: 422, message: '保存被服务端拒绝' })
    await workflowButton('saveWorkflow').trigger('click'); await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    const saveError = store.savingError
    expect(saveError).toContain('保存被服务端拒绝')
    api.listWorkflowTemplates.mockRejectedValueOnce({
      name: 'ApiError', message: '模板目录临时不可用', traceId: 'templates-retry-test', status: 503,
    })
    const opener = templatesButton()
    opener.element.focus()
    await openTemplates()
    expect(templateLoadError().attributes('role')).toBe('alert')
    expect(templateLoadError().text()).toContain('模板加载失败: 模板目录临时不可用 · traceId=templates-retry-test')
    expect(opener.attributes('aria-describedby')).toBe(templateLoadError().attributes('id'))
    expect(opener.text()).toBe('重试加载模板')
    expect(document.activeElement).toBe(opener.element)
    expect(wrapper!.text()).toContain('保存被服务端拒绝')
    expect(store.runError).toBeNull()
    const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await opener.trigger('click')
    expect(opener.text()).toBe('正在重试加载模板…')
    expect(opener.attributes('disabled')).toBeDefined()
    expect(opener.attributes('aria-describedby')).toBeUndefined()
    expect(templateLoadError().exists()).toBe(false)
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(2)
    pending.resolve([definition('sample')]); await flushPromises()
    expect(templateDialog().text()).toContain('工作流 sample')
    expect(templateLoadError().exists()).toBe(false)
    expect(store.savingError).toBe(saveError)
    expect(store.nodes[0]!.data.config.prompt).toBe('必须保留的编辑')
    expect(store.dirty).toBe(true)
    await templateDialog().get('button').trigger('click'); await flushPromises()
    expect(document.activeElement).toBe(opener.element)
    expect(opener.text()).toBe('工作流模板')
  })
  it('切换工作流时清除当前模板错误和重试标签，正常空目录也不呈现为错误', async () => {
    const { router } = await setup()
    api.listWorkflowTemplates.mockRejectedValueOnce(new Error('旧工作流的模板错误'))
    await openTemplates()
    expect(templateLoadError().exists()).toBe(true)
    await router.push('/workflows/102'); await flushPromises()
    expect(templateLoadError().exists()).toBe(false)
    expect(templatesButton().text()).toBe('工作流模板')
    api.listWorkflowTemplates.mockResolvedValueOnce([])
    await openTemplates()
    expect(templateDialog().text()).toContain('暂无可用模板。')
    expect(templateLoadError().exists()).toBe(false)
  })
  it('拒绝导航后原页请求仍可正常完成', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); store.updateNodeConfig('start-101', 'prompt', '未保存')
    const navigation = router.push('/workflows/102'); await flushPromises()
    await wrapper!.get('[data-action="leave-stay"]').trigger('click'); await navigation; await flushPromises()
    pending.resolve([definition('sample')]); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(templateDialog().exists()).toBe(true)
    expect(store.nodes[0]!.data.config.prompt).toBe('未保存')
  })
})

describe('模板加载的页面与请求归属', () => {
  it('切到另一工作流后旧成功不自动弹出模板选择器', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/workflows/102'); await flushPromises()
    expect(store.workflowId).toBe('102'); expect(templateDialog().exists()).toBe(false)
    pending.resolve([definition('sample')]); await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(templateDialog().exists()).toBe(false)
  })
  it('切到另一工作流后旧失败不覆盖新工作流的真实错误', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/workflows/102'); await flushPromises()
    store.setRunError('工作流 B 当前运行失败')
    pending.reject(new Error('工作流 A 迟到模板错误')); await flushPromises()
    expect(store.runError).toBe('工作流 B 当前运行失败')
    expect(wrapper!.text()).not.toContain('工作流 A 迟到模板错误')
  })
  it('已打开的模板弹框在换工作流后退出', async () => {
    const { store, router } = await setup(); await openTemplates()
    expect(templateDialog().exists()).toBe(true)
    await router.push('/workflows/102'); await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(templateDialog().exists()).toBe(false)
  })
  it('离页重入后可以发起新的模板请求，不被旧页请求的忙碌状态锁住', async () => {
    const { router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/elsewhere'); await flushPromises()
    await router.push('/workflows/102'); await flushPromises()
    const remainsDisabled = templatesButton().attributes('disabled') !== undefined
    await templatesButton().trigger('click'); await flushPromises()
    const requests = api.listWorkflowTemplates.mock.calls.length
    pending.resolve([definition('sample')]); await flushPromises()
    expect(remainsDisabled).toBe(false)
    expect(requests).toBe(2)
  })
  it('卸载重入后旧失败不能写入新页面错误', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/elsewhere'); await flushPromises()
    await router.push('/workflows/102'); await flushPromises()
    pending.reject(new Error('已经卸载的旧页模板错误')); await flushPromises()
    expect(store.runError).toBeNull()
    expect(wrapper!.text()).not.toContain('已经卸载的旧页模板错误')
  })
})


describe('模板请求代次与拒绝导航的对照', () => {
  it.each(['成功', '失败'] as const)('旧请求迟到%s不能覆盖新列表或解锁新请求', async (outcome) => {
    const { store, router } = await setup()
    const oldRequest = deferred<WorkflowDefinition[]>()
    const newRequest = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    await openTemplates(); await router.push('/workflows/102'); await flushPromises()
    await openTemplates()
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(2)
    expect(store.workflowTemplatesLoading).toBe(true)
    if (outcome === '成功') oldRequest.resolve([definition('old-template')])
    else oldRequest.reject(new Error('旧模板请求失败'))
    await flushPromises()
    expect(store.workflowTemplatesLoading).toBe(true)
    expect(store.workflowTemplatesError).toBeNull()
    expect(store.runError).toBeNull()
    expect(store.workflowTemplates).toEqual([])
    expect(templateDialog().exists()).toBe(false)
    newRequest.resolve([definition('new-template')]); await flushPromises()
    expect(store.workflowTemplatesLoading).toBe(false)
    expect(store.workflowTemplates.map(item => item.id)).toEqual(['new-template'])
    expect(templateDialog().text()).toContain('工作流 new-template')
    expect(templateDialog().text()).not.toContain('工作流 old-template')
    expect(errors).toEqual([])
  })
  it('已开弹框遇到被拒绝导航仍保留当前选择上下文', async () => {
    const { store, router } = await setup()
    store.updateNodeConfig('start-101', 'prompt', '未保存')
    await openTemplates()
    const navigation = router.push('/workflows/102'); await flushPromises()
    await wrapper!.get('[data-action="leave-stay"]').trigger('click'); await navigation; await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(templateDialog().exists()).toBe(true)
    expect(store.nodes[0]!.data.config.prompt).toBe('未保存')
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(1)
  })
})

const comfyJson = JSON.stringify({
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'test.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: '测试提示词', clip: ['1', 1] } },
  '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
  '5': { class_type: 'KSampler', inputs: { seed: 1, steps: 15, cfg: 7, sampler_name: 'euler',
    scheduler: 'normal', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: '测试' } },
})
function importedWorkflow(): WorkflowDefinitionDTO {
  return { name: '新导入的图片工作流', nodes: [
    { nodeId: 'import-start', nodeType: 'START', config: { next: 'prompt' } },
    { nodeId: 'prompt', nodeType: 'PROMPT', config: { prompt: '测试提示词', stylePreset: 'comfyui-import', next: 'image' } },
    { nodeId: 'image', nodeType: 'IMAGE_GENERATION', config: { provider: 'COMFYUI', mode: 'workflow', workflowJson: comfyJson, next: 'end' } },
    { nodeId: 'end', nodeType: 'END', config: {} },
  ] }
}

async function chooseComfyFile() {
  const opener = wrapper!.get<HTMLButtonElement>('[data-action="import-comfyui"]')
  opener.element.focus()
  await opener.trigger('click')
  const input = wrapper!.get<HTMLInputElement>('input[type="file"]')
  const file = new File([comfyJson], 'illustration.json', { type: 'application/json' })
  vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new TextEncoder().encode(comfyJson).buffer as ArrayBuffer)
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
  return opener.element
}

describe('同一地址中导入 ComfyUI 替换当前画布', () => {
  it.each(['成功', '失败'] as const)('已被替换画布的模板请求迟到%s不抢焦点、不覆盖错误', async (result) => {
    const { store, router } = await setup()
    const old = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(old.promise)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(importedWorkflow())
    await openTemplates()
    const focused = await chooseComfyFile()
    expect(errors).toEqual([])
    expect(post).toHaveBeenCalledExactlyOnceWith('/workflows/definitions/import/comfyui',
      expect.objectContaining({ name: 'illustration', workflowJson: comfyJson }), { source: 'workflow' })
    expect(store.workflowName).toBe('新导入的图片工作流')
    expect(store.dirty).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101')
    store.setRunError('新画布的真实运行错误')
    focused.focus()
    expect(document.activeElement).toBe(focused)

    if (result === '成功') old.resolve([definition('old-template')])
    else old.reject(new Error('上一张画布的模板错误'))
    await flushPromises()

    expect(templateDialog().exists()).toBe(false)
    expect(document.activeElement).toBe(focused)
    expect(store.runError).toBe('新画布的真实运行错误')
    expect(store.workflowTemplates).toEqual([])
    expect(store.workflowTemplatesError).toBeNull()
    expect(wrapper!.text()).not.toContain('上一张画布的模板错误')
    expect(errors).toEqual([])
  })
  it('同为 new 的画布替换后可立即重开模板，旧收尾不能影响新列表', async () => {
    const { store, router } = await setup('/workflows/new?name=现有草稿')
    const oldPath = router.currentRoute.value.fullPath
    expect(store.workflowId).toBe('new')
    const old = deferred<WorkflowDefinition[]>()
    const current = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(importedWorkflow())
    await openTemplates()
    await chooseComfyFile()

    expect(errors).toEqual([])
    expect(store.workflowId).toBe('new')
    expect(store.workflowName).toBe('新导入的图片工作流')
    expect(router.currentRoute.value.fullPath).toBe(oldPath)
    expect(templatesButton().attributes('disabled')).toBeUndefined()
    await openTemplates()
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(2)
    old.resolve([definition('old-template')])
    await flushPromises()
    expect(store.workflowTemplatesLoading).toBe(true)
    expect(templateDialog().exists()).toBe(false)
    current.resolve([definition('new-template')])
    await flushPromises()
    expect(templateDialog().text()).toContain('工作流 new-template')
    expect(templateDialog().text()).not.toContain('工作流 old-template')
    expect(store.workflowName).toBe('新导入的图片工作流')
  })
  it('转换完成前已显示的旧选择器，在导入成功替换画布后退出', async () => {
    const { store } = await setup()
    const templates = deferred<WorkflowDefinition[]>()
    const conversion = deferred<WorkflowDefinitionDTO>()
    api.listWorkflowTemplates.mockReturnValueOnce(templates.promise)
    vi.spyOn(apiClient, 'post').mockReturnValueOnce(conversion.promise)
    await openTemplates()
    await chooseComfyFile()
    templates.resolve([definition('sample')]); await flushPromises()
    const dialog = templateDialog()
    expect(dialog.exists()).toBe(true)
    expect(dialog.element.contains(document.activeElement)).toBe(true)

    conversion.resolve(importedWorkflow()); await flushPromises()
    expect(store.workflowName).toBe('新导入的图片工作流')
    expect(templateDialog().exists()).toBe(false)
    expect(document.activeElement).toBe(templatesButton().element)
  })
  it.each(['转换失败', '拒绝替换'] as const)('%s不改变原图，原模板请求仍可完成', async (outcome) => {
    const { store } = await setup()
    const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    const post = vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('转换暂不可用'))
    await openTemplates()
    if (outcome === '拒绝替换') {
      store.updateNodeConfig('start-101', 'prompt', '必须保留的修改')
      vi.mocked(window.confirm).mockReturnValue(false)
    }
    await chooseComfyFile()

    if (outcome === '转换失败') {
      expect(post).toHaveBeenCalledTimes(1)
      expect(wrapper!.text()).toContain('转换暂不可用')
    } else {
      expect(post).not.toHaveBeenCalled()
      expect(store.nodes[0]!.data.config.prompt).toBe('必须保留的修改')
    }
    expect(templatesButton().attributes('disabled')).toBeDefined()
    expect(store.workflowName).toBe('工作流 101')
    pending.resolve([definition('sample')]); await flushPromises()
    expect(templateDialog().text()).toContain('工作流 sample')
  })
})
