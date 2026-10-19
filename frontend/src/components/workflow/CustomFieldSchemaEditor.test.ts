// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CustomFieldSchemaEditor from './CustomFieldSchemaEditor.vue'
import { customNodeTemplate, defaultCustomDefinition, exportCustomDefinitions, importCustomDefinitions, parseCustomDefinition, type CustomField } from '@/utils/customNodes'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'

describe('自定义字段类型转换', () => {
  for (const group of ['inputs', 'fields', 'outputs'] as const) for (const type of ['NUMBER', 'BOOLEAN', 'OBJECT', 'ARRAY'] as const) {
    it.each([{ options: ['A', 'B'] }, { options: [] }])(`${group} STRING 枚举改为 ${type} 移除选项并可保存往返（选项 $options）`, async ({ options }) => {
      let fields: CustomField[] = [{ name: 'converted', type: 'STRING', required: false, options, ...(group === 'outputs' ? { path: '/value' } : {}) }]
      const wrapper = mount(CustomFieldSchemaEditor, { props: { label: group, output: group === 'outputs', modelValue: fields, 'onUpdate:modelValue': (next: CustomField[]) => { fields = next; void wrapper.setProps({ modelValue: next }) } } })
      try {
        await wrapper.find('select').setValue(type)
        expect(fields[0]!.type).toBe(type)
        expect(Object.hasOwn(fields[0]!, 'options')).toBe(false)
        expect(wrapper.text()).not.toContain('枚举选项')
        const definition = defaultCustomDefinition('CODE'); definition[group] = fields
        expect(parseCustomDefinition(definition)[group]).toEqual(fields)
        const imported = importCustomDefinitions(exportCustomDefinitions([definition]))[0]!
        const template = customNodeTemplate(imported)
        const dto = mapWorkflowToDefinitionDTO({ id: 'convert', name: 'convert', nodes: [{ id: 'custom', type: 'workflow', position: { x: 0, y: 0 }, data: { ...template, status: 'idle' } }], edges: [] })
        const restored = mapBackendDefinitionGraph(dto.nodes!).nodes[0]!
        expect((restored.data.config.customDefinition as typeof definition)[group]).toEqual(fields)
      } finally { wrapper.unmount() }
    })
  }

  it('不兼容默认值保留并显示反馈，可显式清空后保存，切回 STRING 不恢复旧选项', async () => {
    let fields: CustomField[] = [{ name: 'mode', type: 'STRING', options: ['A', 'B'], defaultValue: 'A' }]
    const wrapper = mount(CustomFieldSchemaEditor, { props: { label: '表单', modelValue: fields, 'onUpdate:modelValue': (next: CustomField[]) => { fields = next; void wrapper.setProps({ modelValue: next }) } } })
    try {
      await wrapper.find('select').setValue('NUMBER')
      expect(fields[0]!.defaultValue).toBe('A')
      expect(wrapper.find('[role="alert"]').text()).toContain('NUMBER')
      await wrapper.findAll('button').find(button => button.text() === '清空不兼容默认值')!.trigger('click')
      expect(Object.hasOwn(fields[0]!, 'defaultValue')).toBe(false)
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      const definition = defaultCustomDefinition('CODE'); definition.fields = fields
      expect(() => parseCustomDefinition(definition)).not.toThrow()
      await wrapper.find('select').setValue('STRING')
      expect(Object.hasOwn(fields[0]!, 'options')).toBe(false)
    } finally { wrapper.unmount() }
  })
})
