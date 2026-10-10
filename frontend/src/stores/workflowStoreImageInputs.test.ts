import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph, workflowApi } from '@/services/api/workflowApi'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from './workflowStore'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5AAAAABJRU5ErkJggg=='
describe('图片输入的存储、加载和撤销', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks() })
  it.each(['image-generation', 'upscale'] as const)('%s 选图保留旧变量，绑定上游只需一次撤销', async (kind) => {
    const store = useWorkflowStore(); store.resetToEmptyWorkflow()
    const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === kind)!, { x: 0, y: 0 })!
    store.updateNodeConfigValues(node.id, { sourceImageVariable: 'legacyBase64', checkpoint: 'unchanged' })
    const before = { ...node.data.config }
    store.updateNodeConfigValues(node.id, { sourceImage: png })
    const fixed = { ...node.data.config }
    expect(fixed.sourceImageVariable).toBe('legacyBase64')
    const history = store.historyPast.length
    store.updateNodeConfigValues(node.id, { sourceImage: '', sourceImageVariable: 'imageFileIds' })
    expect(store.historyPast).toHaveLength(history + 1)
    expect(store.undo()).toBe(true)
    expect(store.nodes[0]?.data.config).toEqual(fixed)
    expect(store.undo()).toBe(true)
    expect(store.nodes[0]?.data.config).toEqual(before)
    expect(store.redo()).toBe(true)
    expect(store.redo()).toBe(true)
    expect(store.nodes[0]?.data.config).toMatchObject({ sourceImage: '', sourceImageVariable: 'imageFileIds', checkpoint: 'unchanged' })
  })
  it.each(['image-generation', 'upscale'] as const)('%s 本地图片与变量通过真实 DTO 映射和加载保留', async (kind) => {
    const store = useWorkflowStore(); store.resetToEmptyWorkflow()
    const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === kind)!, { x: 0, y: 0 })!
    store.updateNodeConfigValues(node.id, { sourceImage: png, sourceImageVariable: 'legacyBase64' })
    let saved!: Awaited<ReturnType<typeof workflowApi.saveWorkflow>>
    vi.spyOn(workflowApi, 'saveWorkflow').mockImplementation(async (workflow) => {
      // 使用实际存取映射，确认不是只验证 mock 原样回传。
      const dto = mapWorkflowToDefinitionDTO(workflow)
      const graph = mapBackendDefinitionGraph(JSON.parse(JSON.stringify(dto.nodes)))
      saved = { ...workflow, ...graph, id: 'saved-image', backendDefinitionId: 321, backendVersion: 1, backendStatus: 'DRAFT', savedAt: '2026-10-10T00:00:00Z' }
      return saved
    })
    vi.spyOn(workflowApi, 'getWorkflow').mockImplementation(async () => saved)
    await store.saveCurrentWorkflow()
    expect(store.dirty).toBe(false)
    store.resetToEmptyWorkflow()
    expect(await store.loadWorkflow('saved-image')).toBe(true)
    expect(store.nodes[0]?.data.config).toMatchObject({ sourceImage: png, sourceImageVariable: 'legacyBase64' })
    store.updateNodeConfigValues(store.nodes[0]!.id, { sourceImage: '', sourceImageVariable: 'upscaledImageFileIds' })
    await store.saveCurrentWorkflow(); store.resetToEmptyWorkflow(); await store.loadWorkflow('saved-image')
    expect(store.nodes[0]?.data.config.sourceImage).toBeUndefined()
    expect(store.nodes[0]?.data.config.sourceImageVariable).toBe('upscaledImageFileIds')
  })
})
