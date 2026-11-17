import { describe, expect, it } from 'vitest'
import { comfyBindingError, describeComfyGraph, readComfyWorkflowFile } from './comfyWorkflow'
describe('ComfyUI 格式边界', () => {
  it('保留未知插件；拒绝混合格式、重复 ID 和错误输入结构', () => {
    expect(describeComfyGraph({ x:{class_type:'UnverifiedPlugin',inputs:{ custom:42 },_meta:{title:'test'}} }).format).toBe('API')
    expect(describeComfyGraph('\uFEFF{"x":{"class_type":"Plugin"}}').format).toBe('API')
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
  it('严格解码 UTF-8 并保留 BOM 与组合字符，不替换无效字节', async () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"nfc":"é","nfd":"é"}')])
    const file = { arrayBuffer: async () => bytes.buffer as ArrayBuffer } as Blob
    const text = await readComfyWorkflowFile(file)
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(new TextEncoder().encode(text)).toEqual(bytes)
    const invalid = { arrayBuffer: async () => Uint8Array.from([0xff]).buffer } as Blob
    await expect(readComfyWorkflowFile(invalid)).rejects.toThrow('有效的 UTF-8 文本')
  })
})
