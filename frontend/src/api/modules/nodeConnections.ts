// pattern: Imperative Shell
import { apiClient } from '@/api/client/apiClient'

export type ImageConnectionProvider = 'COMFYUI' | 'STABLE_DIFFUSION_WEBUI'
export type ImageConnectionNodeType = 'IMAGE_GENERATION' | 'UPSCALE'
export type ImageCatalog = 'checkpoints' | 'vaes' | 'loras' | 'samplers' | 'schedulers' | 'upscalers'
export interface NodeConnectionPayload {
  name: string
  provider: ImageConnectionProvider
  baseUrl: string
}
export interface NodeConnection extends NodeConnectionPayload {
  id: string
  readOnly: boolean
}
export interface NodeConnectionProbe {
  status: 'unconfigured' | 'unreachable' | 'missing_model' | 'usable'
  message: string
  detectedFrom: 'backend'
  models: Record<ImageCatalog, string[]>
  capabilities: string[]
  warnings?: string[]
  unavailableCatalogs?: string[]
}
export interface ProbeNodeConnectionPayload {
  provider: ImageConnectionProvider
  baseUrl: string
  checkpoint?: string
  nodeType?: ImageConnectionNodeType
}
export interface WhisperEnvironment {
  status: 'unconfigured' | 'unreachable' | 'unloaded' | 'missing_model' | 'usable'
  enabled: boolean
  model: string
  device: string
  computeType: string
  loadedModel: string | null
  dependencyAvailable: boolean
  ffmpegAvailable: boolean
  detectedFrom: 'backend'
  restartRequired: boolean
  message: string
}

const root = '/ai/node-connections'
export function getNodeConnections() {
  return apiClient.get<{ connections: NodeConnection[] }>(root, { source: 'ai' })
}
export function createNodeConnection(payload: NodeConnectionPayload) {
  return apiClient.post<NodeConnection>(root, payload, { source: 'ai' })
}
export function updateNodeConnection(id: string, payload: NodeConnectionPayload) {
  return apiClient.put<NodeConnection>(`${root}/${encodeURIComponent(id)}`, payload, { source: 'ai' })
}
export function probeNodeConnection(payload: ProbeNodeConnectionPayload) {
  return apiClient.post<NodeConnectionProbe>(`${root}/probe`, payload, { source: 'ai' })
}
export function probeSavedNodeConnection(id: string, nodeType: ImageConnectionNodeType, checkpoint?: string) {
  return apiClient.get<NodeConnectionProbe>(`${root}/${encodeURIComponent(id)}/probe`, {
    params: { nodeType, ...(checkpoint ? { checkpoint } : {}) }, source: 'ai',
  })
}
export function getWhisperEnvironment() {
  return apiClient.get<WhisperEnvironment>(`${root}/whisper`, { source: 'ai' })
}
