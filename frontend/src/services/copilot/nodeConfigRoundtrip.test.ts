// @vitest-environment jsdom
// 仅检查目录配置、画布适配与保存序列化，不连接真实 API 或启动工作流。
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const transport = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), get: vi.fn(), editCanvas: vi.fn(), listConversations: vi.fn(), refreshSnapshot: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: { post: transport.post, put: transport.put, get: transport.get }, setUnauthorizedSessionRefresher: vi.fn() }))
vi.mock('@/services/api/copilotApi', () => ({ copilotApi: { editCanvas: transport.editCanvas, listConversations: transport.listConversations } }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: { refreshSnapshot: transport.refreshSnapshot } }))
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { templateFromCatalogItem, useWorkflowStore } from '@/stores/workflowStore'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import { compileCanvasEdit } from './copilotCanvasEdit'
import type { CopilotCanvasEdit } from '@/types/copilotCanvasEdit'
import type { WorkflowDefinition, WorkflowNodeKind } from '@/types/workflow'

// 对照服务端 WorkflowNodeCatalogService.end()/questionClassifier() 的字段类型。
const catalogItems = [
  { type: 'END', displayName: 'End', category: 'Control', configSchema: [
    { name: 'output', type: 'OBJECT', required: false }, { name: 'variables', type: 'OBJECT', required: false },
  ] },
  { type: 'QUESTION_CLASSIFIER', displayName: 'Question Classifier', category: 'AI', configSchema: [
    { name: 'input', type: 'STRING', required: false }, { name: 'inputVariable', type: 'STRING', required: false },
    { name: 'routes', type: 'ARRAY', required: false }, { name: 'threshold', type: 'NUMBER', required: false },
  ] },
]
function snapshot(nodes = [] as WorkflowDefinition['nodes'], edges = [] as WorkflowDefinition['edges']) {
  const catalog = catalogItems.map(templateFromCatalogItem).filter(Boolean)
  return { workflowId: 'new', workflowName: '节点配置往返测试', backendDefinitionId: null, backendVersion: null,
    editRevision: 0, projectId: null, nodes, edges,
    templates: nodeTemplates.map((template) => ({ ...(catalog.find((item) => item?.kind === template.kind) ?? template), availability: { available: true, reason: null } })),
  }
}
function compile(operations: CopilotCanvasEdit['operations'], base = snapshot()) {
  const result = compileCanvasEdit(base, { status: 'READY', explanation: '正常节点配置', operations })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return { id: base.workflowId, name: base.workflowName, nodes: result.nodes, edges: result.edges }
}
const addEnd: CopilotCanvasEdit['operations'] = [
  { type: 'add_node', nodeId: 'begin', kind: 'start' },
  { type: 'add_node', nodeId: 'end', kind: 'output', config: { output: { answer: 'completionText' } } },
  { type: 'connect', source: 'begin', target: 'end' },
]
const addClassifier: CopilotCanvasEdit['operations'] = [
  { type: 'add_node', nodeId: 'begin', kind: 'start' },
  { type: 'add_node', nodeId: 'classifier', kind: 'question-classifier', config: { inputVariable: 'question', routes: ['billing', 'support'], threshold: 0.5 } },
  { type: 'add_node', nodeId: 'billingEnd', kind: 'output' },
  { type: 'add_node', nodeId: 'supportEnd', kind: 'output' },
  { type: 'connect', source: 'begin', target: 'classifier' },
  // 刻意采用与分类数组不同的连线顺序，合法标签仍应决定分支目标。
  { type: 'connect', source: 'classifier', target: 'supportEnd', label: 'support' },
  { type: 'connect', source: 'classifier', target: 'billingEnd', label: 'billing' },
]
function configOf(workflow: WorkflowDefinition, id: string) {
  return mapWorkflowToDefinitionDTO(workflow).nodes.find((node) => node.nodeId === id)!.config!
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.sessionStorage.clear(); window.localStorage.clear()
  Object.values(transport).forEach((mock) => mock.mockReset())
  transport.listConversations.mockResolvedValue([])
  transport.refreshSnapshot.mockResolvedValue({ providers: [], models: [] })
  transport.put.mockImplementation(async (_url, body) => ({ id: 123, version: 2, name: body.name, status: 'DRAFT' }))
  transport.post.mockImplementation(async (url, body) => {
    if (url === '/workflows/drafts/validate') return { structurallyValid: true, runtimeReady: true, issues: [] }
    if (url === '/workflows/definitions') return { id: 123, version: 1, name: body.name, status: 'DRAFT' }
    throw new Error(`测试未声明的接口：${url}`)
  })
})

