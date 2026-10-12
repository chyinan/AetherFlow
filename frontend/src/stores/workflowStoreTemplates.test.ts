import { createPinia, setActivePinia } from 'pinia'
import { isProxy, reactive, toRaw } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkflowStore } from './workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'

function definition(id = 'template'): WorkflowDefinition {
  return {
    id, name: `工作流 ${id}`, backendDefinitionId: 42, backendVersion: 3, projectId: 9,
    nodes: [{
      id: 'start', type: 'workflow', position: { x: 10, y: 20 },
      data: { label: '开始', description: '', kind: 'start', status: 'idle',
        config: { nested: { values: ['original'] } }, inputs: [], outputs: ['output'] },
    }],
    edges: [{ id: 'edge', source: 'start', target: 'end', label: 'original' }],
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('真实 Pinia 模板应用与原子替换', () => {
  it('应用 Pinia 中的模板并重复使用时，画布和模板之间无共享嵌套状态', () => {
    const store = useWorkflowStore()
    store.workflowTemplates = [definition()]
    const template = store.workflowTemplates[0]!
    expect(isProxy(template)).toBe(true)
    expect(isProxy(template.nodes)).toBe(true)
    // 使用运行时真实克隆实现，确保测试没有用 JSON 替身掩盖 Proxy 异常。
    expect(() => structuredClone(template.nodes)).toThrow()
    expect(() => store.useWorkflowTemplate(template)).not.toThrow()
    expect(store.workflowId).toBe('new')
    expect(store.backendDefinitionId).toBeNull()
    expect(store.backendVersion).toBeNull()
    expect(store.workflowName).toBe(template.name)
    expect(store.dirty).toBe(true)
    const firstNodes = store.nodes
    ;(store.nodes[0]!.data.config.nested as { values: string[] }).values[0] = 'edited'
    store.edges[0]!.label = 'edited'
    expect((template.nodes[0]!.data.config.nested as { values: string[] }).values).toEqual(['original'])
    expect(template.edges[0]!.label).toBe('original')
    store.useWorkflowTemplate(template)
    expect(store.nodes).not.toBe(firstNodes)
    expect((store.nodes[0]!.data.config.nested as { values: string[] }).values).toEqual(['original'])
    expect(store.edges[0]!.label).toBe('original')
  })

  it('也能安全克隆显式嵌套的 Vue Proxy', () => {
    const store = useWorkflowStore()
    const workflow = definition()
    workflow.nodes[0]!.data.config.nested = reactive({ values: ['original'] })
    expect(() => store.useWorkflowTemplate(workflow)).not.toThrow()
    ;(store.nodes[0]!.data.config.nested as { values: string[] }).values.push('edited')
    expect((workflow.nodes[0]!.data.config.nested as { values: string[] }).values).toEqual(['original'])
  })

  it.each(['nodes', 'edges'] as const)('%s 克隆失败时不改变身份、画布、历史和错误状态', (field) => {
    const store = useWorkflowStore()
    store.applyWorkflowDefinition(definition('existing'), true)
    store.createIdempotencyKey = 'keep-key'
    store.loadingError = 'keep-load-error'
    store.savingError = 'keep-save-error'
    store.runError = 'keep-run-error'
    store.saving = true
    store.historyPast = [{ nodes: [], edges: [] }]
    store.historyFuture = [{ nodes: [], edges: [] }]
    const before = structuredClone(toRaw(store.$state))
    const nodes = store.nodes
    const edges = store.edges
    const broken = definition('replacement')
    if (field === 'nodes') broken.nodes[0]!.data.config.invalid = () => undefined
    else Object.assign(broken.edges[0]!, { invalid: () => undefined })
    expect(() => store.useWorkflowTemplate(broken)).toThrow()
    expect(store.$state).toEqual(before)
    expect(store.nodes).toBe(nodes)
    expect(store.edges).toBe(edges)
  })
})
