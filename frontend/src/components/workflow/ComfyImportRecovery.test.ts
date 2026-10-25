// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import ComfyWorkflowPanel from '@/components/workflow/ComfyWorkflowPanel.vue'
import { buildWorkflowPreflight } from '@/utils/workflowPreflight'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { WorkflowDefinition, WorkflowGraphNode, WorkflowNodeKind, NodeTemplate } from '@/types/workflow'
const api={n:{class_type:'CLIPTextEncode',inputs:{text:'synthetic positive'}}}
const ui={nodes:[{id:1,type:'PluginText',widgets_values:['synthetic']}],links:[]}
const node=(id:string,kind:WorkflowNodeKind,config:Record<string,unknown>):WorkflowGraphNode=>({id,type:'workflow',position:{x:0,y:0},data:{kind,label:id,config,inputs:[],outputs:[],description:'',status:'idle'}})
function panel(config:Record<string,unknown>) {
  return mount(ComfyWorkflowPanel,{props:{nodeId:'image-generation',config},global:{plugins:[createI18n({legacy:false,locale:'zh-CN',messages:{}})]}})
}
describe('独立复核：执行图编辑及 UI→API 恢复',()=>{
  it('普通空 PROMPT 仍必填，导入摘要模式才允许未解析',()=>{
    const template:NodeTemplate={...nodeTemplates.find(n=>n.kind==='prompt')!,configSchema:[{name:'prompt',type:'STRING',required:true}]}
    for(const stylePreset of [undefined,'ordinary']) {
      const graph:WorkflowDefinition={id:'w',name:'ordinary',nodes:[node('prompt','prompt',{prompt:'',stylePreset})],edges:[]}
      expect(buildWorkflowPreflight(graph,[template],{catalogLoaded:true,capabilitiesLoaded:true})).toContainEqual(expect.objectContaining({level:'blocking',field:'prompt',code:'required'}))
    }
  })
  it.each([{workflowJson:api},{workflowJson:JSON.stringify(api)},{workflow:api},{workflow:JSON.stringify(api)}])('等价执行图表示可以枚举和校验同一个绑定 %j',async representation=>{
    const w=panel({provider:'COMFYUI',mode:'workflow',...representation,workflowBindings:[{nodeId:'n',inputName:'text',parameter:'prompt'}]})
    expect(w.text()).not.toContain('绑定目标不存在');expect(w.text()).not.toContain('执行图格式无效')
    expect(w.find('[data-testid="comfy-target"]').exists()).toBe(true)
    w.unmount()
  })
  it('旧 workflow 别名所显示的有效输入应能添加显式绑定',async()=>{
    const w=panel({provider:'COMFYUI',mode:'workflow',workflow:api})
    await w.get('[data-testid="comfy-target"]').setValue(JSON.stringify(['n','text']))
    await w.get('[data-testid="comfy-add-binding"]').trigger('click')
    console.log('alias binding result',w.text().slice(-200))
    expect(w.emitted('update')).toEqual([['workflowBindings',[{nodeId:'n',inputName:'text',parameter:'prompt'}]]])
    w.unmount()
  })
  it('未解析摘要的 UI 图载入 API 后不应残留必填 prompt 阻断',async()=>{
    const config:Record<string,unknown>={provider:'COMFYUI',mode:'workflow',workflow:ui,workflowJson:ui,workflowBindings:[],promptVariable:'prompt',negativePromptVariable:'negativePrompt',comfyImport:{positiveStatus:'unresolved'}}
    const w=panel(config)
    Object.defineProperty(w.get<HTMLInputElement>('[data-testid="comfy-api-file"]').element,'files',{value:[{text:async()=>JSON.stringify(api)}],configurable:true})
    await w.get('[data-testid="comfy-api-file"]').trigger('change');await flushPromises()
    const replacement = w.emitted('replace-workflow')?.[0]?.[0] as Record<string, unknown> | undefined
    Object.assign(config, replacement)
    const graph:WorkflowDefinition={id:'w',name:'review',nodes:[node('prompt','prompt',{prompt:'',negativePrompt:'synthetic negative',stylePreset:'comfyui-import'}),node('image-generation','image-generation',config)],edges:[{id:'p-i',source:'prompt',target:'image-generation'}]}
    const prompt:NodeTemplate={...nodeTemplates.find(n=>n.kind==='prompt')!,configSchema:[{name:'prompt',type:'STRING',required:true}]}
    const issues=buildWorkflowPreflight(graph,[prompt],{catalogLoaded:true,capabilitiesLoaded:true})
    console.log('UI-to-API blocking issues',JSON.stringify(issues.filter(x=>x.level==='blocking')))
    expect(issues.filter(x=>x.field==='workflowJson')).toEqual([])
    expect(issues.filter(x=>x.level==='blocking'&&x.nodeId==='prompt')).toEqual([])
    w.unmount()
  })
})