describe('正常节点配置往返：后端加载对照', () => {
  it('已有 END 配置经真实加载适配器与序列化仍保留', () => {
    const graph = mapBackendDefinitionGraph([{ nodeId: 'end', nodeType: 'END', config: { output: { answer: 'completionText', auxiliary: 'extra' } } }])
    expect(configOf({ id: 'new', name: '正常加载', ...graph }, 'end').output).toEqual({ answer: 'completionText', auxiliary: 'extra' })
  })
  it('已有分类 routes 经真实加载适配器与序列化仍保留', () => {
    const graph = mapBackendDefinitionGraph([{ nodeId: 'classifier', nodeType: 'QUESTION_CLASSIFIER', config: { routes: ['billing', 'support', 'other'] } }])
    expect(configOf({ id: 'new', name: '正常加载', ...graph }, 'classifier').routes).toEqual(['billing', 'support', 'other'])
  })
  it('兼容仅包含一个分类别名的旧配置，不自动增加默认分类', () => {
    const graph = mapBackendDefinitionGraph([{ nodeId: 'classifier', nodeType: 'QUESTION_CLASSIFIER', config: { class1: 'billing' } }])
    expect(configOf({ id: 'new', name: '旧配置加载', ...graph }, 'classifier').routes).toEqual(['billing'])
  })
})

describe('正常节点配置往返：保值契约', () => {
  it('add_node 应保存目录 END.output，不应被 UI 默认值覆盖', () => {
    const workflow = compile(addEnd)
    expect(configOf(workflow, 'end').output).toEqual({ answer: 'completionText' })
  })
  it('update_node 应更新已加载 END.output', () => {
    const graph = mapBackendDefinitionGraph([
      { nodeId: 'begin', nodeType: 'START', config: { nextNodes: ['end'] } },
      { nodeId: 'end', nodeType: 'END', config: { output: { answer: 'oldAnswer' } } },
    ])
    const workflow = compile([{ type: 'update_node', nodeId: 'end', config: { output: { answer: 'completionText' } } }], snapshot(graph.nodes, graph.edges))
    expect(configOf(workflow, 'end').output).toEqual({ answer: 'completionText' })
  })
  it('add_node 应保存目录 routes 及标签对应分支', () => {
    const workflow = compile(addClassifier)
    expect(configOf(workflow, 'classifier')).toMatchObject({ routes: ['billing', 'support'], branches: { billing: 'billingEnd', support: 'supportEnd' } })
  })
  it('update_node 应更新已加载分类 routes', () => {
    const graph = mapBackendDefinitionGraph([
      { nodeId: 'begin', nodeType: 'START', config: { nextNodes: ['classifier'] } },
      { nodeId: 'classifier', nodeType: 'QUESTION_CLASSIFIER', config: { routes: ['oldBilling', 'oldSupport'] } },
    ])
    const workflow = compile([{ type: 'update_node', nodeId: 'classifier', config: { routes: ['billing', 'support'] } }], snapshot(graph.nodes, graph.edges))
    expect(configOf(workflow, 'classifier').routes).toEqual(['billing', 'support'])
  })
})

