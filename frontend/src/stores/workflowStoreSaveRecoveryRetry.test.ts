// @vitest-environment jsdom
// 保存回执丢失且核对全部失败后，再次保存必须先核对远端更新基线，
// 而不是一直带着旧版本重复冲突。
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

function startNode(id: string): WorkflowGraphNode {
  const template = nodeTemplates.find((item) => item.kind === 'start')!
  return {
    id,
    type: 'workflow',
    position: { x: 0, y: 0 },
    data: { ...template, config: structuredClone(template.config), status: 'idle' },
  }
}

function networkError(url: string) {
  return { isAxiosError: true, message: 'Network Error', config: { url }, response: undefined }
}

describe('核对失败后的再次保存', () => {
  let remoteVersion = 5
  let remotePayload: unknown
  let putPayloads: any[]
  let readFails: boolean

  beforeEach(() => {
    setActivePinia(createPinia())
    remoteVersion = 5
    readFails = true
    putPayloads = []
    remotePayload = {
      name: '已有工作流', description: '', projectId: 11, version: 5,
      nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: {} }],
    }
    http.get.mockReset()
    http.post.mockReset()
    http.put.mockReset()
    http.delete.mockReset()
    http.get.mockImplementation(async (url: string) => {
      if (url !== '/workflows/definitions/201') throw new Error('Unexpected GET ' + url)
      if (readFails) throw networkError(url)
      return {
        id: 201, name: '已有工作流', description: '', projectId: 11, version: remoteVersion,
        definitionJson: JSON.stringify(remotePayload), status: 'ready',
      }
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

  it('核对全失败后再次保存会先核对远端再提交新编辑', async () => {
    const store = loadedStore()
    // 第一次保存：远端确实落库并递增版本，但回执丢失，核对读回也全部失败。
    http.put.mockImplementation(async (_url: string, payload: any) => {
      putPayloads.push(payload)
      remoteVersion = remoteVersion + 1
      remotePayload = payload
      throw networkError(_url)
    })
    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.backendVersion).toBe(5)
    expect(store.pendingSaveSubmission).not.toBeNull()

    // 用户继续编辑成 B，网络恢复后再次保存。
    store.updateNodeConfig('start-1', 'description', 'B 的内容')
    readFails = false
    http.put.mockImplementation(async (_url: string, payload: any) => {
      putPayloads.push(payload)
      remoteVersion = remoteVersion + 1
      remotePayload = payload
      return {
        id: 201, name: payload.name, description: payload.description, projectId: payload.projectId,
        version: remoteVersion, definitionJson: JSON.stringify(payload), status: 'ready',
      }
    })

    await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '201' })

    // 第二次提交必须带上远端确认的新版本，而不是旧的 N。
    expect(putPayloads).toHaveLength(2)
    expect(putPayloads[0].version).toBe(5)
    expect(putPayloads[1].version).toBe(6)
    expect(store.backendVersion).toBe(7)
    expect(store.dirty).toBe(false)
    expect(store.pendingSaveSubmission).toBeNull()
  })

  it('核对确认已提交时保留较新的本地编辑与撤销重做历史', async () => {
    const store = loadedStore()
    http.put.mockImplementation(async (_url: string, payload: any) => {
      putPayloads.push(payload)
      remoteVersion = remoteVersion + 1
      remotePayload = payload
      throw networkError(_url)
    })
    await expect(store.saveCurrentWorkflow()).rejects.toThrow()

    store.updateNodeConfig('start-1', 'description', 'B 的内容')
    const historyBefore = store.historyPast.length
    readFails = false
    http.put.mockImplementation(async (_url: string, payload: any) => {
      putPayloads.push(payload)
      remoteVersion = remoteVersion + 1
      remotePayload = payload
      return {
        id: 201, name: payload.name, description: payload.description, projectId: payload.projectId,
        version: remoteVersion, definitionJson: JSON.stringify(payload), status: 'ready',
      }
    })

    await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '201' })

    expect(putPayloads[1].version).toBe(6)
    expect(store.nodes[0]!.data.config.description).toBe('B 的内容')
    // 撤销重做历史不得被清空。
    expect(store.historyPast.length).toBe(historyBefore)
  })

  it('远端是真正的冲突时不提交新编辑并保留草稿', async () => {
    const store = loadedStore()
    http.put.mockImplementation(async (_url: string, payload: any) => {
      putPayloads.push(payload)
      remoteVersion = remoteVersion + 1
      remotePayload = payload
      throw networkError(_url)
    })
    await expect(store.saveCurrentWorkflow()).rejects.toThrow()

    store.updateNodeConfig('start-1', 'description', 'B 的内容')
    // 远端被他人改成了别的内容。
    readFails = false
    remoteVersion = 6
    remotePayload = {
      name: '他人的工作流', description: '', projectId: 11, version: 5,
      nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: { other: true } }],
    }

    await expect(store.saveCurrentWorkflow()).rejects.toThrow()

    // 真正的冲突不能靠再次提交解决，也不能覆盖远端。
    expect(putPayloads).toHaveLength(1)
    expect(store.backendVersion).toBe(5)
    expect(store.dirty).toBe(true)
    expect(store.nodes[0]!.data.config.description).toBe('B 的内容')
  })

  it('切换工作流后旧的待核对提交不再影响新工作流', async () => {
    const store = loadedStore()
    http.put.mockImplementation(async (_url: string, payload: any) => {
      putPayloads.push(payload)
      remoteVersion = remoteVersion + 1
      remotePayload = payload
      throw networkError(_url)
    })
    await expect(store.saveCurrentWorkflow()).rejects.toThrow()
    expect(store.pendingSaveSubmission).not.toBeNull()

    store.loadWorkflow('303')
    await Promise.resolve()

    expect(store.pendingSaveSubmission).toBeNull()
  })
})
