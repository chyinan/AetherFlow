// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { ModelApiSnapshot } from '@/services/api/modelApi'
import { useModelStore } from '@/stores/modelStore'
import { i18n } from '@/i18n'
import ModelsPage from './ModelsPage.vue'

// Fixed presentation fixture only. No real identity, network, or provider mutation.
const fixture = vi.hoisted(() => ({
  auth: { isAdmin: true, token: 'model-page-focus-fixture', user: { id: 'fixed-fixture' } },
  refresh: vi.fn(),
  forbidden: vi.fn(() => { throw new Error('Provider writes are forbidden in this focus test') }),
}))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => fixture.auth }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: {
  refreshSnapshot: fixture.refresh,
  switchPrimaryProvider: fixture.forbidden,
  recoverProvider: fixture.forbidden,
} }))

const snapshot: ModelApiSnapshot = {
  source: 'real', policies: [], models: [], logs: [],
  providers: [{
    id: 'provider-ollama', providerType: 'OLLAMA', name: 'Fixture Ollama', runtime: 'local',
    status: 'unknown', endpoint: '', defaultModel: 'fixture-model', latencyMs: 0, quotaUsed: 0,
    capabilities: ['chat'], lastCheckedAt: '--',
  }],
}
const unavailable = { status: 503, source: 'ai', message: 'Fixture temporary catalog failure' }
let wrapper: VueWrapper | undefined

function deferred() {
  let resolve!: (value: ModelApiSnapshot) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<ModelApiSnapshot>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function renderFailure() {
  fixture.refresh.mockRejectedValueOnce(unavailable)
  wrapper = mount(ModelsPage, { attachTo: document.body, global: {
    plugins: [i18n], stubs: { RouterLink: { template: '<a href="/settings"><slot /></a>' } },
  } })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(unavailable.message)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  i18n.global.locale.value = 'zh-CN'
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  document.body.innerHTML = ''
  expect(fixture.forbidden).not.toHaveBeenCalled()
})

it.each(['success', 'failure'] as const)('focused inline retry retains a stable focus through a %s response', async result => {
  const page = await renderFailure()
  const pending = deferred()
  fixture.refresh.mockReturnValueOnce(pending.promise)
  const retry = page.get<HTMLButtonElement>('[role="alert"] button')
  retry.element.focus()
  expect(document.activeElement).toBe(retry.element)
  await retry.trigger('click')
  await flushPromises()
  expect(page.find('[role="alert"]').exists()).toBe(false)
  expect(useModelStore().loading).toBe(true)
  expect(document.activeElement?.tagName).toBe('H1')
  const stableFocus = document.activeElement
  if (result === 'success') pending.resolve(snapshot)
  else pending.reject(unavailable)
  await flushPromises()
  expect(document.activeElement).toBe(stableFocus)
  expect(document.activeElement?.tagName).toBe('H1')
  expect(fixture.refresh).toHaveBeenCalledTimes(2)
})

it.each(['success', 'failure'] as const)('a late %s receipt never steals focus after the user moves to configuration', async result => {
  const page = await renderFailure()
  const pending = deferred()
  fixture.refresh.mockReturnValueOnce(pending.promise)
  const retry = page.get<HTMLButtonElement>('[role="alert"] button')
  retry.element.focus()
  await retry.trigger('click')
  const configuration = page.get<HTMLAnchorElement>('a[href="/settings"]').element
  configuration.focus()
  if (result === 'success') pending.resolve(snapshot)
  else pending.reject(unavailable)
  await flushPromises()
  expect(document.activeElement).toBe(configuration)
})

it('the persistent top refresh control keeps its own focus', async () => {
  const page = await renderFailure()
  const pending = deferred()
  fixture.refresh.mockReturnValueOnce(pending.promise)
  const refresh = page.get<HTMLButtonElement>('header button')
  refresh.element.focus()
  await refresh.trigger('click')
  expect(document.activeElement).toBe(refresh.element)
  pending.resolve(snapshot)
  await flushPromises()
  expect(document.activeElement).toBe(refresh.element)
  expect(fixture.refresh).toHaveBeenCalledTimes(2)
})

it('an unfocused inline retry does not take focus from another control', async () => {
  const page = await renderFailure()
  fixture.refresh.mockResolvedValueOnce(snapshot)
  const configuration = page.get<HTMLAnchorElement>('a[href="/settings"]').element
  configuration.focus()
  await page.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(configuration)
})
