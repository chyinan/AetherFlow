// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import StructuredMappingEditor from './StructuredMappingEditor.vue'
import { defaultMapping } from '@/utils/structuredMapping'
const wrappers: VueWrapper[] = []
function render(config: Record<string, unknown> = {}) {
  const wrapper = mount(StructuredMappingEditor, { props: { nodeId: 'mapper-1', config } })
  wrappers.push(wrapper); return wrapper
}
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
describe('结构化映射编辑器', () => {
  it('载入 Whisper 示例、预览和应用，示例输入不会写入节点配置', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="whisper-example"]').trigger('click')
    expect(wrapper.emitted('apply')).toBeUndefined()
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    expect(JSON.parse(wrapper.get('[data-testid="mapping-preview-output"]').text())).toEqual([
      '请为 0–2.5 秒的片段生成画面提示词：清晨的海边', '请为 3–5 秒的片段生成画面提示词：远处的帆船',
    ])
    await wrapper.get('[data-testid="apply-mapping"]').trigger('click')
    const [values, id] = wrapper.emitted('apply')![0] as [Record<string, unknown>, string]
    expect(id).toBe('mapper-1'); expect(values.outputVariable).toBe('promptList')
    expect(values).not.toHaveProperty('input'); expect(values).not.toHaveProperty('sample')
    expect(values.mapping).toMatchObject({ operation: 'map', sourcePath: 'segments', shape: 'value', value: { type: 'template' }, filter: { enabled: true } })
  })
  it('嵌套对象字段可增删，JSON 常量解析错误时禁止应用并保留已保存配置', async () => {
    const config = { mapping: defaultMapping(), outputVariable: 'mapped' }
    const wrapper = render(config)
    await wrapper.get('[aria-label="取值方式 1"]').setValue('literal')
    await wrapper.get('[aria-label="字段值 1"]').setValue('{invalid')
    expect(wrapper.get('[data-testid="mapping-config-error"]').text()).toContain('合法 JSON')
    expect(wrapper.get('[data-testid="apply-mapping"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(config.mapping.fields[0]!.type).toBe('path')
    await wrapper.get('[aria-label="字段值 1"]').setValue('{"active":true,"count":3}')
    await wrapper.get('[aria-label="目标字段 1"]').setValue('meta.detail')
    await wrapper.get('[data-testid="apply-mapping"]').trigger('click')
    expect((wrapper.emitted('apply')![0]![0] as { mapping: unknown }).mapping).toMatchObject({ fields: [{ target: 'meta.detail', type: 'literal', value: { active: true, count: 3 } }] })
    await wrapper.get('[data-testid="add-mapping-field"]').trigger('click')
    expect(wrapper.findAll('[data-testid="mapping-field"]')).toHaveLength(2)
    await wrapper.get('[aria-label="删除字段 2"]').trigger('click')
    expect(wrapper.findAll('[data-testid="mapping-field"]')).toHaveLength(1)
  })
  it('输入与配置更改后清空旧预览，错误输入可修正后重试', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="whisper-example"]').trigger('click')
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    await wrapper.get('[data-testid="mapping-source"]').setValue('missing')
    expect(wrapper.find('[data-testid="mapping-preview-output"]').exists()).toBe(false)
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    expect(wrapper.get('[data-testid="mapping-preview-error"]').text()).toContain('字段路径不存在')
    await wrapper.get('[data-testid="mapping-source"]').setValue('segments')
    await wrapper.get('[data-testid="mapping-preview-input"]').setValue('not json')
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    expect(wrapper.find('[data-testid="mapping-preview-error"]').exists()).toBe(true)
    await wrapper.get('[data-testid="mapping-preview-input"]').setValue('{"segments":[]}')
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    expect(wrapper.get('[data-testid="mapping-preview-output"]').text()).toBe('[]')
  })
  it('切换节点丢弃未应用草稿，外部撤销重新加载配置，Vue 响应式对象可安全编辑', async () => {
    const wrapper = render(reactive({ mapping: defaultMapping(), outputVariable: 'saved' }))
    await wrapper.get('[data-testid="mapping-source"]').setValue('draft')
    await wrapper.setProps({ nodeId: 'mapper-2', config: { mapping: { ...defaultMapping(), sourcePath: 'other' }, outputVariable: 'next' } })
    expect((wrapper.get('[data-testid="mapping-source"]').element as HTMLInputElement).value).toBe('other')
    await wrapper.setProps({ config: { mapping: defaultMapping(), outputVariable: 'undo' } })
    await wrapper.get('[data-testid="apply-mapping"]').trigger('click')
    expect(wrapper.emitted('apply')![0]).toEqual([expect.objectContaining({ outputVariable: 'undo', mapping: expect.objectContaining({ sourcePath: 'segments' }) }), 'mapper-2'])
  })
  it('数组 filter 要求条件，数字比较保留 JSON 类型，不把 0 当空值', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="mapping-operation"]').setValue('filter')
    expect(wrapper.find('[data-testid="mapping-config-error"]').exists()).toBe(true)
    await wrapper.get('[data-testid="mapping-filter-enabled"]').setValue(true)
    await wrapper.get('[data-testid="mapping-filter-path"]').setValue('score')
    await wrapper.get('[data-testid="mapping-filter-operator"]').setValue('gte')
    await wrapper.get('[data-testid="mapping-filter-value"]').setValue('0')
    await wrapper.get('[data-testid="mapping-preview-input"]').setValue('{"segments":[{"score":0},{"score":-1},{"score":2}]}')
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    expect(JSON.parse(wrapper.get('[data-testid="mapping-preview-output"]').text())).toEqual([{ score: 0 }, { score: 2 }])
  })
  it('重复预览不写配置，反复应用保持相同节点与配置', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="whisper-example"]').trigger('click')
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    await wrapper.get('[data-testid="preview-mapping"]').trigger('click')
    expect(wrapper.emitted('apply')).toBeUndefined()
    await wrapper.get('[data-testid="apply-mapping"]').trigger('click')
    await wrapper.get('[data-testid="apply-mapping"]').trigger('click')
    expect(wrapper.emitted('apply')![0]).toEqual(wrapper.emitted('apply')![1])
  })
})
