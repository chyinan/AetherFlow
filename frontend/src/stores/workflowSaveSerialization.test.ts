import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({
  apiClient: http,
  setUnauthorizedSessionRefresher: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}))

import { nodeTemplates } from '@/services/mock/workflowMock'
import type { WorkflowGraphNode } from '@/types/workflow'
import { useWorkflowStore } from './workflowStore'

interface RemoteDefinition {
  id: number
  name: string
  description: string
  projectId: number
  version: number
  definitionJson: string
  status: string
}

function startNode(id: string, label = '开始'): WorkflowGraphNode {
  const template = nodeTemplates.find((item) => item.kind === 'start')!
  return {
    id,
    type: 'workflow',
    position: { x: 0, y: 0 },
    data: { ...template, label, config: structuredClone(template.config), status: 'idle' },
  }
}

/** 服务端明确拒绝：版本冲突，本次未落库。 */
function rejected(status: number, message: string) {
  return {
    isAxiosError: true,
    message,
    config: { url: '/workflows/definitions/201' },
    response: { status, data: { code: status, success: false, message }, headers: {} },
  }
}

function remoteOf(version: number, payload: unknown, id = 201): RemoteDefinition {
  return {
    id,
    name: (payload as { name?: string })?.name ?? '已有工作流',
    description: (payload as { description?: string })?.description ?? '',
    projectId: (payload as { projectId?: number })?.projectId ?? 11,
    version,
    definitionJson: JSON.stringify(payload),
    status: 'ready',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/** 等待条件成立，避免依赖固定微任务数量。 */
async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error(`等待超时：${label}`)
}

describe('保存入口的串行化与版本基线前进', () => {
  let remote: RemoteDefinition
  let putCalls: Array<{ url: string; payload: any }>
  let getCalls: string[]

  beforeEach(() => {
    setActivePinia(createPinia())
    putCalls = []
    getCalls = []
    remote = remoteOf(5, {
      name: '已有工作流',
      description: '',
      projectId: 11,
      version: 5,
      nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: {} }],
    })
    http.get.mockReset()
    http.post.mockReset()
    http.put.mockReset()
    http.delete.mockReset()
    http.get.mockImplementation(async (url: string) => {
      getCalls.push(url)
      return remote
    })
  })

  function loadedStore() {
    const store = useWorkflowStore()
    store.templates = nodeTemplates
    store.applyWorkflowDefinition({
      id: '201', name: '已有工作流', backendDefinitionId: 201, backendVersion: 5, projectId: 11,
      nodes: [startNode('start-1')], edges: [],
    })
    store.markDirty()
    return store
  }

  it('两个保存请求不会并发发出，后一个使用前进后的版本提交', async () => {
    const store = loadedStore()
    let releaseFirst: (() => void) | null = null
    http.put.mockImplementation((url: string, payload: any) => {
      putCalls.push({ url, payload })
      if (putCalls.length === 1) {
        return new Promise<RemoteDefinition>((resolve) => {
          releaseFirst = () => {
            remote = remoteOf(remote.version + 1, payload)
            resolve(remote)
          }
        })
      }
      if (payload.version !== remote.version) throw rejected(409, 'version conflict')
      remote = remoteOf(remote.version + 1, payload)
      return Promise.resolve(remote)
    })

    const first = store.saveCurrentWorkflow()
    await waitFor(() => putCalls.length === 1, '首个保存发出')
    // 运行前读历史期间用户又点了一次保存：第二个请求必须排队，不能并发占用同一版本基线。
    store.updateNodeConfig('start-1', 'description', '第二次保存的内容')
    const second = store.saveCurrentWorkflow()
    await waitFor(() => true, '让出微任务')
    expect(putCalls).toHaveLength(1)

    releaseFirst!()
    await first
    await waitFor(() => putCalls.length === 2, '第二个保存发出')
    expect(putCalls[1]!.payload.version).toBe(6)
    await expect(second).resolves.toEqual({ workflowId: '201' })

    expect(store.backendVersion).toBe(7)
    expect(store.dirty).toBe(false)
    expect(store.nodes[0]!.data.config.description).toBe('第二次保存的内容')
    expect(store.saving).toBe(false)
  })

  it('串行队列固定排队时的项目保存意图', async () => {
    const store = loadedStore()
    let releaseFirst: (() => void) | null = null
    http.put.mockImplementation((url: string, payload: any) => {
      putCalls.push({ url, payload })
      if (putCalls.length === 1) {
        return new Promise<RemoteDefinition>((resolve) => {
          releaseFirst = () => {
            remote = remoteOf(remote.version + 1, payload)
            resolve(remote)
          }
        })
      }
      remote = remoteOf(remote.version + 1, payload)
      return Promise.resolve(remote)
    })

    const first = store.saveCurrentWorkflow({ projectId: 11 })
    await waitFor(() => putCalls.length === 1, '首个项目保存发出')
    const queuedOptions = { projectId: 11 }
    const second = store.saveCurrentWorkflow(queuedOptions)
    queuedOptions.projectId = 22

    releaseFirst!()
    await first
    await second

    expect(putCalls).toHaveLength(2)
    expect(putCalls.map((call) => call.payload.projectId)).toEqual([11, 11])
  })

  it('迟到的成功回执仍推进版本基线，但不覆盖当前草稿', async () => {
    const store = loadedStore()
    let release: (() => void) | null = null
    http.put.mockImplementation((url: string, payload: any) => {
      putCalls.push({ url, payload })
      return new Promise<RemoteDefinition>((resolve) => {
        release = () => {
          remote = remoteOf(remote.version + 1, payload)
          resolve(remote)
        }
      })
    })

    const saving = store.saveCurrentWorkflow()
    await waitFor(() => release !== null, '保存发出')
    store.updateNodeConfig('start-1', 'description', '保存期间的新编辑')
    // 页面此时放弃这次回执（离开/替换画布），回执本身仍证明服务端版本已前进。
    store.discardCurrentWorkflowSave()
    release!()
    await expect(saving).resolves.toBeUndefined()

    expect(store.backendVersion).toBe(6)
    expect(store.nodes[0]!.data.config.description).toBe('保存期间的新编辑')
    expect(store.workflowName).toBe('已有工作流')
    expect(store.dirty).toBe(true)
    expect(store.saving).toBe(false)
  })

  it('版本冲突时只读刷新远端基线，下一次保存即可成功且草稿不丢', async () => {
    const store = loadedStore()
    // 远端已被其他写入者推进到 7，本端仍带着 5。
    remote = remoteOf(7, remote.definitionJson)
    http.put.mockImplementation(async (url: string, payload: any) => {
      putCalls.push({ url, payload })
      if (payload.version !== remote.version) throw rejected(409, 'version conflict')
      remote = remoteOf(remote.version + 1, payload)
      return remote
    })
    store.updateNodeConfig('start-1', 'description', '本地草稿')

    await expect(store.saveCurrentWorkflow()).rejects.toThrow()

    // 冲突只刷新只读基线，不重载画布、不清空草稿。
    expect(getCalls).toContain('/workflows/definitions/201')
    expect(store.backendVersion).toBe(7)
    expect(store.nodes[0]!.data.config.description).toBe('本地草稿')
    expect(store.dirty).toBe(true)
    expect(store.saving).toBe(false)

    await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '201' })
    expect(putCalls).toHaveLength(2)
    expect(putCalls[1]!.payload.version).toBe(7)
    expect(store.backendVersion).toBe(8)
    expect(store.dirty).toBe(false)
  })

  it('连续冲突时每次只读刷新基线，不会卡死在 409', async () => {
    const store = loadedStore()
    http.put.mockImplementation(async (url: string, payload: any) => {
      putCalls.push({ url, payload })
      if (payload.version !== remote.version) throw rejected(409, 'version conflict')
      remote = remoteOf(remote.version + 1, payload)
      return remote
    })
    // 远端在两次尝试之间又被推进。
    remote = remoteOf(6, remote.definitionJson)
    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.backendVersion).toBe(6)
    remote = remoteOf(9, remote.definitionJson)
    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.backendVersion).toBe(9)

    await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '201' })
    expect(putCalls.at(-1)!.payload.version).toBe(9)
    expect(store.backendVersion).toBe(10)
  })

  async function beginConflictRefresh(store: ReturnType<typeof useWorkflowStore>) {
    const refresh = deferred<RemoteDefinition>()
    const conflict = rejected(409, 'version conflict')
    http.put.mockRejectedValueOnce(conflict)
    http.get.mockReturnValueOnce(refresh.promise)
    const saving = store.saveCurrentWorkflow()
    // 立即接住原保存的拒绝，之后仍需保留这次 409 的失败语义。
    const completed = expect(saving).rejects.toBe(conflict)
    await waitFor(() => http.get.mock.calls.length === 1, '409 基线刷新 GET 发出')
    expect(http.get).toHaveBeenLastCalledWith('/workflows/definitions/201', { source: 'workflow' })
    expect(store.saving).toBe(true)
    return { refresh, completed }
  }

  function settleRefresh(refresh: ReturnType<typeof deferred<RemoteDefinition>>, outcome: string) {
    if (outcome === '成功') refresh.resolve(remoteOf(99, remote.definitionJson))
    else refresh.reject(new Error('旧工作流基线刷新失败'))
  }

  it('同 A 的后续保存排队时，当前冲突仍刷新基线并让队列用新版本保存最新编辑', async () => {
    const store = loadedStore()
    const first = await beginConflictRefresh(store)
    store.updateNodeConfig('start-1', 'description', '冲突刷新期间的新编辑')
    http.put.mockImplementationOnce(async (_url: string, payload: any) => remoteOf(payload.version + 1, payload))
    const queued = store.saveCurrentWorkflow()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(store.saving).toBe(true)

    first.refresh.resolve(remoteOf(7, remote.definitionJson))
    await first.completed
    await expect(queued).resolves.toEqual({ workflowId: '201' })

    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.put).toHaveBeenCalledTimes(2)
    expect(http.put.mock.calls[1]![1]).toMatchObject({ version: 7, projectId: 11 })
    expect(store.nodes[0]!.data.config.description).toBe('冲突刷新期间的新编辑')
    expect(store).toMatchObject({ backendVersion: 8, dirty: false, saving: false, savingError: null })
  })

  it('同 A 的冲突基线刷新失败时仍报告原保存错误并保留草稿', async () => {
    const store = loadedStore()
    store.updateNodeConfig('start-1', 'description', '刷新失败后保留的草稿')
    const first = await beginConflictRefresh(store)
    first.refresh.reject(new Error('只读刷新失败'))
    await first.completed

    expect(store.savingError).toContain('version conflict')
    expect(store).toMatchObject({ backendVersion: 5, dirty: true, saving: false, pendingSaveSubmission: null })
    expect(store.nodes[0]!.data.config.description).toBe('刷新失败后保留的草稿')
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.put).toHaveBeenCalledTimes(1)
  })

  const refreshOutcomes = ['成功', '失败'] as const
  const nextSaveStates = ['未保存', '保存中', '保存失败', '保存成功'] as const
  it.each(refreshOutcomes.flatMap(refreshOutcome => nextSaveStates.map(saveState => ({ refreshOutcome, saveState }))))(
    'Discard 切换到 B 且 B $saveState 后，A 的冲突刷新$refreshOutcome不修改 B',
    async ({ refreshOutcome, saveState }) => {
      const store = loadedStore()
      const oldSave = await beginConflictRefresh(store)
      store.discardCurrentWorkflowSave()
      const nextPayload = {
        name: '工作流 B', description: 'B 的说明', projectId: 22, version: 17,
        nodes: [{ nodeId: 'start-b', nodeType: 'START', displayName: 'B 的开始', config: {} }],
      }
      http.get.mockResolvedValueOnce(remoteOf(17, nextPayload, 202))
      expect(await store.loadWorkflow('202')).toBe(true)
      store.updateNodeConfig('start-b', 'description', 'B 的独立编辑')

      const pendingB = deferred<RemoteDefinition>()
      let savingB: ReturnType<typeof store.saveCurrentWorkflow> | undefined
      if (saveState === '保存中') {
        http.put.mockReturnValueOnce(pendingB.promise)
        savingB = store.saveCurrentWorkflow()
        await waitFor(() => http.put.mock.calls.length === 2, 'B 的保存独立发出')
      } else if (saveState === '保存失败') {
        http.put.mockRejectedValueOnce(rejected(422, 'B 的独有保存错误'))
        await expect(store.saveCurrentWorkflow()).rejects.toThrow('B 的独有保存错误')
      } else if (saveState === '保存成功') {
        http.put.mockImplementationOnce(async (_url: string, payload: unknown) => remoteOf(18, payload, 202))
        await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '202' })
      }

      expect(store).toMatchObject({
        workflowId: '202', workflowName: '工作流 B', projectId: 22,
        backendDefinitionId: 202, backendVersion: saveState === '保存成功' ? 18 : 17,
        dirty: saveState !== '保存成功', saving: saveState === '保存中',
      })
      if (saveState === '保存失败') expect(store.savingError).toContain('B 的独有保存错误')
      else expect(store.savingError).toBeNull()
      const stateBeforeOldRefresh = JSON.parse(JSON.stringify(store.$state))

      settleRefresh(oldSave.refresh, refreshOutcome)
      await oldSave.completed

      expect(JSON.parse(JSON.stringify(store.$state))).toEqual(stateBeforeOldRefresh)
      expect(http.put).toHaveBeenCalledTimes(saveState === '未保存' ? 1 : 2)
      expect(http.get).toHaveBeenCalledTimes(2)
      if (savingB) {
        pendingB.resolve(remoteOf(18, http.put.mock.calls[1]![1], 202))
        await expect(savingB).resolves.toEqual({ workflowId: '202' })
        expect(store).toMatchObject({ saving: false, savingError: null, backendVersion: 18, dirty: false })
      }
    },
  )

  it.each(refreshOutcomes)('Discard 仍在 A 上重新保存时，旧冲突刷新%s不干扰新的在途保存', async (refreshOutcome) => {
    const store = loadedStore()
    const oldSave = await beginConflictRefresh(store)
    store.discardCurrentWorkflowSave()
    store.updateNodeConfig('start-1', 'description', '同一画布上的新保存')
    const newPut = deferred<RemoteDefinition>()
    http.put.mockReturnValueOnce(newPut.promise)
    const saving = store.saveCurrentWorkflow()
    await waitFor(() => http.put.mock.calls.length === 2, 'Discard 后同 A 的新保存发出')
    expect(store.saving).toBe(true)
    const stateBeforeOldRefresh = JSON.parse(JSON.stringify(store.$state))

    settleRefresh(oldSave.refresh, refreshOutcome)
    await oldSave.completed

    expect(JSON.parse(JSON.stringify(store.$state))).toEqual(stateBeforeOldRefresh)
    expect(http.put).toHaveBeenCalledTimes(2)
    newPut.resolve(remoteOf(6, http.put.mock.calls[1]![1]))
    await expect(saving).resolves.toEqual({ workflowId: '201' })
    expect(store).toMatchObject({ backendVersion: 6, saving: false, savingError: null, dirty: false })
  })

  it.each(refreshOutcomes)('A 切到 B 再重载相同 ID 的 A 后，旧冲突刷新%s不修改新的加载代次', async (refreshOutcome) => {
    const store = loadedStore()
    const oldSave = await beginConflictRefresh(store)
    const nextPayload = {
      name: '工作流 B', projectId: 22,
      nodes: [{ nodeId: 'start-b', nodeType: 'START', displayName: '开始', config: {} }],
    }
    // 不调用 Discard，单独验证加载代次会使旧刷新失效。
    http.get.mockResolvedValueOnce(remoteOf(17, nextPayload, 202))
    expect(await store.loadWorkflow('202')).toBe(true)
    http.get.mockResolvedValueOnce(remoteOf(8, {
      name: '重新加载的 A', projectId: 11,
      nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: { description: '远端新内容' } }],
    }))
    expect(await store.loadWorkflow('201')).toBe(true)
    store.updateNodeConfig('start-1', 'description', '重新加载后的编辑')
    expect(store).toMatchObject({ workflowId: '201', backendVersion: 8, dirty: true, savingError: null })
    const stateBeforeOldRefresh = JSON.parse(JSON.stringify(store.$state))

    settleRefresh(oldSave.refresh, refreshOutcome)
    await oldSave.completed

    expect(JSON.parse(JSON.stringify(store.$state))).toEqual(stateBeforeOldRefresh)
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.get).toHaveBeenCalledTimes(3)
  })
})
