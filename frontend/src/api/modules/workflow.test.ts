import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    post: mocks.post,
  },
}))

import { importComfyUiWorkflow } from './workflow'

describe('workflow module', () => {
  beforeEach(() => {
    mocks.post.mockReset()
    mocks.post.mockResolvedValue({ name: 'Imported ComfyUI', nodes: [] })
  })

  it('imports a ComfyUI workflow through the public workflow endpoint', async () => {
    const payload = {
      name: 'Imported ComfyUI',
      description: 'from ComfyUI',
      projectId: 12,
      workflowJson: { '1': { class_type: 'KSampler', inputs: {} } },
    }

    await importComfyUiWorkflow(payload)

    expect(mocks.post).toHaveBeenCalledWith(
      '/workflows/definitions/import/comfyui',
      payload,
      { source: 'workflow' },
    )
  })
})