function loadedWorkflow(kind: WorkflowNodeKind): WorkflowDefinition {
  const graph = mapBackendDefinitionGraph(kind === 'output' ? [
    { nodeId: 'begin', nodeType: 'START', config: { nextNodes: ['end'] } },
    { nodeId: 'end', nodeType: 'END', config: { output: { oldAnswer: 'oldValue', oldExtra: 'removeWithCanonicalPatch' } } },
  ] : [
    { nodeId: 'begin', nodeType: 'START', config: { nextNodes: ['classifier'] } },
    { nodeId: 'classifier', nodeType: 'QUESTION_CLASSIFIER', config: { routes: ['oldBilling', 'oldSupport', 'oldOther'], branches: { oldSupport: 'supportEnd', oldBilling: 'billingEnd' } } },
    { nodeId: 'supportEnd', nodeType: 'END', config: {} },
    { nodeId: 'billingEnd', nodeType: 'END', config: {} },
  ])
  return { id: '123', backendDefinitionId: 123, backendVersion: 1, name: '已加载工作流', ...graph }
}

const canonicalCases: Array<{ name: string; kind: WorkflowNodeKind; config: Record<string, unknown>; expected: Record<string, unknown> }> = [
  { name: '多键及结构化输出', kind: 'output', config: { output: { answer: { nested: [0, false] }, auxiliary: 'extra' } }, expected: { output: { answer: { nested: [0, false] }, auxiliary: 'extra' } } },
  { name: '空字符串输出值', kind: 'output', config: { output: { answer: '', auxiliary: 'extra' } }, expected: { output: { answer: '', auxiliary: 'extra' } } },
  { name: 'null 输出值', kind: 'output', config: { output: { answer: null, auxiliary: 'extra' } }, expected: { output: { answer: null, auxiliary: 'extra' } } },
  { name: '清空输出对象', kind: 'output', config: { output: {} }, expected: { output: {} } },
  { name: 'null 清空输出', kind: 'output', config: { output: null }, expected: { output: {} } },
  { name: '输出规范字段优先于同次别名', kind: 'output', config: { output: { answer: 'canonical' }, outputName: 'wrong', outputValue: 'wrong', value: 'wrong' }, expected: { output: { answer: 'canonical' } } },
  { name: '三个分类', kind: 'question-classifier', config: { routes: ['billing', 'support', 'other'] }, expected: { routes: ['billing', 'support', 'other'] } },
  { name: '缩减到一个分类', kind: 'question-classifier', config: { routes: ['billing'] }, expected: { routes: ['billing'] } },
  { name: '清空分类数组', kind: 'question-classifier', config: { routes: [] }, expected: { routes: [] } },
  { name: 'null 清空分类', kind: 'question-classifier', config: { routes: null }, expected: { routes: [] } },
  { name: '分类规范字段优先于同次别名', kind: 'question-classifier', config: { routes: ['billing', 'support'], class1: 'wrong1', class2: 'wrong2' }, expected: { routes: ['billing', 'support'] } },
  { name: '分类中间空槽', kind: 'question-classifier', config: { routes: ['billing', '', 'other'] }, expected: { routes: ['billing', 'other'] } },
  { name: '分类开头空槽', kind: 'question-classifier', config: { routes: ['', 'support', 'other'] }, expected: { routes: ['support', 'other'] } },
]

describe.each(['add', 'update', 'load'] as const)('规范配置边界：%s', (mode) => {
  it.each(canonicalCases)('$name 不会复活默认值或遗漏隐藏项', ({ kind, config, expected }) => {
    const id = kind === 'output' ? 'end' : 'classifier'
    let workflow: WorkflowDefinition
    if (mode === 'add') {
      workflow = compile([
        { type: 'add_node', nodeId: 'begin', kind: 'start' },
        { type: 'add_node', nodeId: id, kind, config },
      ])
    } else if (mode === 'update') {
      const loaded = loadedWorkflow(kind)
      const base = snapshot(loaded.nodes, loaded.edges)
      const before = JSON.stringify(base)
      workflow = compile([{ type: 'update_node', nodeId: id, config }], base)
      expect(JSON.stringify(base)).toBe(before)
    } else {
      const graph = mapBackendDefinitionGraph([{ nodeId: id, nodeType: kind === 'output' ? 'END' : 'QUESTION_CLASSIFIER', config }])
      workflow = { id: 'new', name: '加载配置', ...graph }
    }
    const saved = configOf(workflow, id)
    // 精确比较规范字段，空对象不能只用 toMatchObject 检查。
    for (const [key, value] of Object.entries(expected)) expect(saved[key]).toEqual(value)
    const roundtrip = mapBackendDefinitionGraph(mapWorkflowToDefinitionDTO(workflow).nodes)
    expect(configOf({ ...workflow, ...roundtrip }, id)).toEqual(saved)
  })
})

