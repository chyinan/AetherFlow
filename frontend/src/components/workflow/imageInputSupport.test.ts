// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'
import { ImageInputError, inlineImage, MAX_SOURCE_IMAGE_BYTES, readImageFile, upstreamImageOutputs, validateImageFile } from './imageInputSupport'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5AAAAABJRU5ErkJggg=='
const file = () => new File([Uint8Array.from(atob(png), (char) => char.charCodeAt(0))], 'image.png', { type: 'image/png' })
function node(id: string, kind: WorkflowGraphNode['data']['kind']): WorkflowGraphNode {
  return { id, type: 'workflow', position: { x: 0, y: 0 }, data: { kind, label: id, description: '', config: {}, inputs: [], outputs: [], status: 'idle' } }
}
function edge(source: string, target: string): WorkflowGraphEdge { return { id: `${source}-${target}`, source, target } }

describe('图片输入校验与预览边界', () => {
  it.each(['image/svg+xml', 'text/plain', '', 'image/gif'])('拒绝类型 %s', (type) => {
    expect(() => validateImageFile({ type, size: 1 })).toThrowError(new ImageInputError('unsupported'))
  })
  it('拒绝空文件和超过 5 MiB 的文件，允许边界', () => {
    expect(() => validateImageFile({ type: 'image/png', size: 0 })).toThrowError(new ImageInputError('empty'))
    expect(() => validateImageFile({ type: 'image/png', size: MAX_SOURCE_IMAGE_BYTES + 1 })).toThrowError(new ImageInputError('tooLarge'))
    expect(() => validateImageFile({ type: 'image/png', size: MAX_SOURCE_IMAGE_BYTES })).not.toThrow()
  })
  it('从真实文件头构建本地预览，支持原始 Base64 和安全 Data URL', () => {
    expect(inlineImage(png)).toEqual({ base64: png, contentType: 'image/png', preview: `data:image/png;base64,${png}` })
    expect(inlineImage(`data:image/png;base64,${png}`)?.base64).toBe(png)
    expect(inlineImage(`data:image/jpeg;base64,${png}`)).toBeNull()
  })
  it.each(['https://example.test/image.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'not-base64', 'YQ==', '{{ imageUrls }}', 'file:///tmp/image.png'])('不将配置 %s 作为预览 URL', (value) => {
    expect(inlineImage(value)).toBeNull()
  })
  it('已存储的超限 Base64 不参与预览', () => {
    expect(inlineImage('A'.repeat(Math.ceil(MAX_SOURCE_IMAGE_BYTES / 3) * 4 + 68))).toBeNull()
  })
})

describe('图片文件异步读取', () => {
  afterEach(() => vi.unstubAllGlobals())
  function mockDecoder(valid = true) {
    vi.stubGlobal('Image', class {
      naturalWidth = 1; naturalHeight = 1
      onload?: () => void; onerror?: () => void
      set src(_value: string) { queueMicrotask(() => valid ? this.onload?.() : this.onerror?.()) }
      removeAttribute() {}
    })
  }
  it('校验解码后返回原始 Base64，不把 Data URL 写进执行参数', async () => {
    mockDecoder()
    await expect(readImageFile(file(), new AbortController().signal)).resolves.toMatchObject({ base64: png, contentType: 'image/png' })
  })
  it('拒绝 MIME 伪装、损坏内容和不可解码的图片', async () => {
    mockDecoder(false)
    await expect(readImageFile(new File(['not a PNG'], 'fake.png', { type: 'image/png' }), new AbortController().signal)).rejects.toMatchObject({ code: 'invalidImage' })
    await expect(readImageFile(file(), new AbortController().signal)).rejects.toMatchObject({ code: 'invalidImage' })
  })
  it('拒绝超过像素上限的解码结果', async () => {
    vi.stubGlobal('Image', class {
      naturalWidth = 10000; naturalHeight = 10000
      onload?: () => void; onerror?: () => void
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
      removeAttribute() {}
    })
    await expect(readImageFile(file(), new AbortController().signal)).rejects.toMatchObject({ code: 'invalidImage' })
  })
  it('解码阶段取消会清除本地图片源且不提交结果', async () => {
    let decoder: { onload?: () => void; removeAttribute: ReturnType<typeof vi.fn> } | undefined
    vi.stubGlobal('FileReader', class {
      static LOADING = 1
      readyState = 2
      abort = vi.fn()
      result = `data:image/png;base64,${png}`
      onload?: () => void
      readAsDataURL() { this.onload?.() }
    })
    vi.stubGlobal('Image', class {
      naturalWidth = 1; naturalHeight = 1
      onload?: () => void; onerror?: () => void
      removeAttribute = vi.fn()
      constructor() { decoder = this }
      set src(_value: string) {}
    })
    const controller = new AbortController(); const result = readImageFile(file(), controller.signal)
    controller.abort()
    await expect(result).rejects.toMatchObject({ code: 'cancelled' })
    expect(decoder?.removeAttribute).toHaveBeenCalledWith('src')
    expect(decoder?.onload).toBeNull()
  })
  it('FileReader 失败转为可呈现错误', async () => {
    vi.stubGlobal('FileReader', class {
      onerror?: () => void
      readAsDataURL() { queueMicrotask(() => this.onerror?.()) }
    })
    await expect(readImageFile(file(), new AbortController().signal)).rejects.toMatchObject({ code: 'readFailed' })
  })
  it('读取前或读取中取消均停止结果提交', async () => {
    const cancelled = new AbortController(); cancelled.abort()
    await expect(readImageFile(file(), cancelled.signal)).rejects.toMatchObject({ code: 'cancelled' })
    const active = new AbortController(); const pending = readImageFile(file(), active.signal); active.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
  })
})

describe('真实上游图片变量', () => {
  it('只列出已连通的祖先，使用真实文件 ID 数组变量', () => {
    const nodes = [node('generate', 'image-generation'), node('save', 'save-image'), node('bridge', 'prompt'), node('current', 'upscale'), node('downstream', 'image-generation'), node('unconnected', 'image-generation')]
    expect(upstreamImageOutputs('current', nodes, [edge('generate', 'bridge'), edge('bridge', 'current'), edge('save', 'current'), edge('current', 'downstream')])).toEqual([
      { variable: 'imageFileIds', nodeLabels: ['generate'], nodeIds: ['generate'] },
      { variable: 'savedImageFileIds', nodeLabels: ['save'], nodeIds: ['save'] },
    ])
  })
  it('同名全局变量合并显示，并能处理重复边和循环', () => {
    const nodes = [node('a', 'image-generation'), node('b', 'image-generation'), node('current', 'upscale')]
    const result = upstreamImageOutputs('current', nodes, [edge('a', 'b'), edge('b', 'a'), edge('b', 'current'), edge('b', 'current')])
    expect(result).toEqual([{ variable: 'imageFileIds', nodeLabels: ['a', 'b'], nodeIds: ['a', 'b'] }])
  })
})
