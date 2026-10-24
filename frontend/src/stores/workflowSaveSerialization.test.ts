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

function remoteOf(version: number, payload: unknown): RemoteDefinition {
  return {
    id: 201,
    name: (payload as { name?: string })?.name ?? '已有工作流',
    description: (payload as { description?: string })?.description ?? '',
    projectId: (payload as { projectId?: number })?.projectId ?? 11,
    version,
    definitionJson: JSON.stringify(payload),
    status: 'ready',
  }
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
})
