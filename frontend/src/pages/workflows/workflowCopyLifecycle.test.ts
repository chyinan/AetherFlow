// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { resolveWorkflowNavigation } from '@/test/resolveWorkflowNavigation'
import WorkflowPage from './WorkflowPage.vue'
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(), subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({ currentProject: null, loadProjects: vi.fn(), selectProjectByWorkflow: vi.fn(), updateWorkflowStatus: vi.fn(), linkWorkflowToProject: vi.fn() }) }))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function entity(id: number, label = `Workflow ${id}`) {
  return { id, name: label, version: 1, definitionJson: JSON.stringify({ nodes: [
    { nodeId: 'start', nodeType: 'START', config: { next: 'end', label } },
    { nodeId: 'end', nodeType: 'END', config: {} },
  ] }) }
}
const comfy: Record<string, any> = {
 '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'test.safetensors' } },
 '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a red bird', clip: ['1', 1] } },
 '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
 '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
 '5': { class_type: 'KSampler', inputs: { seed: 1234, steps: 30, cfg: 7.5, sampler_name: 'dpmpp_2m', scheduler: 'normal', denoise: 1, model: ['1',0], positive: ['2',0], negative: ['3',0], latent_image: ['4',0] } },
 '6': { class_type: 'VAEDecode', inputs: { samples: ['5',0], vae: ['1',2] } },
 '7': { class_type: 'SaveImage', inputs: { images: ['6',0], filename_prefix: 'audit' } },
}
const preview = { name: 'Imported', nodes: [
 { nodeId: 'start', nodeType: 'START', config: { next: 'prompt' } },
 { nodeId: 'prompt', nodeType: 'PROMPT', config: { prompt: 'a red bird', negativePrompt: '', stylePreset: 'comfyui-import', next: 'image-generation' } },
 { nodeId: 'image-generation', nodeType: 'IMAGE_GENERATION', config: { provider: 'COMFYUI', mode: 'workflow', checkpoint: 'test.safetensors', workflow: comfy, workflowJson: comfy, promptVariable: 'prompt', negativePromptVariable: 'negativePrompt', next: 'end' } },
 { nodeId: 'end', nodeType: 'END', config: {} },
] }
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear()
  http.get.mockImplementation(async (url: string) => entity(Number(url.split('/').at(-1))))
  http.put.mockImplementation(async (url: string, payload: unknown) => ({ ...entity(Number(url.split('/').at(-1))), definitionJson: JSON.stringify(payload), version: 2 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore(); vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/workflows/:id', component: WorkflowPage }, { path: '/elsewhere', component: { template: '<div>Elsewhere</div>' } }] })
  await router.push('/workflows/101'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true } } })
  await flushPromises(); return { store, router }
}
async function copy() { await wrapper!.get('[data-action="copy-workflow"]').trigger('click'); await flushPromises() }
function graphState(store: ReturnType<typeof useWorkflowStore>) {
  return JSON.stringify({ id: store.workflowId, nodes: store.nodes, edges: store.edges, dirty: store.dirty, past: store.historyPast, future: store.historyFuture })
}
describe('复制工作流的请求归属与编辑恢复', () => {
  it('正常复制保持单飞，成功后打开副本', async () => {
    const { store, router } = await setup()
    const pending = deferred<ReturnType<typeof entity>>(); http.post.mockReturnValueOnce(pending.promise)
    await copy(); await copy()
    expect(http.post).toHaveBeenCalledTimes(1)
    expect(http.post).toHaveBeenCalledWith('/workflows/definitions/101/copy', {}, { source: 'workflow' })
    pending.resolve(entity(201, '副本')); await flushPromises()
    expect(store.workflowId).toBe('201'); expect(router.currentRoute.value.path).toBe('/workflows/201'); expect(store.dirty).toBe(false)
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
  })
  it('复制等待中导航并编辑另一工作流，旧成功不能替换画布或路由', async () => {
    const { store, router } = await setup()
    const pending = deferred<ReturnType<typeof entity>>(); http.post.mockReturnValueOnce(pending.promise)
    await copy(); await router.push('/workflows/102'); await flushPromises()
    store.updateNodeConfig('start', 'label', 'B 未保存'); const before = graphState(store)
    pending.resolve(entity(201)); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/102'); expect(graphState(store)).toBe(before)
  })
  it('复制等待中编辑当前工作流，旧副本不能抹掉编辑和撤销历史', async () => {
    const { store, router } = await setup()
    const pending = deferred<ReturnType<typeof entity>>(); http.post.mockReturnValueOnce(pending.promise)
    await copy(); store.updateNodeConfig('start', 'label', '复制期间新编辑'); const before = graphState(store)
    pending.resolve(entity(201)); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101'); expect(graphState(store)).toBe(before)
  })
  it('复制前保存等待中离开原图，旧保存不得触发复制新图', async () => {
    const { store, router } = await setup(); store.updateNodeConfig('start', 'label', 'A 编辑')
    const pending = deferred<ReturnType<typeof entity>>(); http.put.mockReturnValueOnce(pending.promise)
    http.post.mockResolvedValue(entity(201)); await copy()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102'))
    pending.resolve(entity(101)); await flushPromises()
    expect(http.post).not.toHaveBeenCalled(); expect(store.workflowId).toBe('102'); expect(router.currentRoute.value.path).toBe('/workflows/102')
  })
  it('复制旧请求失败不能污染另一工作流的当前反馈', async () => {
    const { store, router } = await setup()
    const pending = deferred<ReturnType<typeof entity>>(); http.post.mockReturnValueOnce(pending.promise)
    await copy(); await router.push('/workflows/102'); await flushPromises(); store.setRunError('B 当前提示')
    pending.reject(new Error('A 旧复制失败')); await flushPromises()
    expect(store.runError).toBe('B 当前提示'); expect(router.currentRoute.value.path).toBe('/workflows/102')
  })
  it('卸载离开后旧复制成功不能重新打开编辑器', async () => {
    const { store, router } = await setup()
    const pending = deferred<ReturnType<typeof entity>>(); http.post.mockReturnValueOnce(pending.promise)
    await copy(); await router.push('/elsewhere'); await flushPromises(); const before = graphState(store)
    pending.resolve(entity(201)); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere'); expect(graphState(store)).toBe(before)
  })
  it('复制前自动保存期间继续编辑，保留新内容且不发出复制', async () => {
    const { store, router } = await setup(); store.updateNodeConfig('start', 'label', '首次编辑')
    const pending = deferred<ReturnType<typeof entity>>(); http.put.mockReturnValueOnce(pending.promise)
    await copy(); store.updateNodeConfig('start', 'label', '保存期间的新编辑')
    pending.resolve(entity(101)); await flushPromises()
    expect(http.post).not.toHaveBeenCalled(); expect(store.dirty).toBe(true)
    expect(store.nodes[0]!.data.config.label).toBe('保存期间的新编辑')
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(wrapper!.get('[data-action="copy-workflow"]').attributes('disabled')).toBeUndefined()
  })
  it('复制前自动保存失败保留编辑，重试只复制保存成功后的同一图', async () => {
    const { store, router } = await setup(); store.updateNodeConfig('start', 'label', '需要保存')
    http.put.mockRejectedValueOnce(new Error('保存失败'))
    await copy()
    expect(http.post).not.toHaveBeenCalled(); expect(store.dirty).toBe(true)
    expect(store.savingError).toContain('保存失败')
    expect(wrapper!.get('[data-action="copy-workflow"]').attributes('disabled')).toBeUndefined()
    http.post.mockResolvedValueOnce(entity(201)); await copy()
    expect(http.put).toHaveBeenCalledTimes(2)
    expect(http.post).toHaveBeenCalledExactlyOnceWith('/workflows/definitions/101/copy', {}, { source: 'workflow' })
    expect(router.currentRoute.value.path).toBe('/workflows/201'); expect(store.dirty).toBe(false)
  })
  it('当前复制失败后可直接重试，成功打开副本并清除错误', async () => {
    const { store, router } = await setup()
    http.post.mockRejectedValueOnce(new Error('暂时不能复制')); await copy()
    expect(store.runError).toContain('暂时不能复制'); expect(store.workflowId).toBe('101')
    http.post.mockResolvedValueOnce(entity(201)); await copy()
    expect(http.post).toHaveBeenCalledTimes(2); expect(store.runError).toBeNull()
    expect(router.currentRoute.value.path).toBe('/workflows/201')
  })
  it.each(['成功', '失败'] as const)('B 发起新复制后 A 迟到%s不能解除新锁或接管新请求', async outcome => {
    const { store, router } = await setup()
    const a = deferred<ReturnType<typeof entity>>(); const b = deferred<ReturnType<typeof entity>>()
    http.post.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    await copy(); await router.push('/workflows/102'); await flushPromises(); await copy()
    expect(http.post).toHaveBeenCalledTimes(2)
    if (outcome === '成功') a.resolve(entity(201)); else a.reject(new Error('A 旧复制失败'))
    await flushPromises()
    expect(store.workflowId).toBe('102'); expect(store.runError).toBeNull()
    expect(wrapper!.get('[data-action="copy-workflow"]').attributes('disabled')).toBeDefined()
    await copy(); expect(http.post).toHaveBeenCalledTimes(2)
    b.resolve(entity(202)); await flushPromises()
    expect(store.workflowId).toBe('202'); expect(router.currentRoute.value.path).toBe('/workflows/202')
    expect(wrapper!.get('[data-action="copy-workflow"]').attributes('disabled')).toBeUndefined()
  })

  it('复制等待中导入有效 ComfyUI 图，旧复制不能抹掉新导入及其编辑', async () => {
    const { store, router } = await setup()
    const pending = deferred<ReturnType<typeof entity>>()
    http.post.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(preview)
    await copy()
    const input = wrapper!.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'import.json', text: async () => JSON.stringify(comfy) }] })
    await input.trigger('change'); await flushPromises()
    expect(store.nodes.map(node => node.id)).toEqual(['start', 'prompt', 'image-generation', 'end'])
    store.updateNodeConfig('prompt', 'prompt', '导入后的新编辑'); const before = graphState(store)
    pending.resolve(entity(201)); await flushPromises()
    expect(graphState(store)).toBe(before); expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(store.nodes.find(node => node.id === 'image-generation')!.data.config.workflowJson).toEqual(comfy)
  })

  it('较新导航仍在守卫等待时，旧复制回执不能抢走用户的目标', async () => {
    const { store, router } = await setup()
    const copied = deferred<ReturnType<typeof entity>>(); const gate = deferred<boolean>()
    router.beforeEach(to => to.params.id === '102' ? gate.promise : undefined)
    http.post.mockReturnValueOnce(copied.promise); await copy()
    const navigation = router.push('/workflows/102'); await flushPromises()
    copied.resolve(entity(201)); await flushPromises()
    gate.resolve(true); await navigation; await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/102'); expect(store.workflowId).toBe('102')
    expect(http.get.mock.calls.map(([url]) => url)).toEqual(['/workflows/definitions/101', '/workflows/definitions/102'])
  })
  it('自动保存未决时用户打开离开确认，保存回执不能复制或关闭确认', async () => {
    const { store, router } = await setup(); store.updateNodeConfig('start', 'label', '自动保存内容')
    const saving = deferred<ReturnType<typeof entity>>(); http.put.mockReturnValueOnce(saving.promise)
    http.post.mockResolvedValueOnce(entity(201)); await copy()
    const navigation = router.push('/workflows/102'); await flushPromises()
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)
    saving.resolve({ ...entity(101), version: 2 }); await flushPromises()
    expect(http.post).not.toHaveBeenCalled(); expect(router.currentRoute.value.path).toBe('/workflows/101')
    await wrapper!.get('[data-action="leave-discard"]').trigger('click'); await navigation; await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/102')
  })

})
