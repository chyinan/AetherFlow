// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import type { WhisperEnvironment } from '@/api/modules/nodeConnections'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'

const api = vi.hoisted(() => ({
  getNodeCatalog: vi.fn(),
  getWorkflowCapabilities: vi.fn(),
  getWhisperEnvironment: vi.fn(),
}))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: api.getNodeCatalog }))
vi.mock('@/api/modules/ai', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/modules/ai')>(),
  getWorkflowCapabilities: api.getWorkflowCapabilities,
}))
vi.mock('@/api/modules/nodeConnections', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/modules/nodeConnections')>(),
  getWhisperEnvironment: api.getWhisperEnvironment,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const disabledReason = 'Whisper 未启用，请配置后端运行环境'
const environment: WhisperEnvironment = {
  status: 'usable', enabled: true, model: 'small', device: 'cpu', computeType: 'int8',
  loadedModel: 'small', dependencyAvailable: true, ffmpegAvailable: true,
  detectedFrom: 'backend', restartRequired: false, message: '后端运行时已就绪',
}
const wrappers: VueWrapper[] = []

function capabilities(available: boolean, reason = disabledReason): AiWorkflowCapabilities {
  return {
    runtimeReachable: true, llmExecutable: false, whisperExecutable: available,
    llmProviders: [], imageProviders: [], supportedNodeTypes: ['WHISPER'],
    executableNodeTypes: available ? ['WHISPER'] : [],
    unavailableReasons: available ? {} : { WHISPER: reason },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolve = resolveValue
    reject = rejectValue
  })
  return { promise, resolve, reject }
}

async function render(available = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  api.getWorkflowCapabilities.mockResolvedValue(capabilities(available))
  await store.loadNodeTemplates()
  const template = store.templates.find((item) => item.kind === 'whisper')!
  const node = store.addNodeFromTemplate(template, { x: 0, y: 0 })!
  expect(node).not.toBeNull()
  useUiStore().setSelectedNode(node.id)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n] } })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, store, node }
}

function modal() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}

function button(action: string) {
  const element = document.body.querySelector<HTMLButtonElement>(`[data-action="${action}-whisper-environment"]`)
  if (!element) throw new Error(`找不到按钮：${action}`)
  return element
}

async function click(action: string) {
  button(action).click()
  await flushPromises()
}

async function reachVerification() {
  modal()!.querySelector<HTMLInputElement>('[data-deployment="compose"]')!.click()
  await flushPromises()
  await click('next')
  await click('next')
  await click('next')
  modal()!.querySelector<HTMLInputElement>('[data-field="applied"]')!.click()
  await flushPromises()
  await click('next')
}

function verificationResult() {
  return modal()?.querySelector('[data-testid="whisper-verification"]')?.getAttribute('data-result')
}

function availability(store: ReturnType<typeof useWorkflowStore>) {
  return store.templates.find((item) => item.kind === 'whisper')!.availability
}

function expectBlocked(wrapper: VueWrapper, store: ReturnType<typeof useWorkflowStore>, reason: string) {
  expect(availability(store)).toEqual({ available: false, reason })
  expect(wrapper.text()).toContain(i18n.global.t('workflow.capabilityUnavailable'))
  expect(wrapper.text()).toContain(reason)
}

function expectAvailable(wrapper: VueWrapper, store: ReturnType<typeof useWorkflowStore>) {
  expect(availability(store)).toEqual({ available: true, reason: null })
  expect(wrapper.text()).not.toContain(i18n.global.t('workflow.capabilityUnavailable'))
}

