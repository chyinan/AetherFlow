import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: {
    post: mocks.post,
    get: mocks.get,
  },
}))

import { cancelWorkflowInstance, copyDefinition, importComfyUiWorkflow, listWorkflowTemplates } from './workflow'

describe('workflow module', () => {
  beforeEach(() => {
    mocks.post.mockReset()
    mocks.post.mockResolvedValue({ name: 'Imported ComfyUI', nodes: [] })
    mocks.get.mockResolvedValue([])
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

  it('exposes copy, preset template, and durable cancellation endpoints', async () => {
    await copyDefinition(10, { name: 'Copy' })
    await listWorkflowTemplates()
    await cancelWorkflowInstance(99)

    expect(mocks.post).toHaveBeenCalledWith('/workflows/definitions/10/copy', { name: 'Copy' }, { source: 'workflow' })
    expect(mocks.get).toHaveBeenCalledWith('/workflows/templates', { source: 'workflow' })
    expect(mocks.post).toHaveBeenCalledWith('/workflow/runtime/instances/99/cancel', {}, { source: 'workflow' })
  })
})
