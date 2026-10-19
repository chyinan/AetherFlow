// pattern: Imperative Shell
import { describe, expect, it } from 'vitest'
import type { CopilotCanvasEdit, CopilotCanvasOperation } from '@/types/copilotCanvasEdit'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { customNodeTemplate, defaultCustomDefinition, type CustomDefinition } from '@/utils/customNodes'
import { hasCustomNodeDraftOperations, prepareCustomNodeDraft } from './copilotCustomNodeDraft'
import type { WorkflowCopilotSnapshot } from './workflowCopilotActions'

function snapshot(): WorkflowCopilotSnapshot {
  return { workflowId: 'new', workflowName: '草稿测试', nodes: [], edges: [],
    templates: nodeTemplates.map((template) => ({ ...template, availability: { available: template.kind !== 'code', reason: '测试能力' } })) }
}

function draft(definition = defaultCustomDefinition(), operations: CopilotCanvasOperation[] = []): CopilotCanvasEdit {
  return { status: 'READY', explanation: '预览自定义模板', operations: [
    { type: 'create_custom_node', draftId: 'draft-1', definition }, ...operations,
  ] }
}

function additions(definition: CustomDefinition): CopilotCanvasOperation[] {
  return [
    { type: 'add_node', nodeId: 'start', kind: 'start' },
    { type: 'add_node', nodeId: 'custom', kind: definition.kind === 'API' ? 'http-request' : 'code',
      customNodeId: definition.id, customNodeVersion: definition.version },
    { type: 'connect', source: 'start', target: 'custom' },
  ]
}

describe('Copilot 自定义节点草稿', () => {
  it.each(['API', 'CODE'] as const)('仅创建 %s 草稿时允许空画布，且不写入模板库', (kind) => {
    const definition = defaultCustomDefinition(kind), base = snapshot()
    const original = JSON.stringify(base)
    const result = prepareCustomNodeDraft(draft(definition), base)
    expect(result).toEqual({ ok: true, definitions: [definition], canvasEdit: null, previewGraph: null })
    expect(JSON.stringify(base)).toBe(original)
    if (!result.ok) return
    expect(result.definitions[0]).not.toBe(definition)
    definition.name = '调用方后续修改'
    expect(result.definitions[0]!.name).not.toBe(definition.name)
  })

  it.each(['API', 'CODE'] as const)('先编译 %s 草稿和整批画布操作，并剥离创建操作', (kind) => {
    const definition = defaultCustomDefinition(kind), edit = draft(definition, additions(definition)), base = snapshot()
    const result = prepareCustomNodeDraft(edit, base)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.canvasEdit?.operations).toEqual(additions(definition))
    expect(result.previewGraph?.nodes).toHaveLength(2)
    expect(result.previewGraph?.edges).toHaveLength(1)
    const node = result.previewGraph!.nodes.find((item) => item.id === 'custom')!
    expect(node.data.config.customDefinition).toEqual(definition)
    expect(node.data.status).toBe('idle')
    expect(node.data.runtime?.lastResult).toContain('尚未运行')
    if (kind === 'CODE') expect(node.data).toHaveProperty('availability.available', false)
    expect(base.nodes).toHaveLength(0)
    expect(base.templates.every((template) => !template.config.customDefinition)).toBe(true)
    expect(edit.operations).toHaveLength(4)
  })

  it('允许添加操作排在草稿之前，但仍按精确版本解析', () => {
    const definition = defaultCustomDefinition('CODE'), edit = draft(definition, additions(definition))
    // 连线必须在节点创建后；定义本身可出现在画布操作之后。
    edit.operations = [...additions(definition), edit.operations[0]!]
    const result = prepareCustomNodeDraft(edit, snapshot())
    expect(result.ok).toBe(true)
  })

  it('预览取消和重复准备没有副作用；保存失败重试可复用相同草稿', () => {
    const definition = defaultCustomDefinition('CODE'), edit = draft(definition, additions(definition)), base = snapshot()
    const initial = JSON.stringify({ edit, base })
    expect(prepareCustomNodeDraft(edit, base)).toEqual(prepareCustomNodeDraft(edit, base))
    expect(JSON.stringify({ edit, base })).toBe(initial)
  })

  it('已保存的相同版本允许重试，内容不同则在保存前拒绝', () => {
    const definition = defaultCustomDefinition('CODE'), base = snapshot()
    base.templates.push(customNodeTemplate(definition, base.templates.find((item) => item.kind === 'code')))
    expect(prepareCustomNodeDraft(draft(definition, additions(definition)), base).ok).toBe(true)
    const result = prepareCustomNodeDraft(draft({ ...definition, name: '同版本覆盖' }), base)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('提升版本')
  })

  it('同批不同草稿不能重复 draftId 或模板 ID 与版本', () => {
    const first = defaultCustomDefinition(), second = defaultCustomDefinition('CODE')
    const duplicateId = draft(first, [{ type: 'create_custom_node', draftId: 'draft-1', definition: second }])
    const duplicateVersion = draft(first, [{ type: 'create_custom_node', draftId: 'draft-2', definition: first }])
    expect(prepareCustomNodeDraft(duplicateId, snapshot()).ok).toBe(false)
    expect(prepareCustomNodeDraft(duplicateVersion, snapshot()).ok).toBe(false)
  })

  it('任一画布操作无效时拒绝整批，避免先保存部分草稿', () => {
    const definition = defaultCustomDefinition()
    const edit = draft(definition, [...additions(definition), { type: 'connect', source: 'custom', target: 'missing' }])
    expect(prepareCustomNodeDraft(edit, snapshot()).ok).toBe(false)
  })

  it.each([
    { ...defaultCustomDefinition(), version: 'latest' },
    { ...defaultCustomDefinition('CODE'), code: '' },
    { ...defaultCustomDefinition('CODE'), code: 'return "[redacted]"' },
    { ...defaultCustomDefinition(), request: { method: 'GET', url: 'file:///tmp/file', headers: {} } },
    JSON.parse(JSON.stringify(defaultCustomDefinition()).replace('"formatVersion":1', '"formatVersion":1,"__proto__":{}')),
  ])('拒绝不合法或包含脱敏占位的草稿定义', (definition) => {
    expect(prepareCustomNodeDraft(draft(definition as CustomDefinition), snapshot()).ok).toBe(false)
  })

  it('拒绝不合法操作形状、未就绪和非草稿编辑', () => {
    const edit = draft()
    edit.operations[0]!.nodeId = 'unreviewed'
    expect(prepareCustomNodeDraft(edit, snapshot()).ok).toBe(false)
    expect(prepareCustomNodeDraft({ ...draft(), status: 'NEEDS_CLARIFICATION' }, snapshot()).ok).toBe(false)
    const ordinary: CopilotCanvasEdit = { status: 'READY', explanation: '普通编辑', operations: additions(defaultCustomDefinition()) }
    expect(hasCustomNodeDraftOperations(ordinary)).toBe(false)
    expect(prepareCustomNodeDraft(ordinary, snapshot()).ok).toBe(false)
  })
})
