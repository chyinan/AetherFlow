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

/** 传输层失败：请求可能已经到达服务端，但响应没有回来。 */
function networkError(url: string) {
  return { isAxiosError: true, message: 'Network Error', config: { url }, response: undefined }
}

/** 服务端明确拒绝：结果确定，不会落库。 */
function rejected(status: number, message: string) {
  return {
    isAxiosError: true,
    message,
    config: { url: '/workflows/definitions/201' },
    response: { status, data: { code: status, success: false, message }, headers: {} },
  }
}

function remoteOf(id: number, version: number, payload: unknown): RemoteDefinition {
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

/** 等待条件成立，避免依赖固定微任务数量。 */
async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error(`等待超时：${label}`)
}

describe('保存响应丢失后的版本恢复', () => {
  let remote: RemoteDefinition
  let putCalls: Array<{ url: string; payload: any }>
  let getCalls: string[]
  let pendingRead: boolean
  let releaseRead: ((value: RemoteDefinition) => void) | null

  beforeEach(() => {
    setActivePinia(createPinia())
    putCalls = []
    getCalls = []
    pendingRead = false
    releaseRead = null
    remote = remoteOf(201, 5, {
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
      if (pendingRead && url.endsWith('/201')) {
        pendingRead = false
        return new Promise<RemoteDefinition>((resolve) => { releaseRead = resolve })
      }
      if (url.endsWith('/303')) {
        return remoteOf(303, 2, {
          name: '另一个工作流', description: '', projectId: 22, version: 1,
          nodes: [{ nodeId: 'other-start', nodeType: 'START', displayName: '开始', config: {} }],
        })
      }
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

  /** 记录“确实已提交并版本递增”，随后让响应失败。 */
  function commitButLoseResponse() {
    http.put.mockImplementation(async (url: string, payload: any) => {
      putCalls.push({ url, payload })
      remote = remoteOf(201, remote.version + 1, payload)
      throw networkError(url)
    })
  }

  it('远端已提交但响应丢失时核对后恢复保存状态', async () => {
    commitButLoseResponse()
    const store = loadedStore()

    await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '201' })

    expect(putCalls).toHaveLength(1)
    expect(getCalls).toEqual(['/workflows/definitions/201'])
    expect(store.backendVersion).toBe(6)
    expect(store.dirty).toBe(false)
    expect(store.saveRecovery?.status).toBe('committed')
    expect(store.savingError).toBeNull()
  })

  it('远端已提交且用户已编辑到 B 时保留 B、历史并更新保存基线', async () => {
    commitButLoseResponse()
    const store = loadedStore()
    const historyBefore = store.historyPast.length

    const saving = store.saveCurrentWorkflow()
    await waitFor(() => putCalls.length > 0, '保存请求发出')
    // 保存响应丢失后用户继续编辑到 B。
    store.updateNodeConfig('start-1', 'description', 'B 的内容')
    await saving

    expect(store.dirty).toBe(true)
    expect(store.backendVersion).toBe(6)
    expect(store.saveRecovery?.status).toBe('committedWithNewerEdits')
    expect(store.nodes[0]!.data.config.description).toBe('B 的内容')
    expect(store.historyPast.length).toBeGreaterThan(historyBefore)
  })

  it('核对等待期间继续编辑 C 时迟到结果不覆盖 C', async () => {
    commitButLoseResponse()
    const store = loadedStore()
    pendingRead = true

    const saving = store.saveCurrentWorkflow()
    await waitFor(() => releaseRead !== null, '核对读回挂起')
    store.updateNodeConfig('start-1', 'description', 'C 的内容')
    releaseRead!(remote)
    await saving

    expect(store.nodes[0]!.data.config.description).toBe('C 的内容')
    expect(store.dirty).toBe(true)
  })

  it('请求实际未落库时不误报成功并可重试', async () => {
    http.put.mockImplementation(async (url: string, payload: any) => {
      putCalls.push({ url, payload })
      throw networkError(url)
    })
    const store = loadedStore()

    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.backendVersion).toBe(5)
    expect(store.dirty).toBe(true)
    expect(store.saveRecovery?.status).toBe('notSubmitted')

    // 重试成功。
    http.put.mockImplementation(async (url: string, payload: any) => {
      putCalls.push({ url, payload })
      remote = remoteOf(201, remote.version + 1, payload)
      return remote
    })
    await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '201' })
    expect(store.backendVersion).toBe(6)
    expect(store.dirty).toBe(false)
  })

  it('远端被他人修改时保留本地草稿并明确冲突', async () => {
    commitButLoseResponse()
    const store = loadedStore()
    // 远端在核对前已被其他编辑者改成别的内容。
    http.get.mockImplementation(async (url: string) => {
      getCalls.push(url)
      return remoteOf(201, 6, {
        name: '他人的工作流', description: '', projectId: 11, version: 5,
        nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: { other: true } }],
      })
    })

    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.backendVersion).toBe(5)
    expect(store.dirty).toBe(true)
    expect(store.saveRecovery?.status).toBe('conflict')
    expect(store.nodes[0]!.data.config.other).toBeUndefined()
  })

  it('远端版本超出预期时不确认提交', async () => {
    commitButLoseResponse()
    const store = loadedStore()
    http.get.mockImplementation(async (url: string) => {
      getCalls.push(url)
      return remoteOf(201, 9, remote.definitionJson)
    })

    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.backendVersion).toBe(5)
    expect(store.saveRecovery?.status).toBe('conflict')
  })

  it('核对读回失败时可重试且不误报成功', async () => {
    commitButLoseResponse()
    const store = loadedStore()
    http.get.mockImplementation(async (url: string) => {
      getCalls.push(url)
      throw networkError(url)
    })

    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.backendVersion).toBe(5)
    expect(store.dirty).toBe(true)
    expect(store.saveRecovery?.status).toBe('retryable')
    expect(getCalls).toHaveLength(1)
  })

  it('服务端明确拒绝时不发起核对请求', async () => {
    http.put.mockImplementation(async (url: string, payload: any) => {
      putCalls.push({ url, payload })
      throw rejected(400, '工作流结构非法')
    })
    const store = loadedStore()

    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(getCalls).toHaveLength(0)
    expect(store.backendVersion).toBe(5)
    expect(store.dirty).toBe(true)
    expect(store.saveRecovery).toBeNull()
    expect(store.savingError).toContain('工作流结构非法')
  })

  it('切换到另一工作流后旧核对结果不写回新页面', async () => {
    commitButLoseResponse()
    const store = loadedStore()
    pendingRead = true

    const saving = store.saveCurrentWorkflow()
    await waitFor(() => releaseRead !== null, '核对读回挂起')
    // 页面切到另一个工作流。
    await store.loadWorkflow('303')
    releaseRead!(remote)
    // 旧保存的核对结果不得写回新页面，旧保存本身也不得冒称成功。
    await expect(saving).rejects.toThrow()

    expect(store.workflowId).toBe('303')
    expect(store.backendVersion).toBe(2)
    expect(store.saveRecovery).toBeNull()
  })
})
