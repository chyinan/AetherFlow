// @vitest-environment jsdom
// 基于 task-6 独立复核的复现，补充锁内并发交错和显式冲突恢复。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useWorkflowStore } from '@/stores/workflowStore'
import { CUSTOM_NODE_STORAGE_KEY, bindCustomInputs, customNodeTemplate, defaultCustomDefinition, mergeCustomDefinitions, parseCustomDefinition, previewCustomNode } from '@/utils/customNodes'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import CustomFieldValue from '@/components/workflow/CustomFieldValue.vue'
import { installCustomNodeLockHarness } from '@/test/customNodeLockHarness'

let lockHarness: ReturnType<typeof installCustomNodeLockHarness>
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); lockHarness = installCustomNodeLockHarness() })
afterEach(() => lockHarness.restore())
describe('独立复核：工作流与模板契约', () => {
  it('API 节点和连线经过保存/加载保留快照及输入绑定', () => {
    const store = useWorkflowStore(), definition = defaultCustomDefinition()
    const custom = store.addNodeFromTemplate(customNodeTemplate(definition), { x: 0, y: 0 })!
    store.updateNodeConfig(custom.id, 'inputBindings', { text: 'question' })
    const dto = mapWorkflowToDefinitionDTO({ id: 'review', name: 'review', nodes: [custom, { id: 'end', type: 'workflow', position: { x: 300, y: 0 }, data: { kind: 'output', label: 'end', description: '', config: { output: { result: 'result' } }, inputs: [], outputs: [], status: 'idle' } }], edges: [{ id: 'link', source: custom.id, target: 'end' }] })
    expect(dto.nodes![0]!.config).toMatchObject({ customDefinition: definition, inputBindings: { text: 'question' }, nextNodes: ['end'] })
    const restored = mapBackendDefinitionGraph(dto.nodes!)
    expect(restored.edges[0]).toMatchObject({ source: custom.id, target: 'end' })
    expect(restored.nodes[0]!.data.config.customDefinition).toEqual(definition)
  })
  it('未知模板格式明确拒绝，不被默默解释成旧格式', () => {
    expect(() => parseCustomDefinition({ ...defaultCustomDefinition(), formatVersion: 2 })).toThrow('格式版本')
  })
})
describe('独立复核：预期契约缺口（应修复后转绿）', () => {
  it('第二个窗口保存新版本遇到修订冲突，同步后重试不丢失其他模板', async () => {
    const first = useWorkflowStore(createPinia()), second = useWorkflowStore(createPinia())
    first.reloadCustomDefinitions(); second.reloadCustomDefinitions()
    const a = { ...defaultCustomDefinition(), id: 'window-one' }, b = { ...defaultCustomDefinition(), id: 'window-two' }
    await first.saveCustomDefinitions(mergeCustomDefinitions(first.customDefinitions, [a]))
    await expect(second.saveCustomDefinitions(mergeCustomDefinitions(second.customDefinitions, [b]))).rejects.toThrow('其他窗口更新')
    expect(second.customDefinitions).toEqual([a])
    await second.saveCustomDefinitions(mergeCustomDefinitions(second.customDefinitions, [b]))
    expect(JSON.parse(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)!).nodes.map((node: { id: string }) => node.id)).toEqual(['window-one', 'window-two'])
  })
  it('调试预览必须验证被遮蔽请求头的占位符是否有值', () => {
    const definition = defaultCustomDefinition()
    definition.fields = [{ name: 'mode', type: 'STRING', required: false }]
    definition.request!.headers = { 'X-Mode': '{{config.mode}}' }
    expect(() => previewCustomNode(parseCustomDefinition(definition), {}, {}, { result: 'ok' })).toThrow('占位符没有值')
  })
  it('旧窗口不能静默覆盖另一个窗口已经保存的同 ID 同版本内容', async () => {
    const first = useWorkflowStore(createPinia()), second = useWorkflowStore(createPinia())
    first.reloadCustomDefinitions(); second.reloadCustomDefinitions()
    await first.saveCustomDefinitions([defaultCustomDefinition()])
    const changed = { ...defaultCustomDefinition(), name: '同版本但内容不同' }
    await expect(second.saveCustomDefinitions([changed])).rejects.toThrow('其他窗口更新')
    await expect(second.saveCustomDefinitions([changed])).rejects.toThrow('提升版本')
    await expect(second.saveCustomDefinitions([changed], true)).rejects.toThrow('提升版本')
  })
  it('可选枚举选择未设置后应该可以保存并运行', async () => {
    const field = { name: 'mode', type: 'STRING' as const, required: false, options: ['A', 'B'] }
    const wrapper = mount(CustomFieldValue, { props: { field, modelValue: 'A' } })
    try {
      await wrapper.find('select').setValue('')
      const definition = defaultCustomDefinition('CODE'); definition.fields = [field]
      const value = wrapper.emitted('update:modelValue')![0]![0]
      expect(value).toBeNull()
      expect(() => bindCustomInputs(definition, { customValues: { mode: value } })).not.toThrow()
      const template = customNodeTemplate(definition)
      const dto = mapWorkflowToDefinitionDTO({ id: 'enum', name: 'enum', nodes: [{ id: 'enum', type: 'workflow', position: { x: 0, y: 0 }, data: { ...template, config: { ...template.config, customValues: { mode: value } }, status: 'idle' } }], edges: [] })
      const restored = mapBackendDefinitionGraph(dto.nodes!).nodes[0]!
      expect(restored.data.config.customValues).toEqual({ mode: null })
      expect(bindCustomInputs(definition, restored.data.config).config).toEqual({})
    } finally { wrapper.unmount() }
  })
  it('同时提交的两个旧快照在独占锁内只有一个成功，冲突可重试', async () => {
    const first = useWorkflowStore(createPinia()), second = useWorkflowStore(createPinia())
    first.reloadCustomDefinitions(); second.reloadCustomDefinitions()
    let release!: () => void
    lockHarness.hold(new Promise<void>(resolve => { release = resolve }))
    const a = { ...defaultCustomDefinition(), id: 'concurrent-one' }, b = { ...defaultCustomDefinition(), id: 'concurrent-two' }
    const writes = [first.saveCustomDefinitions([a]), second.saveCustomDefinitions([b])]
    const resultsPromise = Promise.allSettled(writes); release()
    const results = await resultsPromise
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(JSON.parse(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)!).nodes).toEqual([a])
    await second.saveCustomDefinitions(mergeCustomDefinitions(second.customDefinitions, [b]))
    expect(JSON.parse(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)!).libraryRevision).toBe(2)
    expect(JSON.parse(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)!).nodes).toEqual([a, b])
  })
  it('没有跨窗口锁时明确拒绝写入，原库不变', async () => {
    Reflect.deleteProperty(navigator, 'locks')
    const store = useWorkflowStore()
    await expect(store.saveCustomDefinitions([defaultCustomDefinition()])).rejects.toThrow('跨窗口写入锁')
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
  })
  it('旧窗口删除时先提示冲突，重试只删除选中版本并保留并发新增项', async () => {
    const first = useWorkflowStore(createPinia()), second = useWorkflowStore(createPinia())
    const a = { ...defaultCustomDefinition(), id: 'remove-one' }, b = { ...defaultCustomDefinition(), id: 'keep-two' }, c = { ...defaultCustomDefinition(), id: 'new-three' }
    await first.saveCustomDefinitions([a, b]); second.reloadCustomDefinitions()
    await first.saveCustomDefinitions([a, b, c])
    await expect(second.saveCustomDefinitions([b])).rejects.toThrow('其他窗口更新')
    expect(second.customDefinitions).toEqual([a, b, c])
    await second.saveCustomDefinitions(second.customDefinitions.filter(definition => definition.id !== a.id))
    expect(JSON.parse(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)!).nodes).toEqual([b, c])
  })
  it('成功解析请求头后仅显示遮蔽值，头值无效时明确失败', () => {
    const definition = defaultCustomDefinition()
    definition.fields = [{ name: 'mode', type: 'STRING', required: false }]
    definition.request!.headers = { 'X-Mode': '{{config.mode}}' }
    const preview = previewCustomNode(definition, { customValues: { mode: 'private-header' } }, {}, { result: 'ok' })
    expect(JSON.stringify(preview)).not.toContain('private-header')
    expect('request' in preview && preview.request.headers).toEqual({ 'X-Mode': '••••' })
    expect(() => previewCustomNode(definition, { customValues: { mode: 'a\nb' } }, {}, { result: 'ok' })).toThrow('请求头值无效')
  })
})
