// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import { TextDecoder, TextEncoder } from 'node:util'
import ComfyWorkflowPanel from './ComfyWorkflowPanel.vue'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { buildWorkflowPreflight } from '@/utils/workflowPreflight'
import type { WorkflowDefinition } from '@/types/workflow'

vi.stubGlobal('TextDecoder', TextDecoder)

const ui = { nodes: [{ id: 1, type: 'ExamplePluginText', widgets_values: ['synthetic'] }], links: [], extra: { frontendVersion: 'test' } }
const api = { first: { class_type: 'KSampler', inputs: { steps: 30, seed: 11 } }, second: { class_type: 'KSampler', inputs: { steps: 20, seed: 22 } }, plugin: { class_type: 'ExamplePluginText', inputs: { text: 'synthetic' } } }
function panel(config: Record<string, unknown>, locale = 'zh-CN') {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: {} })
  return mount(ComfyWorkflowPanel, { props: { nodeId: 'image', config }, global: { plugins: [i18n] } })
}
function fileBytes(text: string) {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}
function workflow(config: Record<string, unknown>): WorkflowDefinition {
  return { id: 'test', name: 'test', edges: [], nodes: [{ id: 'image', type: 'workflow', position: { x:0,y:0 }, data: { kind:'image-generation', label:'image', description:'', inputs:[], outputs:[], status:'idle', config: { provider:'COMFYUI', mode:'workflow', ...config } } }] }
}
describe('ComfyUI 导入与参数绑定', () => {
  it('说明外层封装、原图节点、未解析文本及转换路径，不自动修改配置', () => {
    const wrapper = panel({ workflow:ui, workflowJson:ui, comfyImport:{ positiveStatus:'unresolved' } })
    expect(wrapper.text()).toContain('4 个 AF 外层节点')
    expect(wrapper.text()).toContain('1 个节点')
    expect(wrapper.text()).toContain('ExamplePluginText')
    expect(wrapper.text()).toContain('不能运行')
    expect(wrapper.text()).toContain('没有用负向文本代替')
    expect(JSON.parse(wrapper.get('[data-testid="comfy-source"]').text())).toEqual(ui)
    expect(wrapper.emitted('update')).toBeUndefined()
    const issues = buildWorkflowPreflight(workflow({ workflowJson:ui }), [], { catalogLoaded:false, capabilitiesLoaded:false })
    expect(issues.some(issue => issue.level === 'blocking' && issue.field === 'workflowJson' && issue.detail?.includes('导出 API'))).toBe(true)
    wrapper.unmount()
  })
  it('载入 API 图时保留原图并清空旧绑定，选择目标后才产生覆盖', async () => {
    const config = { workflow:ui, workflowJson:ui, workflowBindings:[{ nodeId:'old', inputName:'text', parameter:'prompt' }] }
    const wrapper = panel(config)
    const text = JSON.stringify(api)
    Object.defineProperty(wrapper.get<HTMLInputElement>('[data-testid="comfy-api-file"]').element, 'files', { value:[{ arrayBuffer:async () => fileBytes(text) }], configurable:true })
    await wrapper.get('[data-testid="comfy-api-file"]').trigger('change'); await flushPromises()
    expect(wrapper.emitted('update')).toBeUndefined()
    expect(wrapper.emitted('replace-workflow')).toEqual([[{ workflowJson: text, workflowBindings: [] }, 'image']])
    expect(config.workflow).toEqual(ui)
    await wrapper.setProps({ config: { ...config, workflowJson:api, workflowBindings:[] } })
    await wrapper.get('[data-testid="comfy-target"]').setValue(JSON.stringify(['second','steps']))
    await wrapper.get('[data-testid="comfy-parameter"]').setValue('steps')
    await wrapper.get('[data-testid="comfy-add-binding"]').trigger('click')
    expect(wrapper.emitted('update')?.at(-1)).toEqual(['workflowBindings',[{ nodeId:'second', inputName:'steps', parameter:'steps' }]])
    wrapper.unmount()
  })
  it('复合替换没有既存原图字段时，会在同一补丁保留旧执行图为原图', async () => {
    const previousGraph = { '1': { class_type: 'KSampler', inputs: { seed: 5 } } }
    const wrapper = panel({ workflowJson: previousGraph, workflowBindings:[{ nodeId:'old', inputName:'seed', parameter:'seed' }] })
    const text = JSON.stringify(api)
    Object.defineProperty(wrapper.get<HTMLInputElement>('[data-testid="comfy-api-file"]').element, 'files', { value:[{ arrayBuffer:async () => fileBytes(text) }], configurable:true })

    await wrapper.get('[data-testid="comfy-api-file"]').trigger('change'); await flushPromises()

    expect(wrapper.emitted('replace-workflow')).toEqual([[
      { workflow: previousGraph, workflowJson: text, workflowBindings: [] },
      'image',
    ]])
    wrapper.unmount()
  })
  it('保存映射保留两份图、绑定、解析状态；API 图不被静态预检拦为 UI', () => {
    const config = { workflow:ui, workflowJson:api, workflowBindings:[{ nodeId:'second', inputName:'steps', parameter:'steps' }], comfyImport:{ positiveStatus:'unresolved' } }
    const dto = mapWorkflowToDefinitionDTO(workflow(config)).nodes![0]!.config!
    expect(dto).toMatchObject(config)
    expect(buildWorkflowPreflight(workflow(config), [], { catalogLoaded:false, capabilitiesLoaded:false }).filter(issue => issue.field === 'workflowJson')).toEqual([])
    const bad = workflow({ ...config, workflowBindings:[{ nodeId:'second', inputName:'missing', parameter:'steps' }] })
    expect(buildWorkflowPreflight(bad, [], { catalogLoaded:false, capabilitiesLoaded:false }).some(issue => issue.level === 'blocking' && issue.field === 'workflowBindings')).toBe(true)
  })
  it('载入大整数与 Unicode API 文本时只解析用于清单，存储原文不舍入', async () => {
    const text = '\uFEFF{\n "large": {"class_type":"KSampler","inputs":{"seed":9007199254740993,"noise_seed":18446744073709551615,"text":"café","nfd":"é"},"_meta":{"title":"保留元数据"}}\n}\n'
    const wrapper = panel({ workflow: ui, workflowJson: ui })
    Object.defineProperty(wrapper.get<HTMLInputElement>('[data-testid="comfy-api-file"]').element, 'files', { value:[{ arrayBuffer:async () => fileBytes(text) }], configurable:true })

    await wrapper.get('[data-testid="comfy-api-file"]').trigger('change'); await flushPromises()

    expect(wrapper.emitted('replace-workflow')).toEqual([[{ workflowJson: text, workflowBindings: [] }, 'image']])
    wrapper.unmount()
  })
  it('异步读文件期间切换节点，不把结果写入新节点', async () => {
    let resolve!: (value:string) => void
    const wrapper = panel({ workflow:ui, workflowJson:ui })
    Object.defineProperty(wrapper.get<HTMLInputElement>('[data-testid="comfy-api-file"]').element, 'files', { value:[{ arrayBuffer:() => new Promise<ArrayBuffer>(r => { resolve = (value) => r(fileBytes(value)) }) }] })
    await wrapper.get('[data-testid="comfy-api-file"]').trigger('change')
    await wrapper.setProps({ nodeId:'other' }); resolve(JSON.stringify(api)); await flushPromises()
    expect(wrapper.emitted('update')).toBeUndefined(); wrapper.unmount()
  })
  it.each(['en','ja'])('%s 提供转换引导和节点清单', locale => {
    const wrapper = panel({ workflow:ui, workflowJson:ui },locale)
    expect(wrapper.text()).toContain('API JSON'); expect(wrapper.text()).toContain('ExamplePluginText'); wrapper.unmount()
  })
})
