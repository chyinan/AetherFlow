// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getNodeConnections: vi.fn(),
  createNodeConnection: vi.fn(),
  updateNodeConnection: vi.fn(),
  probeNodeConnection: vi.fn(),
  probeSavedNodeConnection: vi.fn(),
}))
vi.mock('@/api/modules/nodeConnections', () => mocks)
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/api/client/apiError', () => ({
  toApiError: (cause: unknown) => ({ message: cause instanceof Error ? cause.message : String(cause) }),
}))
vi.mock('./nodeConnectionMessages', () => ({ nodeConnectionMessages: {} }))
vi.mock('@/utils/comfyWorkflow', () => ({ describeComfyGraph: () => ({ format: 'JSON', nodes: [] }) }))
vi.mock('./nodeConnectionChecklist', () => ({
  buildNodeConnectionChecklist: () => [],
  connectionCatalogOptions: () => [],
  isKnownConnectionCatalog: () => false,
}))
import NodeConnectionSelector from './NodeConnectionSelector.vue'
import type { NodeConnection } from '@/api/modules/nodeConnections'

const saved: NodeConnection = {
  id: 'saved-comfy', name: 'Studio', provider: 'COMFYUI',
  baseUrl: 'http://image-service:8188', readOnly: false,
}
const syntheticProbe = {
  status: 'unconfigured',
  message: 'synthetic inert catalog-recovery fixture',
  detectedFrom: 'backend',
  models: { checkpoints: [], vaes: [], loras: [], samplers: [], schedulers: [], upscalers: [] },
  capabilities: [],
}

const wrappers: Array<ReturnType<typeof mount>> = []
function render() {
  const wrapper = mount(NodeConnectionSelector, {
    attachTo: document.body,
    props: { nodeId: 'node-a', nodeType: 'IMAGE_GENERATION', config: { provider: 'COMFYUI', connectionId: saved.id } },
    global: { stubs: { Teleport: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('saved node connection catalog load and retry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    mocks.getNodeConnections.mockResolvedValue({ connections: [] })
    mocks.probeSavedNodeConnection.mockResolvedValue(syntheticProbe)
  })
  afterEach(() => {
    wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  })

  it('lets the user reload after an authoritative list temporarily omits the configured profile', async () => {
    mocks.getNodeConnections
      .mockResolvedValueOnce({ connections: [] })
      .mockResolvedValueOnce({ connections: [saved] })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find('[data-testid="missing-connection"]').exists()).toBe(true)
    expect((wrapper.get('[data-testid="connection-select"]').element as HTMLSelectElement).value).toBe(saved.id)
    const refresh = wrapper.get('[data-testid="refresh-connection"]')
    expect(refresh.attributes('disabled')).toBeUndefined()

    await refresh.trigger('click')
    await flushPromises()

    expect(mocks.getNodeConnections).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="missing-connection"]').exists()).toBe(false)
    expect(wrapper.findAll('[role="alert"]').map(item => item.text()).join(' ')).not.toContain('synthetic')
    expect((wrapper.get('[data-testid="connection-select"]').element as HTMLSelectElement).value).toBe(saved.id)
    expect(wrapper.get('[data-testid="connection-select"]').find('option[value="saved-comfy"]').text()).toContain('Studio')
    // The follow-up diagnostic call is only a local mock; no network was accessed.
    expect(mocks.probeSavedNodeConnection).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="selected-status"]').text()).toContain('synthetic inert catalog-recovery fixture')
  })

  it('keeps a saved selection and reports a failed refresh without claiming the profile is missing', async () => {
    mocks.getNodeConnections
      .mockResolvedValueOnce({ connections: [saved] })
      .mockRejectedValueOnce(new Error('synthetic catalog refresh failure'))
    const wrapper = render()
    await flushPromises()
    expect((wrapper.get('[data-testid="connection-select"]').element as HTMLSelectElement).value).toBe(saved.id)

    await wrapper.get('[data-testid="refresh-connection"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[role="alert"]').map(item => item.text()).join(' ')).toContain('synthetic catalog refresh failure')
    expect(wrapper.find('[data-testid="missing-connection"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="connection-select"] option[value="saved-comfy"]').exists()).toBe(true)
  })

  it('surfaces an initial list error, then recovers via refresh without losing the configured ID', async () => {
    mocks.getNodeConnections
      .mockRejectedValueOnce(new Error('synthetic initial catalog failure'))
      .mockResolvedValueOnce({ connections: [saved] })
    const wrapper = render()
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('synthetic initial catalog failure')
    expect(wrapper.find('[data-testid="missing-connection"]').exists()).toBe(false)
    expect((wrapper.get('[data-testid="connection-select"]').element as HTMLSelectElement).value).toBe(saved.id)
    expect(wrapper.get('[data-testid="refresh-connection"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-testid="refresh-connection"]').trigger('click')
    await flushPromises()

    expect(mocks.getNodeConnections).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('[role="alert"]').map(item => item.text()).join(' ')).not.toContain('synthetic')
    expect(wrapper.find('[data-testid="missing-connection"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="connection-select"]').find('option[value="saved-comfy"]').text()).toContain('Studio')
  })
})