describe('加载后人工编辑与连续补丁', () => {
  it('先清空输出值再改名，继续保留已生效的 completed 默认值', async () => {
    const store = useWorkflowStore()
    const graph = mapBackendDefinitionGraph([{ nodeId: 'end', nodeType: 'END', config: { output: { answer: 'oldValue', auxiliary: 'extra' } } }])
    store.applyWorkflowDefinition({ id: 'new', name: '连续编辑输出', ...graph })
    store.updateNodeConfig('end', 'outputValue', '')
    expect(store.nodes[0]?.data.config.output).toEqual({ answer: 'completed', auxiliary: 'extra' })
    store.updateNodeConfig('end', 'outputName', 'renamed')
    await store.saveCurrentWorkflow()
    const saved = transport.post.mock.calls.find(([url]) => url === '/workflows/definitions')![1]
    expect(saved.nodes[0].config.output).toEqual({ renamed: 'completed', auxiliary: 'extra' })
  })

  it('只修改输出名时保留规范配置中的空字符串值', () => {
    const store = useWorkflowStore()
    const graph = mapBackendDefinitionGraph([{ nodeId: 'end', nodeType: 'END', config: { output: { answer: '', auxiliary: 'extra' } } }])
    store.applyWorkflowDefinition({ id: 'new', name: '空字符串输出', ...graph })
    store.updateNodeConfig('end', 'outputName', 'renamed')
    expect(configOf({ id: 'new', name: '重命名后', nodes: store.nodes, edges: [] }, 'end').output)
      .toEqual({ renamed: '', auxiliary: 'extra' })
  })

  it('整数样式输出键重命名后继续编辑，仍保留所有未编辑键', async () => {
    const store = useWorkflowStore()
    const graph = mapBackendDefinitionGraph([{ nodeId: 'end', nodeType: 'END', config: { output: { '1': 'one', '2': 'two', auxiliary: 'extra' } } }])
    store.applyWorkflowDefinition({ id: 'new', name: '整数样式输出键', ...graph })
    store.updateNodeConfig('end', 'outputName', 'answer')
    expect(configOf({ id: 'new', name: '重命名后', nodes: store.nodes, edges: [] }, 'end').output)
      .toEqual({ answer: 'one', '2': 'two', auxiliary: 'extra' })
    store.updateNodeConfig('end', 'outputValue', 'newValue')
    await store.saveCurrentWorkflow()
    const saved = transport.post.mock.calls.find(([url]) => url === '/workflows/definitions')![1]
    const expected = { answer: 'newValue', '2': 'two', auxiliary: 'extra' }
    expect(saved.nodes[0].config.output).toEqual(expected)
    const reloaded = mapBackendDefinitionGraph(saved.nodes)
    expect(configOf({ id: 'new', name: '重新加载', ...reloaded }, 'end').output).toEqual(expected)
  })

  it.each(['renamed', '', '   '])('仅修改输出名 %j，保留未展示输出并支持撤销重做', async (name) => {
    const store = useWorkflowStore()
    const original = { answer: 'oldValue', auxiliary: 'extra' }
    const graph = mapBackendDefinitionGraph([{ nodeId: 'end', nodeType: 'END', config: { output: original } }])
    store.applyWorkflowDefinition({ id: 'new', name: '人工修改输出', ...graph })
    store.updateNodeConfig('end', 'outputName', name)
    const expected = { [name.trim() || 'result']: 'oldValue', auxiliary: 'extra' }
    expect(store.nodes[0]?.data.config.output).toEqual(expected)
    store.undo()
    expect(store.nodes[0]?.data.config.output).toEqual(original)
    store.redo()
    expect(store.nodes[0]?.data.config.output).toEqual(expected)
    store.updateNodeConfig('end', 'outputValue', 'newValue')
    await store.saveCurrentWorkflow()
    const saved = transport.post.mock.calls.find(([url]) => url === '/workflows/definitions')![1]
    expect(saved.nodes[0].config.output).toEqual({ [name.trim() || 'result']: 'newValue', auxiliary: 'extra' })
    expect(store.dirty).toBe(false)
  })

  it.each(['newValue', '', null, 0, false])('仅修改输出值 %j，保留输出名与其他键', (value) => {
    const store = useWorkflowStore()
    const graph = mapBackendDefinitionGraph([{ nodeId: 'end', nodeType: 'END', config: { output: { answer: 'oldValue', auxiliary: 'extra' } } }])
    store.applyWorkflowDefinition({ id: 'new', name: '人工修改输出值', ...graph })
    store.updateNodeConfig('end', 'outputValue', value)
    expect(configOf({ id: 'new', name: '人工修改输出值', nodes: store.nodes, edges: store.edges }, 'end').output)
      .toEqual({ answer: value === '' ? 'completed' : value, auxiliary: 'extra' })
  })

  it('只修改一个分类别名并连续清空、重新填写，始终保留第三路', async () => {
    const store = useWorkflowStore()
    const graph = mapBackendDefinitionGraph([{ nodeId: 'classifier', nodeType: 'QUESTION_CLASSIFIER', config: { routes: ['billing', 'support', 'other'] } }])
    store.applyWorkflowDefinition({ id: 'new', name: '人工修改分类', ...graph })
    store.updateNodeConfig('classifier', 'class1', 'sales')
    expect(store.nodes[0]?.data.config.routes).toEqual(['sales', 'support', 'other'])
    store.updateNodeConfig('classifier', 'class1', '')
    expect(configOf({ id: 'new', name: '清空首分类', nodes: store.nodes, edges: [] }, 'classifier').routes).toEqual(['support', 'other'])
    store.updateNodeConfig('classifier', 'class1', 'billing')
    store.updateNodeConfig('classifier', 'class2', 'technical')
    await store.saveCurrentWorkflow()
    const saved = transport.post.mock.calls.find(([url]) => url === '/workflows/definitions')![1]
    expect(saved.nodes[0].config.routes).toEqual(['billing', 'technical', 'other'])
  })

  it('后续别名补丁覆盖前次规范值，后续规范补丁又覆盖旧别名', () => {
    const workflow = compile([
      ...addEnd,
      { type: 'update_node', nodeId: 'end', config: { outputValue: 'manual' } },
    ])
    expect(configOf(workflow, 'end').output).toEqual({ answer: 'manual' })
    const updated = compile([{ type: 'update_node', nodeId: 'end', config: { output: { final: 'latest', auxiliary: 'extra' } } }], snapshot(workflow.nodes, workflow.edges))
    expect(configOf(updated, 'end').output).toEqual({ final: 'latest', auxiliary: 'extra' })
    expect(updated.nodes.find((node) => node.id === 'end')?.data.config).toMatchObject({ outputName: 'final', outputValue: 'latest' })
  })

  it('既有无标签边仍按顺序兼容分配', () => {
    const workflow = compile(addClassifier.map((operation) => operation.type === 'connect' ? { ...operation, label: undefined } : operation))
    expect(configOf(workflow, 'classifier').branches).toEqual({ billing: 'supportEnd', support: 'billingEnd' })
  })
})

