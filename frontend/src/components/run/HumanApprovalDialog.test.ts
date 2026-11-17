// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { approveHumanNode } = vi.hoisted(() => ({
  approveHumanNode: vi.fn(),
}))

vi.mock('@/api/modules/runtime', async () => {
  const actual = await vi.importActual<typeof import('@/api/modules/runtime')>('@/api/modules/runtime')
  return { ...actual, approveHumanNode }
})

import HumanApprovalDialog from './HumanApprovalDialog.vue'
import { i18n } from '@/i18n'

describe('HumanApprovalDialog', () => {
  beforeEach(() => {
    approveHumanNode.mockReset()
    approveHumanNode.mockResolvedValue({ runtimeState: 'SUCCESS' })
  })

  it('submits approval decision and calls the captured completion handler', async () => {
    const onCompleted = vi.fn()
    const wrapper = mount(HumanApprovalDialog, {
      props: {
        onCompleted,
        request: {
          instanceId: 101,
          nodeId: 'node-human',
          nodeLabel: '人工审批',
          details: {
            approved: false,
            approvalStatus: 'pending',
            reviewer: 'ops',
            method: 'webapp',
          },
        },
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })

    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
    document.body.querySelector<HTMLButtonElement>('[data-action="approve"]')?.click()
    await flushPromises()

    expect(approveHumanNode).toHaveBeenCalledWith(101, 'node-human', expect.objectContaining({ approved: true }))
    expect(onCompleted).toHaveBeenCalledWith({
      approved: true,
      snapshot: { runtimeState: 'SUCCESS' },
    }, { instanceId: 101, nodeId: 'node-human' })
    wrapper.unmount()
  })
})
