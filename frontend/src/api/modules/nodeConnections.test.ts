import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: mocks }))
import { createNodeConnection, getNodeConnections, getWhisperEnvironment, probeNodeConnection, probeSavedNodeConnection, updateNodeConnection } from './nodeConnections'

describe('节点连接 API', () => {
  beforeEach(() => vi.clearAllMocks())
  it('读取认证后的连接目录和 Whisper 只读快照', async () => {
    await getNodeConnections(); await getWhisperEnvironment()
    expect(mocks.get).toHaveBeenCalledWith('/ai/node-connections', { source: 'ai' })
    expect(mocks.get).toHaveBeenCalledWith('/ai/node-connections/whisper', { source: 'ai' })
    expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled()
  })
  it('区分临时测试、保存和已保存连接探测', async () => {
    const payload = { name: 'Comfy', provider: 'COMFYUI' as const, baseUrl: 'http://image-service:8188' }
    await probeNodeConnection({ provider: payload.provider, baseUrl: payload.baseUrl, nodeType: 'UPSCALE' })
    await createNodeConnection(payload)
    await updateNodeConnection('user/connection', payload)
    await probeSavedNodeConnection('user/connection', 'IMAGE_GENERATION', 'model.safetensors')
    expect(mocks.post).toHaveBeenCalledWith('/ai/node-connections/probe', { provider: 'COMFYUI', baseUrl: payload.baseUrl, nodeType: 'UPSCALE' }, { source: 'ai' })
    expect(mocks.post).toHaveBeenCalledWith('/ai/node-connections', payload, { source: 'ai' })
    expect(mocks.put).toHaveBeenCalledWith('/ai/node-connections/user%2Fconnection', payload, { source: 'ai' })
    expect(mocks.get).toHaveBeenCalledWith('/ai/node-connections/user%2Fconnection/probe', { params: { nodeType: 'IMAGE_GENERATION', checkpoint: 'model.safetensors' }, source: 'ai' })
  })
})
