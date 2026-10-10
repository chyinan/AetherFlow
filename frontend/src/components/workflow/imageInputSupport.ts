// pattern: Functional Core
import type { WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'

export const MAX_SOURCE_IMAGE_BYTES = 5 * 1024 * 1024
export const SOURCE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
const IMAGE_TYPES = new Set(SOURCE_IMAGE_ACCEPT.split(','))
export type ImageInputErrorCode = 'unsupported' | 'tooLarge' | 'empty' | 'readFailed' | 'invalidImage' | 'cancelled'
export class ImageInputError extends Error {
  constructor(readonly code: ImageInputErrorCode) { super(code) }
}
export interface InlineImage { base64: string; contentType: string; preview: string }

export function validateImageFile(file: Pick<File, 'size' | 'type'>): void {
  if (!IMAGE_TYPES.has(file.type.toLowerCase())) throw new ImageInputError('unsupported')
  if (file.size <= 0) throw new ImageInputError('empty')
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new ImageInputError('tooLarge')
}

function imageType(header: string): string | null {
  if (header.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png'
  if (header.startsWith('\xff\xd8\xff')) return 'image/jpeg'
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp'
  return null
}

// 只从有界 Base64 和实际文件头构建预览，不将配置值直接用作 URL。
export function inlineImage(value: unknown): InlineImage | null {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_SOURCE_IMAGE_BYTES / 3) * 4 + 64) return null
  const dataUrl = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value)
  const base64 = dataUrl?.[2] ?? value
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null
  const bytes = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
  if (bytes <= 0 || bytes > MAX_SOURCE_IMAGE_BYTES) return null
  try {
    const contentType = imageType(atob(base64.slice(0, 32)))
    if (!contentType || (dataUrl && dataUrl[1] !== contentType)) return null
    return { base64, contentType, preview: `data:${contentType};base64,${base64}` }
  } catch { return null }
}

// 文件读取和解码均可取消；旧节点或旧选图的异步结果不能回写。
export function readImageFile(file: File, signal: AbortSignal): Promise<InlineImage> {
  return new Promise((resolve, reject) => {
    try { validateImageFile(file) } catch (error) { reject(error); return }
    if (signal.aborted) { reject(new ImageInputError('cancelled')); return }
    const reader = new FileReader()
    let decoder: HTMLImageElement | undefined
    let finished = false
    const finish = (error?: ImageInputError, result?: InlineImage) => {
      if (finished) return
      finished = true
      signal.removeEventListener('abort', cancel)
      reader.onload = reader.onerror = reader.onabort = null
      if (decoder) { decoder.onload = decoder.onerror = null; decoder.removeAttribute('src') }
      if (error) reject(error)
      else if (result) resolve(result)
    }
    const cancel = () => {
      finish(new ImageInputError('cancelled'))
      if (reader.readyState === FileReader.LOADING) reader.abort()
    }
    signal.addEventListener('abort', cancel, { once: true })
    reader.onerror = () => finish(new ImageInputError('readFailed'))
    reader.onabort = () => finish(new ImageInputError('cancelled'))
    reader.onload = () => {
      const result = inlineImage(reader.result)
      if (!result || result.contentType !== file.type.toLowerCase()) { finish(new ImageInputError('invalidImage')); return }
      decoder = new Image()
      decoder.onload = () => {
        if (!decoder?.naturalWidth || !decoder.naturalHeight || decoder.naturalWidth * decoder.naturalHeight > 40_000_000) {
          finish(new ImageInputError('invalidImage')); return
        }
        finish(undefined, result)
      }
      decoder.onerror = () => finish(new ImageInputError('invalidImage'))
      decoder.src = result.preview
    }
    try { reader.readAsDataURL(file) } catch { finish(new ImageInputError('readFailed')) }
  })
}

export interface UpstreamImageOutput { variable: string; nodeLabels: string[]; nodeIds: string[] }
const imageOutputByKind: Record<string, string> = {
  'image-generation': 'imageFileIds', upscale: 'upscaledImageFileIds', 'save-image': 'savedImageFileIds',
}
export function upstreamImageOutputs(nodeId: string, nodes: readonly WorkflowGraphNode[], edges: readonly WorkflowGraphEdge[]): UpstreamImageOutput[] {
  const visited = new Set([nodeId])
  const queue = [nodeId]
  while (queue.length) {
    const target = queue.shift()
    for (const edge of edges) {
      if (edge.target === target && !visited.has(edge.source)) { visited.add(edge.source); queue.push(edge.source) }
    }
  }
  const results = new Map<string, UpstreamImageOutput>()
  for (const node of nodes) {
    if (node.id === nodeId || !visited.has(node.id)) continue
    const variable = imageOutputByKind[node.data.kind]
    if (!variable) continue
    const result = results.get(variable) ?? { variable, nodeLabels: [], nodeIds: [] }
    result.nodeLabels.push(node.data.label || node.id)
    result.nodeIds.push(node.id)
    results.set(variable, result)
  }
  return [...results.values()]
}