beforeEach(() => {
  api.getNodeCatalog.mockReset().mockResolvedValue([])
  api.getWorkflowCapabilities.mockReset()
  api.getWhisperEnvironment.mockReset().mockResolvedValue({ ...environment })
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Whisper 检查器与权威能力刷新集成', () => {
  it('初始未启用仍可配置，外部应用后验证、完成并重开时告警消失且不修改节点', async () => {
    const { wrapper, store, node } = await render()
    const originalConfig = { ...node.data.config }
    const historyLength = store.historyPast.length
    expectBlocked(wrapper, store, disabledReason)
    expect(api.getWhisperEnvironment).not.toHaveBeenCalled()
    api.getWhisperEnvironment.mockResolvedValueOnce({
      ...environment, status: 'unconfigured', enabled: false, loadedModel: null,
    })
    await click('open')
    await reachVerification()
    expect(verificationResult()).toBe('pending')
    expectBlocked(wrapper, store, disabledReason)

    api.getWorkflowCapabilities.mockResolvedValueOnce(capabilities(true))
    await click('verify')

    expect(verificationResult()).toBe('passed')
    expectAvailable(wrapper, store)
    expect(modal()?.querySelector('[data-testid="whisper-capability-error"]')).toBeNull()
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(2)
    expect(api.getWorkflowCapabilities).toHaveBeenCalledTimes(3)
    expect(store.nodes).toHaveLength(1)
    expect(store.nodes[0]?.id).toBe(node.id)
    expect(store.nodes[0]?.data.config).toEqual(originalConfig)
    expect(store.historyPast).toHaveLength(historyLength)

    expect(button('finish').disabled).toBe(false)
    await click('finish')
    expect(modal()).toBeNull()
    expectAvailable(wrapper, store)
    expect(document.activeElement).toBe(button('open'))
    expect(useUiStore().selectedNodeId).toBe(node.id)
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(2)
    expect(api.getWorkflowCapabilities).toHaveBeenCalledTimes(3)

    api.getWorkflowCapabilities.mockResolvedValue(capabilities(true))
    await click('open')
    expectAvailable(wrapper, store)
    expect(modal()?.querySelector('[data-testid="whisper-step-deployment"]')).not.toBeNull()
    expect(verificationResult()).toBeUndefined()
    expect(modal()?.querySelector('[data-action="finish-whisper-environment"]')).toBeNull()
    expect(button('next').disabled).toBe(true)
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(3)
    expect(api.getWorkflowCapabilities).toHaveBeenCalledTimes(4)
    expect(store.nodes[0]?.data.config).toEqual(originalConfig)
    expect(store.historyPast).toHaveLength(historyLength)
  })

  it('环境 usable 且配置验证通过也不能覆盖权威能力返回的阻断', async () => {
    const { wrapper, store } = await render()
    await click('open')
    await reachVerification()
    const reason = '权威能力预检仍禁止执行 Whisper'
    api.getWorkflowCapabilities.mockResolvedValueOnce(capabilities(false, reason))
    await click('verify')

    expect(verificationResult()).toBe('passed')
    expect(modal()?.querySelector('[data-testid="whisper-status"]')?.textContent).toBe('可用')
    expectBlocked(wrapper, store, reason)
    expect(modal()?.querySelector('[data-testid="whisper-capability-error"]')).toBeNull()
  })

  it.each(['open', 'refresh', 'verify'] as const)('%s 读取能力失败立即 fail-closed，提示错误且可重试恢复', async (action) => {
    const { wrapper, store } = await render(true)
    if (action !== 'open') await click('open')
    if (action === 'verify') await reachVerification()
    api.getWorkflowCapabilities.mockRejectedValueOnce(new Error('能力服务超时'))
    await click(action)

    expectBlocked(wrapper, store, 'AI capability service unavailable')
    expect(modal()?.querySelector('[data-testid="whisper-capability-error"]')?.getAttribute('role')).toBe('alert')
    expect(modal()?.querySelector('[data-testid="whisper-status"]')?.textContent).toBe('可用')
    if (action === 'verify') {
      expect(verificationResult()).toBe('passed')
      expect(button('finish').disabled).toBe(true)
      await click('finish')
      expect(modal()).not.toBeNull()
    }
    expect(button('refresh').disabled).toBe(false)
    await click('refresh')
    expectAvailable(wrapper, store)
    expect(modal()?.querySelector('[data-testid="whisper-capability-error"]')).toBeNull()
  })

  it('环境读取失败仍独立刷新权威能力，不会阻止下次重试', async () => {
    const { wrapper, store } = await render()
    api.getWhisperEnvironment.mockRejectedValueOnce(new Error('环境端点不可达'))
    api.getWorkflowCapabilities.mockResolvedValueOnce(capabilities(true))
    await click('open')
    expectAvailable(wrapper, store)
    expect(modal()?.querySelector('[role="alert"]')?.textContent).toContain('环境端点不可达')
    expect(modal()?.querySelector('[data-testid="whisper-status"]')).toBeNull()
    await click('refresh')
    expect(modal()?.querySelector('[role="alert"]')).toBeNull()
    expect(modal()?.querySelector('[data-testid="whisper-status"]')?.textContent).toBe('可用')
  })

  it.each(['close', 'cancel', 'escape', 'unmount'] as const)('%s 后晚返回的环境与能力不会修改当前检查器或 store', async (action) => {
    const { wrapper, store } = await render()
    const pendingEnvironment = deferred<WhisperEnvironment>()
    const pendingCapabilities = deferred<AiWorkflowCapabilities>()
    api.getWhisperEnvironment.mockReturnValueOnce(pendingEnvironment.promise)
    api.getWorkflowCapabilities.mockReturnValueOnce(pendingCapabilities.promise)
    await click('open')
    if (action === 'escape') {
      modal()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flushPromises()
    } else if (action === 'unmount') {
      wrapper.unmount()
      wrappers.splice(wrappers.indexOf(wrapper), 1)
    } else await click(action)
    expect(modal()).toBeNull()

    pendingEnvironment.resolve({ ...environment, message: '迟到的成功结果' })
    pendingCapabilities.resolve(capabilities(true))
    await flushPromises()
    expect(availability(store)).toEqual({ available: false, reason: disabledReason })
    expect(modal()).toBeNull()
    expect(document.body.textContent).not.toContain('迟到的成功结果')
    if (action !== 'unmount') expectBlocked(wrapper, store, disabledReason)
  })

  it.each(['resolve', 'reject'] as const)('关闭重开后旧请求 %s 不覆盖新请求，也不提前解除加载', async (result) => {
    const { wrapper, store } = await render()
    const oldEnvironment = deferred<WhisperEnvironment>()
    const oldCapabilities = deferred<AiWorkflowCapabilities>()
    const currentEnvironment = deferred<WhisperEnvironment>()
    const currentCapabilities = deferred<AiWorkflowCapabilities>()
    api.getWhisperEnvironment.mockReturnValueOnce(oldEnvironment.promise).mockReturnValueOnce(currentEnvironment.promise)
    api.getWorkflowCapabilities.mockReturnValueOnce(oldCapabilities.promise).mockReturnValueOnce(currentCapabilities.promise)
    await click('open')
    await click('close')
    await click('open')
    if (result === 'resolve') {
      oldEnvironment.resolve({ ...environment, message: '旧环境结果' })
      oldCapabilities.resolve(capabilities(true))
    } else {
      oldEnvironment.reject(new Error('旧环境错误'))
      oldCapabilities.reject(new Error('旧能力错误'))
    }
    await flushPromises()
    expectBlocked(wrapper, store, disabledReason)
    expect(button('refresh').disabled).toBe(true)
    expect(modal()?.getAttribute('aria-busy')).toBe('true')
    expect(modal()?.textContent).not.toMatch(/旧环境|旧能力/)
    expect(modal()?.querySelector('[role="alert"]')).toBeNull()

    currentEnvironment.resolve({ ...environment, message: '当前环境结果' })
    currentCapabilities.resolve(capabilities(true))
    await flushPromises()
    expectAvailable(wrapper, store)
    expect(button('refresh').disabled).toBe(false)
    expect(modal()?.textContent).toContain('当前环境结果')
  })

  it('切换 Whisper 节点关闭旧弹窗，旧响应不能更新共享模板，新节点重新读取', async () => {
    const { wrapper, store, node } = await render()
    const other = store.addNodeFromTemplate(store.templates.find((item) => item.kind === 'whisper')!, { x: 300, y: 0 })!
    const oldEnvironment = deferred<WhisperEnvironment>()
    const oldCapabilities = deferred<AiWorkflowCapabilities>()
    api.getWhisperEnvironment.mockReturnValueOnce(oldEnvironment.promise)
    api.getWorkflowCapabilities.mockReturnValueOnce(oldCapabilities.promise)
    await click('open')
    useUiStore().setSelectedNode(other.id)
    await flushPromises()
    expect(modal()).toBeNull()
    expect(wrapper.get('[data-node-inspector]').attributes('data-node-inspector')).toBe(other.id)
    oldEnvironment.resolve({ ...environment, message: '旧节点环境' })
    oldCapabilities.resolve(capabilities(true))
    await flushPromises()
    expectBlocked(wrapper, store, disabledReason)

    api.getWorkflowCapabilities.mockResolvedValueOnce(capabilities(true))
    await click('open')
    expectAvailable(wrapper, store)
    expect(modal()?.textContent).not.toContain('旧节点环境')
    expect(modal()?.querySelector('[data-testid="whisper-step-deployment"]')).not.toBeNull()
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(2)
    expect(store.nodes.map((item) => item.id)).toEqual([node.id, other.id])
  })

  it('能力与环境并行读取；任一仍在等待时重复打开、刷新或验证都不重复请求', async () => {
    const { wrapper, store } = await render()
    const pendingEnvironment = deferred<WhisperEnvironment>()
    const pendingCapabilities = deferred<AiWorkflowCapabilities>()
    api.getWhisperEnvironment.mockReturnValueOnce(pendingEnvironment.promise)
    api.getWorkflowCapabilities.mockReturnValueOnce(pendingCapabilities.promise)
    button('open').click()
    button('open').click()
    await flushPromises()
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
    expect(api.getWorkflowCapabilities).toHaveBeenCalledTimes(2)
    await reachVerification()
    button('refresh').click()
    button('verify').click()
    pendingEnvironment.resolve(environment)
    await flushPromises()
    expect(button('refresh').disabled).toBe(true)
    expect(button('verify').disabled).toBe(true)
    expect(verificationResult()).toBe('pending')
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
    expect(api.getWorkflowCapabilities).toHaveBeenCalledTimes(2)
    pendingCapabilities.resolve(capabilities(true))
    await flushPromises()
    expectAvailable(wrapper, store)
    expect(button('verify').disabled).toBe(false)

    const verification = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(verification.promise)
    api.getWorkflowCapabilities.mockResolvedValueOnce(capabilities(true))
    button('verify').click()
    button('verify').click()
    button('refresh').click()
    await flushPromises()
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(2)
    expect(api.getWorkflowCapabilities).toHaveBeenCalledTimes(3)
    verification.resolve(environment)
    await flushPromises()
    expect(verificationResult()).toBe('passed')
  })

  it.each(['available', 'blocked', 'failed'] as const)('其他入口较新的 %s 能力刷新优先，旧弹窗请求不能倒写全局状态', async (latest) => {
    const { wrapper, store } = await render()
    const oldEnvironment = deferred<WhisperEnvironment>()
    const oldCapabilities = deferred<AiWorkflowCapabilities>()
    api.getWhisperEnvironment.mockReturnValueOnce(oldEnvironment.promise)
    api.getWorkflowCapabilities.mockReturnValueOnce(oldCapabilities.promise)
    await click('open')
    const reason = '新请求返回的权威阻断'
    if (latest === 'failed') api.getWorkflowCapabilities.mockRejectedValueOnce(new Error('新能力请求失败'))
    else api.getWorkflowCapabilities.mockResolvedValueOnce(capabilities(latest === 'available', reason))
    await store.loadNodeTemplates()
    await flushPromises()
    const newestAvailability = { ...availability(store) }

    oldEnvironment.resolve(environment)
    oldCapabilities.resolve(capabilities(latest !== 'available', '过期能力结果'))
    await flushPromises()
    expect(availability(store)).toEqual(newestAvailability)
    if (latest === 'available') expectAvailable(wrapper, store)
    else expectBlocked(wrapper, store, latest === 'failed' ? 'AI capability service unavailable' : reason)
    expect(wrapper.text()).not.toContain('过期能力结果')
    expect(button('refresh').disabled).toBe(false)
  })
})
