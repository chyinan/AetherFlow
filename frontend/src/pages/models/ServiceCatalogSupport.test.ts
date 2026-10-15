// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import { useAuthStore } from '@/stores/authStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import ServiceCatalog from './ServiceCatalog.vue'

const api = vi.hoisted(() => ({ capabilities: vi.fn(), write: vi.fn() }))
vi.mock('@/api/modules/ai', () => ({ getWorkflowCapabilities: api.capabilities }))
const snapshot: AiWorkflowCapabilities = { runtimeReachable: true, llmExecutable: true, whisperExecutable: false, llmProviders: ['OLLAMA'], imageProviders: [], supportedNodeTypes: ['LLM', 'WHISPER'], executableNodeTypes: ['LLM'], unavailableReasons: { WHISPER: 'http://internal-host key=sk-secret 用户输入正文' } }
const wrappers: VueWrapper[] = []
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes }); return { promise, resolve } }
function preview() { return document.querySelector<HTMLTextAreaElement>('[data-testid="capability-support-preview"]')!.value }
async function render() {
  const wrapper = mount(ServiceCatalog, { attachTo: document.body, global: { plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  wrappers.push(wrapper); await flushPromises(); return wrapper
}
beforeEach(() => {
  vi.clearAllMocks(); setActivePinia(createPinia()); localStorage.clear(); i18n.global.locale.value = 'zh-CN'
  const auth = useAuthStore(); auth.token = 'test-session'
  auth.user = { id: 'test-user', name: '测试', workspace: '测试空间', role: 'operator', roles: ['operator'], rawRoles: ['USER'] }
  api.capabilities.mockResolvedValue(snapshot); api.write.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: api.write } })
})
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('服务目录安全求助入口', () => {
  it('只为不可用能力提供摘要，原始后端错误不进入预览或剪贴板，也不会再次请求私有数据', async () => {
    const wrapper = await render()
    expect(wrapper.get('[data-service="LLM"]').find('[data-action="open-capability-support"]').exists()).toBe(false)
    await wrapper.get('[data-service="WHISPER"] [data-action="open-capability-support"]').trigger('click'); await flushPromises()
    expect(Object.keys(JSON.parse(preview()))).toEqual(['capability', 'errorCategory', 'time'])
    expect(JSON.parse(preview())).toMatchObject({ capability: 'WHISPER', errorCategory: 'CAPABILITY_UNAVAILABLE' })
    expect(preview()).not.toMatch(/internal-host|sk-secret|用户输入正文/)
    document.querySelector<HTMLButtonElement>('[data-action="copy-capability-support"]')!.click(); await flushPromises()
    expect(api.write).toHaveBeenCalledExactlyOnceWith(preview())
    expect(api.capabilities).toHaveBeenCalledTimes(1)
  })
  it('当前编辑器定位需选择才附上，摘要不包含工作流名称或节点输入', async () => {
    const workflow = useWorkflowStore(); workflow.workflowId = '42'; workflow.workflowName = '私有工作流名称'
    workflow.nodes = [{ id: 'node-llm-1', type: 'workflow', position: { x: 0, y: 0 }, data: { kind: 'llm', label: '私有节点名', description: '', config: { prompt: '私有输入' }, inputs: [], outputs: [], status: 'idle' } }]
    const before = JSON.stringify(workflow.nodes)
    const wrapper = await render()
    await wrapper.get('[data-action="open-capability-support"]').trigger('click'); await flushPromises()
    expect(preview()).not.toContain('workflowId')
    document.querySelector<HTMLInputElement>('[data-field="include-capability-location"]')!.click(); await flushPromises()
    expect(JSON.parse(preview()).workflowId).toBe('42')
    expect(preview()).not.toMatch(/私有|nodeId/)
    expect(JSON.stringify(workflow.nodes)).toBe(before)
  })
  it.each(['failed', 'empty', 'unreachable'] as const)('%s 使用固定安全类别而非后端错误原文', async (state) => {
    if (state === 'failed') api.capabilities.mockRejectedValueOnce(new Error('http://internal sk-secret'))
    if (state === 'empty') api.capabilities.mockResolvedValueOnce({ ...snapshot, supportedNodeTypes: [], executableNodeTypes: [] })
    if (state === 'unreachable') api.capabilities.mockResolvedValueOnce({ ...snapshot, runtimeReachable: false })
    const wrapper = await render()
    await wrapper.get('[data-action="open-capability-support"]').trigger('click'); await flushPromises()
    expect(JSON.parse(preview()).errorCategory).toBe({ failed: 'CHECK_FAILED', empty: 'NOT_REPORTED', unreachable: 'RUNTIME_UNREACHABLE' }[state])
    expect(preview()).not.toMatch(/internal|sk-secret/)
  })
  it('目录刷新关闭旧预览，旧复制回执不能在新快照中显示成功', async () => {
    const pending = deferred<void>(); api.write.mockReturnValueOnce(pending.promise)
    const wrapper = await render()
    await wrapper.get('[data-action="open-capability-support"]').trigger('click'); await flushPromises()
    document.querySelector<HTMLButtonElement>('[data-action="copy-capability-support"]')!.click(); await flushPromises()
    await wrapper.get('[data-testid="refresh-capabilities"]').trigger('click'); await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await wrapper.get('[data-action="open-capability-support"]').trigger('click'); await flushPromises()
    pending.resolve(); await flushPromises()
    expect(document.body.textContent).not.toContain('已复制')
  })
  it.each(['identity', 'unmount'] as const)('%s 清理已打开的求助预览', async (action) => {
    const wrapper = await render()
    await wrapper.get('[data-action="open-capability-support"]').trigger('click'); await flushPromises()
    if (action === 'identity') useAuthStore().user!.id = 'next-user'
    else { wrapper.unmount(); wrappers.splice(wrappers.indexOf(wrapper), 1) }
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
