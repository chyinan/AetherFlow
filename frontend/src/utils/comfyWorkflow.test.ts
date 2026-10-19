import { describe, expect, it } from 'vitest'
import { comfyBindingError, describeComfyGraph } from './comfyWorkflow'
describe('ComfyUI 格式边界', () => {
  it('保留未知插件；拒绝混合格式、重复 ID 和错误输入结构', () => {
    expect(describeComfyGraph({ x:{class_type:'UnverifiedPlugin',inputs:{ custom:42 },_meta:{title:'test'}} }).format).toBe('API')
    expect(describeComfyGraph({ nodes:[{id:1,type:'Plugin'}], x:{class_type:'Plugin'} }).format).toBe('INVALID')
    expect(describeComfyGraph({ nodes:[{id:1,type:'Plugin'},{id:1,type:'Plugin'}] }).format).toBe('INVALID')
    expect(describeComfyGraph({ x:{class_type:'Plugin',inputs:[]} }).format).toBe('INVALID')
    expect(describeComfyGraph({}).format).toBe('INVALID')
  })
  it('按 nodeId/inputName 检查绑定，禁止错误目标和重复覆盖', () => {
    const graph = { 'node.with.dot': { class_type:'Plugin',inputs:{ 'input.with.dot':'old' } } }
    const binding = {nodeId:'node.with.dot',inputName:'input.with.dot',parameter:'prompt'}
    expect(comfyBindingError([binding],graph)).toBeNull()
    expect(comfyBindingError([binding,binding],graph)).toContain('重复')
    expect(comfyBindingError([{...binding,inputName:'missing'}],graph)).toContain('不存在')
  })
})
