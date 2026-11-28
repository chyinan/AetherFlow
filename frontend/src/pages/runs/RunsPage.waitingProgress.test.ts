// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RunsPage from './RunsPage.vue'
import { useRunStore } from '@/stores/runStore'
import { i18n } from '@/i18n'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client/apiClient', async original => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get, post: mocks.post } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))
let wrapper: ReturnType<typeof mount> | undefined
let state: string
let liveProgress: number | null
const summary = () => ({ id: 101, definitionId: 7, workflowName: 'Whisper summary', status: state,
  nodes: [{ nodeId: 'start', status: 'SUCCESS' }, { nodeId: 'whisper', status: state }, { nodeId: 'summary', status: 'PENDING' }, { nodeId: 'end', status: 'PENDING' }] })
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); i18n.global.locale.value = 'zh-CN'; state = 'WAITING'; liveProgress = null
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { total: 1, items: [summary()] }
    if (url === '/workflow-instances/101') return summary()
    if (url.endsWith('/logs') || url.endsWith('/children') || url.startsWith('/workflow/runtime/events/')) return []
    if (url.startsWith('/workflow/runtime/observability/')) {
      return liveProgress === null ? null : { workflowId: '101', runtimeState: state, progress: liveProgress }
    }
    throw new Error(`Unexpected read ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime() })
async function setup(path = '/runs') {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id?', name: 'run-detail', component: RunsPage }] })
  await router.push(path); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } }); await flushPromises()
  return { store: useRunStore(), router }
}
function detailProgress() { return wrapper!.findAll('p').find(p => p.text() === i18n.global.t('runs.progress'))?.element.nextElementSibling?.textContent?.trim() }
function historyFill() { return wrapper!.get('[data-testid="history-run"]').findAll('div').find(div => div.attributes('style')?.includes('width:')) }
it('does not present the WAITING list placeholder as completed progress before opening details', async () => {
  const { store } = await setup()
  expect(store.historyRuns[0]).toMatchObject({ status: 'waiting', progress: 100 })
  expect(historyFill()).toBeUndefined()
  expect(wrapper!.get('[data-testid="history-run-progress-pending"]').text()).toBe('进度待确认')
  expect(mocks.post).not.toHaveBeenCalled()
})
it('keeps progress unconfirmed when a WAITING detail has no numeric observation, then uses actual progress and completion', async () => {
  const { store } = await setup('/runs/run-101')
  expect(store.currentRun).toMatchObject({ status: 'waiting', progress: 100 })
  expect(detailProgress()).toBe('进度待确认')
  expect(wrapper!.findAll('button').some(button => button.text() === i18n.global.t('runs.cancel'))).toBe(true)
  state = 'RUNNING'; liveProgress = 0.25
  await store.refreshRuns('run-101'); await flushPromises()
  expect(store.currentRun).toMatchObject({ status: 'running', progress: 25 })
  expect(detailProgress()).toBe('25%')
  expect(historyFill()!.attributes('style')).toContain('25%')
  state = 'SUCCESS'; liveProgress = 1
  await store.refreshRuns('run-101'); await flushPromises()
  expect(detailProgress()).toBe('100%')
  expect(historyFill()!.attributes('style')).toContain('100%')
})
it('preserves a genuine numeric progress update while WAITING', async () => {
  liveProgress = 0.25
  const { store } = await setup('/runs/run-101')
  expect(store.currentRun).toMatchObject({ status: 'waiting', progress: 25 })
  expect(detailProgress()).toBe('25%')
  expect(historyFill()!.attributes('style')).toContain('25%')
})
it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('renders the unconfirmed marker in %s without altering the stored placeholder', async locale => {
  i18n.global.locale.value = locale
  const { store } = await setup()
  expect(wrapper!.get('[data-testid="history-run-progress-pending"]').text()).toBe(({ 'zh-CN': '进度待确认', 'en-US': 'Progress not yet confirmed', 'ja-JP': '進捗は未確定です' })[locale])
  expect(store.historyRuns[0]?.progress).toBe(100)
})

it.each(['SUCCESS', 'FAILED', 'CANCELLED'])('preserves 100 percent for terminal %s summaries', async terminal => {
  state = terminal
  const { store } = await setup('/runs/run-101')
  expect(store.currentRun?.progress).toBe(100)
  expect(detailProgress()).toBe('100%')
  expect(historyFill()!.attributes('style')).toContain('100%')
  expect(wrapper!.find('[data-testid="history-run-progress-pending"]').exists()).toBe(false)
})
