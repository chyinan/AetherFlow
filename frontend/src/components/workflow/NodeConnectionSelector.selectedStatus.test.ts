// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeConnection, NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import NodeConnectionSelector from './NodeConnectionSelector.vue'

const api = vi.hoisted(() => ({
  getNodeConnections: vi.fn(),
  probeSavedNodeConnection: vi.fn(),
}))
vi.mock('@/api/modules/nodeConnections', () => api)

const saved: NodeConnection = {
  id: 'saved-comfy',
  name: 'Studio',
  provider: 'COMFYUI',
  baseUrl: 'http://image-service:8188',
  readOnly: false,
}
const summary = '[data-testid="selected-probe-announcement"]'
const resultCard = '[data-testid="selected-status"]'
const notice = 'Catalog entries should stay outside the status announcement'

function probe(status: NodeConnectionProbe['status'] = 'usable'): NodeConnectionProbe {
  return {
    status,
    message: 'Connection diagnostic: ' + status,
    detectedFrom: 'backend',
    models: { checkpoints: ['image.safetensors'], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: [] },
    capabilities: status === 'usable' ? ['IMAGE_GENERATION'] : [],
    warnings: [notice],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}

describe('current connection diagnostic announcement', () => {
  let wrapper: VueWrapper

  function render() {
    wrapper = mount(NodeConnectionSelector, {
      attachTo: document.body,
      props: { nodeId: 'node-a', nodeType: 'IMAGE_GENERATION', config: { provider: 'COMFYUI', connectionId: saved.id } },
      global: { plugins: [i18n] },
    })
    return wrapper
  }

  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    api.getNodeConnections.mockResolvedValue({ connections: [saved] })
  })
  afterEach(() => wrapper?.unmount())

  it.each(['usable', 'unreachable', 'unconfigured', 'missing_model'] as const)(
    'announces the current %s result through a pre-existing atomic status',
    async (status) => {
      const pending = deferred<NodeConnectionProbe>()
      api.probeSavedNodeConnection.mockReturnValueOnce(pending.promise)
      const editor = render()
      await flushPromises()
      const beforeResult = editor.find(summary)
      const beforeElement = beforeResult.exists() ? beforeResult.element : null
      const initialText = beforeResult.exists() ? beforeResult.text() : null
      expect(editor.find(resultCard).exists()).toBe(false)

      const outcome = probe(status)
      pending.resolve(outcome)
      await flushPromises()

      expect(api.probeSavedNodeConnection).toHaveBeenCalledWith(saved.id, 'IMAGE_GENERATION', undefined)
      const card = editor.get(resultCard)
      expect(card.text()).toContain(outcome.message)
      expect(card.text()).toContain(notice)
      expect(beforeElement).not.toBeNull()
      expect(initialText).toBe('')
      const announcement = card.get(summary)
      expect(announcement.element).toBe(beforeElement)
      expect(announcement.attributes('role')).toBe('status')
      expect(announcement.attributes('aria-atomic')).toBe('true')
      expect(announcement.findAll('p')).toHaveLength(2)
      expect(announcement.get('p.font-semibold').text()).not.toBe('')
      expect(announcement.get('p:last-child').text()).toBe(outcome.message)
      expect(announcement.text()).not.toContain(notice)
    },
  )

  it('clears the same announcer during refresh and ignores late cancelled results', async () => {
    const late = deferred<NodeConnectionProbe>()
    api.probeSavedNodeConnection.mockResolvedValueOnce(probe()).mockReturnValueOnce(late.promise)
    const editor = render()
    await flushPromises()
    const region = editor.get(summary).element
    expect(region.textContent).toContain(probe().message)

    await editor.get('[data-testid="refresh-connection"]').trigger('click')
    await flushPromises()
    expect(editor.get(summary).element).toBe(region)
    expect(region.textContent?.trim()).toBe('')
    await editor.get('[data-testid="cancel-current-test"]').trigger('click')
    late.resolve(probe('unreachable'))
    await flushPromises()

    expect(editor.get(summary).element).toBe(region)
    expect(region.textContent?.trim()).toBe('')
    expect(editor.find(resultCard).exists()).toBe(false)
    expect(editor.text()).not.toContain(probe('unreachable').message)
    expect(editor.emitted('apply')).toBeUndefined()
    expect(editor.emitted('updateConfig')).toBeUndefined()
  })

  it('keeps a failed request in its existing alert instead of the result announcer', async () => {
    const failure = 'Synthetic request interruption'
    api.probeSavedNodeConnection.mockRejectedValueOnce(new Error(failure))
    const editor = render()
    await flushPromises()

    expect(editor.findAll('[role="alert"]').filter((alert) => alert.text().includes(failure))).toHaveLength(1)
    expect(editor.get(summary).text()).toBe('')
    expect(editor.find(resultCard).exists()).toBe(false)
  })
})