const componentCases: Array<{ name: string; operations: CopilotCanvasEdit['operations']; id: string; expected: Record<string, unknown>; initialKind?: WorkflowNodeKind }> = [
  { name: '新增 END', operations: addEnd, id: 'end', expected: { output: { answer: 'completionText' } } },
  { name: '新增 CLASSIFIER', operations: addClassifier, id: 'classifier', expected: { routes: ['billing', 'support'], branches: { billing: 'billingEnd', support: 'supportEnd' } } },
  { name: '更新多键 END', initialKind: 'output', operations: [{ type: 'update_node', nodeId: 'end', config: { output: { answer: 'completionText', auxiliary: 'extra' } } }], id: 'end', expected: { output: { answer: 'completionText', auxiliary: 'extra' } } },
  { name: '清空 END', initialKind: 'output', operations: [{ type: 'update_node', nodeId: 'end', config: { output: {} } }], id: 'end', expected: { output: {} } },
  { name: '清空 CLASSIFIER', initialKind: 'question-classifier', operations: [{ type: 'update_node', nodeId: 'classifier', config: { routes: [] } }], id: 'classifier', expected: { routes: [] } },
  { name: '更新三路 CLASSIFIER', initialKind: 'question-classifier', operations: [
    { type: 'update_node', nodeId: 'classifier', config: { routes: ['billing', 'support', 'other'] } },
    { type: 'disconnect', source: 'classifier', target: 'supportEnd' },
    { type: 'disconnect', source: 'classifier', target: 'billingEnd' },
    { type: 'add_node', nodeId: 'otherEnd', kind: 'output' },
    { type: 'connect', source: 'classifier', target: 'otherEnd', label: 'other' },
    { type: 'connect', source: 'classifier', target: 'supportEnd', label: 'support' },
    { type: 'connect', source: 'classifier', target: 'billingEnd', label: 'billing' },
  ], id: 'classifier', expected: { routes: ['billing', 'support', 'other'], branches: { billing: 'billingEnd', support: 'supportEnd', other: 'otherEnd' } } },
]

