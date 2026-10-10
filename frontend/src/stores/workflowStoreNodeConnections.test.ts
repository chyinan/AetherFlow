import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from './workflowStore'

describe('节点连接配置与历史记录', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it.each(['image-generation', 'upscale', 'whisper'] as const)('允许添加部署不可用的 %s 节点以配置连接或环境', (kind) => {
    const store = useWorkflowStore(); store.resetToEmptyWorkflow()
    const template = { ...nodeTemplates.find((item) => item.kind === kind)!, availability: { available: false, reason: 'deployment unavailable' } }
    store.templates = [template]
    const node = store.addNodeFromTemplate(template, { x: 0, y: 0 })
    expect(node).not.toBeNull(); expect(store.runError).toBeNull()
    expect(store.templates[0]?.availability?.available).toBe(false)
  })
  it('connectionId 与 Provider 原子更新且一次撤销，保留已有模型配置', () => {
    const store = useWorkflowStore(); store.resetToEmptyWorkflow()
    const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'image-generation')!, { x: 0, y: 0 })!
    store.updateNodeConfig(node.id, 'checkpoint', 'keep.safetensors')
    const before = { ...node.data.config }; const historyLength = store.historyPast.length
    store.updateNodeConfigValues(node.id, { connectionId: 'saved-profile', provider: 'COMFYUI' })
    expect(node.data.config).toMatchObject({ connectionId: 'saved-profile', provider: 'COMFYUI', checkpoint: 'keep.safetensors' })
    expect(store.historyPast.length).toBe(historyLength + 1)
    store.undo(); expect(store.nodes.find((item) => item.id === node.id)?.data.config).toEqual(before)
  })
})
