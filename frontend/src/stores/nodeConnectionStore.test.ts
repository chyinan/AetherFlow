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

describe('连接目录与保存请求归属', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getNodeConnections.mockResolvedValue({ connections: [saved] })
    mocks.createNodeConnection.mockResolvedValue(created)
    mocks.updateNodeConnection.mockResolvedValue({ ...created, id: saved.id })
  })

  it('写请求锁在 action 内防重，不能依赖按钮禁用', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const store = useNodeConnectionStore(createPinia())
    const first = store.saveConnection(created, null)
    expect(await store.saveConnection(created, null)).toBeNull()
    expect(await store.saveConnection(created, saved.id)).toBeNull()
    expect(mocks.createNodeConnection).toHaveBeenCalledTimes(1)
    expect(mocks.updateNodeConnection).not.toHaveBeenCalled()
    pending.resolve(created); await first
    expect(store.connections).toEqual([created]); expect(store.pendingSave).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)('保存后旧目录 %s 都不能覆盖已保存记录', async (completion) => {
    const pending = deferred<{ connections: NodeConnection[] }>(); mocks.getNodeConnections.mockReturnValueOnce(pending.promise)
    const store = useNodeConnectionStore(createPinia()); const load = store.loadConnections()
    await store.saveConnection(created, null)
    if (completion === 'resolve') pending.resolve({ connections: [saved] })
    else pending.reject(new Error('过期读取错误'))
    if (completion === 'resolve') {
      // 旧目录结果与局部保存结果合并去重：已保存的连接不会被覆盖，已有连接也不会消失。
      expect(await load).toBe(true)
      expect(store.connections).toEqual([saved, created])
      expect(store.loadError).toBeNull()
      expect(store.ready).toBe(true); expect(store.loading).toBe(false)
    } else {
      // 目录没读成功时不能宣称就绪，错误要留给用户重试，局部结果仍然保留。
      expect(await load).toBe(false)
      expect(store.connections).toEqual([created])
      expect(store.loadError).toBeInstanceOf(Error)
      expect(store.ready).toBe(false); expect(store.loading).toBe(false)
    }
  })

  it('状态按 Pinia 实例隔离，不跨会话共享写锁、目录或完成反馈', async () => {
    const pending = deferred<NodeConnection>(); mocks.createNodeConnection.mockReturnValueOnce(pending.promise)
    const a = useNodeConnectionStore(createPinia()); const b = useNodeConnectionStore(createPinia())
    const first = a.saveConnection(created, null)
    expect(b.pendingSave).toBeNull(); expect(b.connections).toEqual([]); expect(b.saveOutcome).toBeNull()
    await b.loadConnections(); expect(b.connections).toEqual([saved])
    pending.resolve(created); await first
    expect(a.connections).toEqual([created]); expect(b.connections).toEqual([saved])
    expect(b.saveOutcome).toBeNull()
  })

  it('编辑失败保留旧目录，记录请求连接名且释放写锁', async () => {
    const error = new Error('更新失败'); mocks.updateNodeConnection.mockRejectedValueOnce(error)
    const store = useNodeConnectionStore(createPinia()); await store.loadConnections()
    await expect(store.saveConnection(created, saved.id)).rejects.toBe(error)
    expect(store.connections).toEqual([saved]); expect(store.pendingSave).toBeNull()
    expect(store.saveOutcome).toEqual({ status: 'failed', name: created.name, cause: error })
    await store.saveConnection(created, saved.id)
    expect(store.connections).toEqual([{ ...created, id: saved.id }])
  })
})