describe('正常节点配置往返：真实组件和保存链路', () => {
  it.each(componentCases)('$name 从模型响应到真实组件、校验 DTO、store 与保存 DTO 均保值', async ({ operations, id, expected, initialKind }) => {
    const store = useWorkflowStore()
    const initial = initialKind ? loadedWorkflow(initialKind) : undefined
    if (initial) store.applyWorkflowDefinition(initial)
    const context = { ...snapshot(initial?.nodes, initial?.edges),
      workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId, backendVersion: store.backendVersion, editRevision: store.editRevision }
    store.templates = context.templates
    const originalNodes = JSON.stringify(store.nodes)
    const applyCanvasEdit = vi.fn((request) => store.applyCopilotWorkflowDraft(request))
    transport.editCanvas.mockResolvedValue({ message: { id: 'edit-normal', conversationId: 'conv-normal', role: 'assistant', content: '配置已生成', createdAt: '' },
      edit: { status: 'READY', explanation: '正常节点配置', operations } })
    const wrapper = mount(AICopilotPanel, { props: { context, applyCanvasEdit }, global: { plugins: [i18n] } })
    try {
      await flushPromises()
      await wrapper.find('form input').setValue('按指定字段配置节点')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(applyCanvasEdit).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain(i18n.global.t('copilot.editor.applied', { count: operations.length }))
      expect(store.dirty).toBe(true)
      const appliedNodes = JSON.stringify(store.nodes)
      store.undo()
      expect(JSON.stringify(store.nodes)).toBe(originalNodes)
      store.redo()
      expect(JSON.stringify(store.nodes)).toBe(appliedNodes)
      const validation = transport.post.mock.calls.find(([url]) => url === '/workflows/drafts/validate')![1].definition
      await store.saveCurrentWorkflow()
      const saved = initialKind ? transport.put.mock.calls[0]![1]
        : transport.post.mock.calls.find(([url]) => url === '/workflows/definitions')![1]
      const validatedConfig = validation.nodes.find((node: { nodeId: string }) => node.nodeId === id).config
      const savedConfig = saved.nodes.find((node: { nodeId: string }) => node.nodeId === id).config
      expect(validatedConfig).toEqual(savedConfig)
      for (const [key, value] of Object.entries(expected)) {
        expect(validatedConfig[key]).toEqual(value)
        expect(savedConfig[key]).toEqual(value)
      }
      const reloaded = mapBackendDefinitionGraph(saved.nodes)
      const reloadedConfig = configOf({ id: store.workflowId, name: store.workflowName, ...reloaded }, id)
      for (const [key, value] of Object.entries(expected)) expect(reloadedConfig[key]).toEqual(value)
      expect(store.dirty).toBe(false)
    } finally { wrapper.unmount() }
  })
})
