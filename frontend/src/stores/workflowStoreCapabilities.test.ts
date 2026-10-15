import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import { unavailableWorkflowCapabilities } from '@/utils/workflowCapability'

const api = vi.hoisted(() => ({ getNodeCatalog: vi.fn(), getWorkflowCapabilities: vi.fn() }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: api.getNodeCatalog }))
vi.mock('@/api/modules/ai', () => ({ getWorkflowCapabilities: api.getWorkflowCapabilities }))
import { useWorkflowStore } from './workflowStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const usable = { ...unavailableWorkflowCapabilities('未配置'), whisperExecutable: true, executableNodeTypes: ['WHISPER'] }
const unavailable = unavailableWorkflowCapabilities('Whisper 未启用')
const availability = (store: ReturnType<typeof useWorkflowStore>) => store.templates.find((item) => item.kind === 'whisper')?.availability
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  api.getNodeCatalog.mockResolvedValue([])
  api.getWorkflowCapabilities.mockResolvedValue(usable)
})
describe('节点能力刷新并发门禁', () => {
  it('后启动的刷新生效后，较早的响应不能覆盖权威能力', async () => {
    const store = useWorkflowStore()
    const old = deferred<AiWorkflowCapabilities>()
    api.getWorkflowCapabilities.mockReturnValueOnce(old.promise)
    const first = store.loadNodeTemplates()
    expect(await store.loadNodeTemplates()).toBe(true)
    old.resolve(unavailable)
    expect(await first).toBe(false)
    expect(availability(store)?.available).toBe(true)
  })
  it('失败时清除历史可用状态并保持 fail-closed', async () => {
    const store = useWorkflowStore()
    await store.loadNodeTemplates()
    api.getWorkflowCapabilities.mockRejectedValueOnce(new Error('服务不可达'))
    expect(await store.loadNodeTemplates()).toBe(false)
    expect(availability(store)).toEqual({ available: false, reason: 'AI capability service unavailable' })
  })
  it.each([null, {}, { ...usable, llmProviders: null }, { ...usable, unavailableReasons: [] }])('损坏的能力成功响应 %j 不保留旧可用标记', async (response) => {
    const store = useWorkflowStore()
    await store.loadNodeTemplates()
    api.getWorkflowCapabilities.mockResolvedValueOnce(response)
    expect(await store.loadNodeTemplates()).toBe(false)
    expect(store.capabilitiesLoaded).toBe(false)
    expect(availability(store)?.available).toBe(false)
  })
  it.each([null, [null], [{ type: 'WHISPER', inputVariables: {} }]])('损坏目录 %j 不阻止能力更新，且目录状态降为未知', async (catalog) => {
    const store = useWorkflowStore()
    await store.loadNodeTemplates()
    api.getNodeCatalog.mockResolvedValueOnce(catalog)
    api.getWorkflowCapabilities.mockResolvedValueOnce(unavailable)
    expect(await store.loadNodeTemplates()).toBe(true)
    expect(store.nodeCatalogLoaded).toBe(false)
    expect(store.capabilitiesLoaded).toBe(true)
    expect(availability(store)?.available).toBe(false)
  })
  it('过期成功不能覆盖较新失败状态', async () => {
    const store = useWorkflowStore()
    const old = deferred<AiWorkflowCapabilities>()
    api.getWorkflowCapabilities.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('服务不可达'))
    const first = store.loadNodeTemplates()
    await store.loadNodeTemplates()
    old.resolve(usable)
    await first
    expect(availability(store)?.available).toBe(false)
  })
  it('关闭或切换节点后，不采纳仍在返回的能力响应', async () => {
    const store = useWorkflowStore()
    api.getWorkflowCapabilities.mockResolvedValueOnce(unavailable)
    await store.loadNodeTemplates()
    const pending = deferred<AiWorkflowCapabilities>()
    api.getWorkflowCapabilities.mockReturnValueOnce(pending.promise)
    let current = true
    const refresh = store.loadNodeTemplates(() => current)
    current = false
    pending.resolve(usable)
    expect(await refresh).toBe(false)
    expect(availability(store)?.available).toBe(false)
  })
  it('不同 Pinia 实例不会互相作废能力请求', async () => {
    const firstStore = useWorkflowStore(createPinia())
    const secondStore = useWorkflowStore(createPinia())
    const pending = deferred<AiWorkflowCapabilities>()
    api.getWorkflowCapabilities.mockReturnValueOnce(pending.promise)
    const first = firstStore.loadNodeTemplates()
    await secondStore.loadNodeTemplates()
    pending.resolve(unavailable)
    expect(await first).toBe(true)
    expect(availability(firstStore)?.available).toBe(false)
    expect(availability(secondStore)?.available).toBe(true)
  })
})
