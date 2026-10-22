import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getNodeConnections: vi.fn(), createNodeConnection: vi.fn(), updateNodeConnection: vi.fn() }))
vi.mock('@/api/modules/nodeConnections', () => mocks)
import type { NodeConnection } from '@/api/modules/nodeConnections'
import { useNodeConnectionStore } from './nodeConnectionStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const saved: NodeConnection = { id: 'saved', name: '原连接', provider: 'COMFYUI', baseUrl: 'http://old:8188', readOnly: false }
const created: NodeConnection = { ...saved, id: 'created', name: '新连接', baseUrl: 'http://new:8188' }

describe('连接目录的全量与局部结果', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getNodeConnections.mockResolvedValue({ connections: [saved] })
    mocks.createNodeConnection.mockResolvedValue(created)
    mocks.updateNodeConnection.mockResolvedValue({ ...created, id: saved.id })
  })

  it('首次目录未完成时创建连接不宣称就绪，目录完成后与局部结果合并去重', async () => {
    const pending = deferred<{ connections: NodeConnection[] }>()
    mocks.getNodeConnections.mockReturnValueOnce(pending.promise)
    const store = useNodeConnectionStore(createPinia())
    const load = store.loadConnections()

    await store.saveConnection(created, null)

    // 目录还没完整，不能宣称就绪，也不能丢掉刚创建的结果。
    expect(store.ready).toBe(false)
    expect(store.connections).toEqual([created])

    pending.resolve({ connections: [saved] })
    await load

    // 已有连接不能因为创建动作而从选项里消失。
    expect(store.connections).toEqual([saved, created])
    expect(store.ready).toBe(true)
  })

  it('目录读取失败后创建连接可以重试补齐目录', async () => {
    const failure = new Error('目录读取失败')
    mocks.getNodeConnections.mockRejectedValueOnce(failure)
    const store = useNodeConnectionStore(createPinia())

    expect(await store.loadConnections()).toBe(false)
    expect(store.ready).toBe(false)
    expect(store.loadError).toBe(failure)

    await store.saveConnection(created, null)
    expect(store.connections).toEqual([created])
    expect(store.ready).toBe(false)

    // 真正的列表重试：补齐完整目录，同时保留刚创建的连接。
    expect(await store.loadConnections()).toBe(true)
    expect(store.connections).toEqual([saved, created])
    expect(store.ready).toBe(true)
    expect(store.loadError).toBeNull()
  })

  it('重复回执按连接 ID 去重，不产生重复选项', async () => {
    const store = useNodeConnectionStore(createPinia())
    await store.loadConnections()

    await store.saveConnection(created, null)
    await store.saveConnection(created, saved.id)

    expect(store.connections.filter((item) => item.id === 'saved')).toHaveLength(1)
    expect(store.connections.filter((item) => item.id === 'created')).toHaveLength(1)
  })

  it('保存后发起的权威 GET 能刷新连接，不被本地结果永久覆盖', async () => {
    const store = useNodeConnectionStore(createPinia())
    await store.loadConnections()
    await store.saveConnection(created, saved.id)

    // 别的标签页修改了同一连接：保存之后发起的刷新必须以服务端为准。
    const updatedByOther: NodeConnection = { ...saved, name: '他处改过', baseUrl: 'http://other:8188' }
    mocks.getNodeConnections.mockResolvedValue({ connections: [updatedByOther] })
    await store.loadConnections()

    expect(store.connections).toEqual([updatedByOther])
  })

  it('保存前发起的旧 GET 不能盖掉刚保存的结果', async () => {
    const stale = deferred<{ connections: NodeConnection[] }>()
    mocks.getNodeConnections.mockReturnValueOnce(stale.promise)
    const store = useNodeConnectionStore(createPinia())
    const loading = store.loadConnections()

    await store.saveConnection(created, saved.id)
    stale.resolve({ connections: [saved] })
    await loading

    // 旧读取不含刚保存的内容，本地结果必须保留。
    expect(store.connections.find((item) => item.id === saved.id)?.name).toBe(created.name)
  })

  it('服务端尚未包含该连接时保留本地结果', async () => {
    const store = useNodeConnectionStore(createPinia())
    await store.loadConnections()
    await store.saveConnection(created, null)

    mocks.getNodeConnections.mockResolvedValue({ connections: [saved] })
    await store.loadConnections()

    expect(store.connections.find((item) => item.id === created.id)).toBeDefined()
  })
})
