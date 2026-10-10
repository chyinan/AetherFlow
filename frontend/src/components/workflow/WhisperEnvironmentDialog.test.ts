// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import type { WhisperEnvironment } from '@/api/modules/nodeConnections'

const api = vi.hoisted(() => ({
  getWhisperEnvironment: vi.fn(),
  createNodeConnection: vi.fn(),
  updateNodeConnection: vi.fn(),
  probeNodeConnection: vi.fn(),
  probeSavedNodeConnection: vi.fn(),
}))
vi.mock('@/api/modules/nodeConnections', () => api)

import WhisperEnvironmentDialog, { buildWhisperEnvironmentSnippet } from './WhisperEnvironmentDialog.vue'

const environment: WhisperEnvironment = {
  status: 'usable', enabled: true, model: 'large-v3', device: 'cuda', computeType: 'float16',
  loadedModel: 'large-v3', dependencyAvailable: true, ffmpegAvailable: true,
  detectedFrom: 'backend', restartRequired: false, message: '运行时已加载 large-v3',
}
const wrappers: VueWrapper[] = []
const writeText = vi.fn()
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function render(locale = 'zh-CN') {
  const wrapper = mount(WhisperEnvironmentDialog, {
    props: { nodeId: 'whisper-one' },
    global: { plugins: [createI18n({ legacy: false, locale, fallbackLocale: 'en-US', messages: {} })] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}
function modal() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}
function button(action: string) {
  const element = document.body.querySelector<HTMLButtonElement>(`[data-action="${action}-whisper-environment"]`)
  if (!element) throw new Error(`找不到按钮：${action}`)
  return element
}
async function open() {
  button('open').click()
  await flushPromises()
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
beforeEach(() => {
  vi.clearAllMocks()
  api.getWhisperEnvironment.mockReset()
  api.getWhisperEnvironment.mockResolvedValue({ ...environment })
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount())
  wrappers.length = 0
  document.body.innerHTML = ''
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.unstubAllGlobals()
})

describe('Whisper 环境只读弹窗', () => {
  it('仅点击入口才读取后端，展示真实模型、单运行时范围和手工配置说明', async () => {
    render()
    expect(api.getWhisperEnvironment).not.toHaveBeenCalled()
    expect(modal()).toBeNull()
    await open()
    expect(api.getWhisperEnvironment).toHaveBeenCalledExactlyOnceWith()
    expect(modal()?.getAttribute('aria-modal')).toBe('true')
    expect(modal()?.textContent).toContain('所有 Whisper 节点共用一个运行时')
    expect(modal()?.textContent).toContain('后端运行机器或容器')
    expect(modal()?.textContent).toContain('不能保存配置、启动服务或热切换模型')
    expect(modal()?.textContent).toContain('large-v3')
    expect(modal()?.textContent).toContain('cuda')
    expect(modal()?.textContent).toContain('float16')
    expect(modal()?.querySelectorAll('input[type=radio]')).toHaveLength(2)
    expect(button('next').disabled).toBe(true)
    expect(modal()?.textContent).toContain('当前检测结果')
    expect(modal()?.querySelector('[data-testid="whisper-env-snippet"]')?.textContent).toBe(
      'ENABLE_WHISPER=true\nWHISPER_MODEL=large-v3\nWHISPER_DEVICE=cuda\nWHISPER_COMPUTE_TYPE=float16',
    )
  })
  it('刷新更新快照和环境片段，复制不保存配置或启动服务', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render()
    await open()
    api.getWhisperEnvironment.mockResolvedValueOnce({
      ...environment, model: 'base.en', loadedModel: null, enabled: false, status: 'unconfigured',
      device: 'cpu', computeType: 'int8', restartRequired: true, message: '尚未启用',
    })
    button('refresh').click()
    await flushPromises()
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(2)
    expect(modal()?.textContent).not.toContain('large-v3')
    expect(modal()?.textContent).toContain('需要重启 Python 后端或容器')
    button('copy').click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      'ENABLE_WHISPER=false\nWHISPER_MODEL=base.en\nWHISPER_DEVICE=cpu\nWHISPER_COMPUTE_TYPE=int8',
    )
    expect(modal()?.textContent).toContain('已复制')
    expect(api.createNodeConnection).not.toHaveBeenCalled()
    expect(api.updateNodeConnection).not.toHaveBeenCalled()
    expect(api.probeNodeConnection).not.toHaveBeenCalled()
    expect(api.probeSavedNodeConnection).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    ['unconfigured', '未配置'], ['unreachable', '后端不可达'], ['unloaded', '运行时未加载'],
    ['missing_model', '缺少模型'], ['usable', '可用'],
  ] as const)('展示 %s 状态', async (status, label) => {
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...environment, status })
    render()
    await open()
    expect(modal()?.querySelector('[data-testid="whisper-status"]')?.textContent).toBe(label)
  })
  it('不可达或配置缺失时不生成默认环境配置，不把未知依赖显示为缺失', async () => {
    api.getWhisperEnvironment.mockResolvedValueOnce({
      ...environment, status: 'unreachable', enabled: false, model: '', device: '', computeType: '',
      loadedModel: null, dependencyAvailable: false, ffmpegAvailable: false,
    })
    render()
    await open()
    expect(modal()?.querySelector('[data-testid="whisper-env-snippet"]')).toBeNull()
    expect(modal()?.querySelector('dl')).toBeNull()
    expect(modal()?.textContent).toContain('尚无完整的后端配置')
    expect(document.body.querySelector('[data-action="copy-whisper-environment"]')).toBeNull()
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...environment, model: '' })
    button('refresh').click()
    await flushPromises()
    expect(modal()?.querySelector('[data-testid="whisper-env-snippet"]')).toBeNull()
  })
  it('读取错误后清除旧快照，允许重试，不用默认配置冒充后端结果', async () => {
    render()
    await open()
    api.getWhisperEnvironment.mockRejectedValueOnce(new Error('后端暂时不可达'))
    button('refresh').click()
    await flushPromises()
    expect(modal()?.querySelector('[role="alert"]')?.textContent).toContain('后端暂时不可达')
    expect(modal()?.querySelector('[data-testid="whisper-env-snippet"]')).toBeNull()
    expect(button('refresh').disabled).toBe(false)
    button('refresh').click()
    await flushPromises()
    expect(modal()?.querySelector('[role="alert"]')).toBeNull()
    expect(modal()?.textContent).toContain('large-v3')
  })
  it('关闭重开后忽略旧请求，旧请求结束不能取消新请求的加载状态', async () => {
    const old = deferred<WhisperEnvironment>()
    const current = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    render()
    await open()
    expect(button('refresh').disabled).toBe(true)
    button('refresh').click()
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
    button('close').click()
    await flushPromises()
    expect(modal()).toBeNull()
    await open()
    old.resolve({ ...environment, model: 'stale-model', message: '迟到的结果' })
    await flushPromises()
    expect(modal()?.textContent).not.toContain('stale-model')
    expect(modal()?.textContent).not.toContain('迟到的结果')
    expect(button('refresh').disabled).toBe(true)
    current.resolve({ ...environment, model: 'fresh-model' })
    await flushPromises()
    expect(modal()?.textContent).toContain('fresh-model')
    expect(button('refresh').disabled).toBe(false)
  })
  it('关闭后迟到的错误不会污染重新打开的弹窗', async () => {
    const old = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(old.promise)
    render()
    await open()
    button('close').click()
    await flushPromises()
    await open()
    old.reject(new Error('旧请求错误'))
    await flushPromises()
    expect(modal()?.querySelector('[role="alert"]')).toBeNull()
    expect(modal()?.textContent).toContain('large-v3')
  })
  it('节点变化立即关闭弹窗并丢弃旧节点请求，下次打开重新读取', async () => {
    const old = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(old.promise)
    const wrapper = render()
    await open()
    await wrapper.setProps({ nodeId: 'whisper-two' })
    expect(modal()).toBeNull()
    await open()
    old.resolve({ ...environment, model: 'old-node-model', message: '旧节点结果' })
    await flushPromises()
    expect(modal()?.textContent).not.toContain('old-node-model')
    expect(modal()?.textContent).not.toContain('旧节点结果')
    expect(modal()?.textContent).toContain('large-v3')
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(2)
  })
  it.each(['resolve', 'reject'] as const)('卸载后请求 %s 不会恢复弹窗或触发副作用', async (result) => {
    const request = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(request.promise)
    const wrapper = render()
    await open()
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    if (result === 'resolve') request.resolve(environment)
    else request.reject(new Error('卸载后的错误'))
    await flushPromises()
    expect(modal()).toBeNull()
    expect(document.body.textContent).not.toContain('卸载后的错误')
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
  })
  it('复制失败给出手工复制提示，关闭后迟到的复制结果不影响下一次打开', async () => {
    render()
    await open()
    writeText.mockRejectedValueOnce(new Error('无剪贴板权限'))
    button('copy').click()
    await flushPromises()
    expect(modal()?.textContent).toContain('请手动选择上方片段复制')
    const copy = deferred<void>()
    writeText.mockReturnValueOnce(copy.promise)
    button('copy').click()
    button('close').click()
    await flushPromises()
    await open()
    copy.resolve()
    await flushPromises()
    expect(modal()?.textContent).not.toContain('已复制')
    expect(modal()?.textContent).not.toContain('请手动选择上方片段复制')
  })
  it('支持 Escape 关闭、恢复入口焦点并约束弹窗内 Tab 焦点', async () => {
    render()
    await open()
    expect(document.activeElement).toBe(modal())
    modal()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(button('close'))
    button('close').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(button('refresh'))
    button('refresh').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(button('close'))
    modal()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(modal()).toBeNull()
    expect(document.activeElement).toBe(button('open'))
  })
  it.each([
    ['en-US', 'Whisper environment setup', 'All Whisper nodes share one runtime'],
    ['ja-JP', 'Whisper 環境設定ウィザード', '単一のランタイムを共有'],
  ])('支持 %s 文案', async (locale, title, scope) => {
    render(locale)
    await open()
    expect(modal()?.querySelector('h2')?.textContent).toBe(title)
    expect(modal()?.textContent).toContain(scope)
  })
})

describe('Whisper 环境变量片段', () => {
  it('保留当前后端值及关闭状态，不写入推测默认值', () => {
    expect(buildWhisperEnvironmentSnippet({ ...environment, enabled: false })).toContain('ENABLE_WHISPER=false')
    expect(buildWhisperEnvironmentSnippet(null)).toBeNull()
    expect(buildWhisperEnvironmentSnippet({ ...environment, status: 'unknown' })).toBeNull()
    expect(buildWhisperEnvironmentSnippet({ ...environment, status: 'unreachable' })).toBeNull()
    expect(buildWhisperEnvironmentSnippet({ ...environment, device: '' })).toBeNull()
    expect(buildWhisperEnvironmentSnippet({ ...environment, computeType: '  ' })).toBeNull()
    expect(buildWhisperEnvironmentSnippet({ ...environment, model: 'model\nINJECTED=true' })).toBeNull()
  })
  it('对包含空格、插值符号或引号的模型路径输出带引号的 .env 值', () => {
    expect(buildWhisperEnvironmentSnippet({ ...environment, model: '/models/large v3 $local' })).toContain("WHISPER_MODEL='/models/large v3 $local'")
    expect(buildWhisperEnvironmentSnippet({ ...environment, model: "my'model" })).toContain("WHISPER_MODEL='my\\'model'")
  })
})

function field(name: string) {
  const element = modal()?.querySelector<HTMLInputElement>(`[data-field="${name}"]`)
  if (!element) throw new Error(`找不到字段：${name}`)
  return element
}
async function edit(name: string, value: string) {
  const input = field(name)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
async function next() {
  button('next').click()
  await flushPromises()
}
async function back() {
  button('back').click()
  await flushPromises()
}
async function chooseDeployment(deployment: 'host' | 'compose' = 'compose') {
  modal()?.querySelector<HTMLInputElement>(`[data-deployment="${deployment}"]`)?.click()
  await flushPromises()
  await next()
}
async function reachSuggestion(deployment: 'host' | 'compose' = 'compose') {
  await chooseDeployment(deployment)
  await next()
}
async function reachVerification() {
  await reachSuggestion()
  await next()
  field('applied').click()
  await flushPromises()
  await next()
}
function verificationResult() {
  return modal()?.querySelector('[data-testid="whisper-verification"]')?.getAttribute('data-result')
}
const suggestedEnvironment: WhisperEnvironment = {
  ...environment, model: 'small', loadedModel: 'small', device: 'cpu', computeType: 'int8',
}

describe('Whisper 部署感知配置向导', () => {
  it('显式选择部署方式后分阶段继续，不提供虚构的 Kubernetes 部署方案', async () => {
    render()
    await open()
    expect(button('next').disabled).toBe(true)
    expect(modal()?.querySelectorAll('input[type=radio]')).toHaveLength(2)
    expect(modal()?.textContent).toContain('仓库没有 Kubernetes 部署清单')
    await chooseDeployment('host')
    expect(modal()?.querySelector('[aria-current=step]')?.textContent).toContain('前置检查')
    expect(modal()?.textContent).toContain('同一个 Python 环境')
    expect(modal()?.textContent).toContain('python-ai-service/requirements.txt')
    expect(modal()?.textContent).toContain('PATH')
    expect(modal()?.textContent).not.toContain('自定义镜像缺依赖')
    await next()
    expect(document.activeElement).toBe(modal()?.querySelector('[data-testid="whisper-step-suggestion"] > h3'))
    expect(field('suggested-model').value).toBe('small')
    expect(field('suggested-device').value).toBe('cpu')
    expect(field('suggested-computeType').value).toBe('int8')
    expect(modal()?.querySelector('dl')?.textContent).toContain('large-v3')
    expect(modal()?.textContent).toContain('不是硬件检测结果，也不是当前配置')
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
  })
  it.each([
    [{ status: 'unreachable', dependencyAvailable: false, ffmpegAvailable: false, enabled: false, loadedModel: null }, ['unreachable']],
    [{ status: 'unconfigured', enabled: false, loadedModel: null }, ['disabled', 'unloaded']],
    [{ status: 'unloaded', dependencyAvailable: false, loadedModel: null }, ['dependency', 'unloaded']],
    [{ status: 'unconfigured', ffmpegAvailable: false }, ['ffmpeg']],
    [{ status: 'missing_model', loadedModel: null }, ['missingModel', 'unloaded']],
    [{ status: 'unloaded', loadedModel: null, restartRequired: true }, ['unloaded', 'restart']],
  ] as const)('前置条件诊断：%j', async (change, expected) => {
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...environment, ...change })
    render()
    await open()
    await chooseDeployment()
    const keys = Array.from(modal()?.querySelectorAll('[data-blocker]') ?? []).map((element) => element.getAttribute('data-blocker'))
    expect(keys).toEqual(expected)
    expect(modal()?.textContent).toContain('实际容器仍以检测为准')
    expect(modal()?.textContent).toContain('默认 Compose 没有为 Whisper 挂载')
    if (change.status === 'unreachable') expect(modal()?.textContent).not.toContain('缺少 FFmpeg')
  })
  it('离线仍可生成明确标注的建议，但不展示伪造当前值，重新验证不能通过', async () => {
    api.getWhisperEnvironment.mockResolvedValue({ ...environment, status: 'unreachable', model: '', device: '', computeType: '', enabled: false, loadedModel: null, dependencyAvailable: false, ffmpegAvailable: false })
    render()
    await open()
    expect(modal()?.querySelector('[data-testid="whisper-env-snippet"]')).toBeNull()
    await reachSuggestion()
    expect(button('use-detected').disabled).toBe(true)
    expect(field('suggested-model').value).toBe('small')
    await next()
    expect(modal()?.querySelector('[data-testid="whisper-suggested-snippet"]')?.textContent).toContain('ENABLE_WHISPER=true')
    expect(modal()?.querySelector('dl')).toBeNull()
    field('applied').click()
    await flushPromises()
    await next()
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('failed')
    expect(modal()?.textContent).toContain('依赖和模型状态均未知')
  })
  it('编辑和复制仅改变建议，Compose 明确要求重建服务而不是仅 restart', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    api.getWhisperEnvironment.mockResolvedValue({ ...environment, enabled: false, status: 'unconfigured', loadedModel: null })
    render()
    await open()
    await reachSuggestion()
    await edit('suggested-model', '/models/prepared medium')
    await edit('suggested-device', 'cuda')
    await edit('suggested-computeType', 'float16')
    expect(modal()?.textContent).toContain('默认 Compose 不配置 GPU 透传')
    await next()
    expect(modal()?.querySelector('dl')?.textContent).toContain('large-v3')
    expect(modal()?.textContent).toContain('仅 docker compose restart 不会重新读取')
    expect(modal()?.textContent).toContain('docker compose up -d --no-deps --force-recreate python-ai-service')
    expect(modal()?.textContent).toContain('保留原有凭据和其他设置')
    expect(button('next').disabled).toBe(true)
    button('copy-suggestion').click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith("ENABLE_WHISPER=true\nWHISPER_MODEL='/models/prepared medium'\nWHISPER_DEVICE=cuda\nWHISPER_COMPUTE_TYPE=float16")
    expect(button('next').disabled).toBe(true)
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
    for (const method of [api.createNodeConnection, api.updateNodeConnection, api.probeNodeConnection, api.probeSavedNodeConnection, fetch]) expect(method).not.toHaveBeenCalled()
  })
  it('宿主机方案输出 PowerShell 变量，并说明服务管理器及 .env 加载限制', async () => {
    render()
    await open()
    await reachSuggestion('host')
    await next()
    expect(modal()?.textContent).toContain('单独创建 .env 文件不保证服务会读取')
    expect(modal()?.textContent).toContain('重启 Python 后端进程')
    expect(modal()?.textContent).not.toContain('docker compose up')
    button('copy-suggestion').click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith("$env:ENABLE_WHISPER='true'\n$env:WHISPER_MODEL='small'\n$env:WHISPER_DEVICE='cpu'\n$env:WHISPER_COMPUTE_TYPE='int8'")
  })
  it('当前值只有显式选择才带入建议，空字段不能进入手工应用', async () => {
    render()
    await open()
    await reachSuggestion()
    expect(field('suggested-model').value).toBe('small')
    button('use-detected').click()
    await flushPromises()
    expect(field('suggested-model').value).toBe('large-v3')
    expect(field('suggested-device').value).toBe('cuda')
    expect(field('suggested-computeType').value).toBe('float16')
    await edit('suggested-model', '  ')
    expect(button('next').disabled).toBe(true)
    expect(field('suggested-model').getAttribute('aria-invalid')).toBe('true')
    expect(modal()?.querySelector('[role=alert]')?.textContent).toContain('不能为空')
    await edit('suggested-model', 'base')
    expect(button('next').disabled).toBe(false)
  })
  it('勾选手工应用或普通刷新不能算验证；仅重新读取且匹配时通过', async () => {
    api.getWhisperEnvironment.mockResolvedValue(suggestedEnvironment)
    render()
    await open()
    await reachVerification()
    expect(verificationResult()).toBe('pending')
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(1)
    button('refresh').click()
    await flushPromises()
    expect(verificationResult()).toBe('pending')
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('passed')
    expect(modal()?.textContent).toContain('本次读取的后端配置与建议一致')
    expect(modal()?.textContent).toContain('页面没有保存配置或启用模型')
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(3)
  })
  it('旧运行时可用但建议模型或设备未生效时失败，重启状态同样不通过', async () => {
    render()
    await open()
    await reachVerification()
    button('verify').click()
    await flushPromises()
    expect(modal()?.querySelector('[data-testid="whisper-status"]')?.textContent).toBe('可用')
    expect(verificationResult()).toBe('failed')
    expect(modal()?.querySelector('[data-testid="whisper-verification-target"]')?.textContent).toContain('small')
    expect(modal()?.querySelector('[data-testid="whisper-verification-target"]')?.textContent).toContain('cpu')
    expect(modal()?.textContent).toContain('当前配置模型 / 设备 / 计算精度 / 已加载模型')
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...suggestedEnvironment, restartRequired: true })
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('failed')
    expect(modal()?.textContent).toContain('启动配置尚未生效')
  })
  it.each([
    { dependencyAvailable: false }, { ffmpegAvailable: false }, { loadedModel: null }, { status: 'unloaded' }, { enabled: false },
  ])('即使返回 usable 或建议匹配，缺少前置条件 %j 也不通过', async (change) => {
    render()
    await open()
    await reachVerification()
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...suggestedEnvironment, ...change })
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('failed')
  })
  it('新验证进行中或失败时立即清除旧成功结果，并允许重试', async () => {
    api.getWhisperEnvironment.mockResolvedValue(suggestedEnvironment)
    render()
    await open()
    await reachVerification()
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('passed')
    const request = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(request.promise)
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('pending')
    expect(button('verify').disabled).toBe(true)
    button('verify').click()
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(3)
    request.reject(new Error('验证连接失败'))
    await flushPromises()
    expect(modal()?.querySelector('[role=alert]')?.textContent).toContain('验证连接失败')
    expect(verificationResult()).toBe('pending')
    expect(button('verify').disabled).toBe(false)
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('passed')
  })
  it('验证中返回编辑建议会废弃验证结果与应用确认，迟到请求仅能更新实际快照', async () => {
    render()
    await open()
    await reachVerification()
    const request = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(request.promise)
    button('verify').click()
    await flushPromises()
    await back()
    await back()
    await edit('suggested-model', 'new-model')
    await next()
    expect(field('applied').checked).toBe(false)
    expect(button('next').disabled).toBe(true)
    request.resolve(suggestedEnvironment)
    await flushPromises()
    expect(modal()?.querySelector('dl')?.textContent).toContain('small')
    field('applied').click()
    await flushPromises()
    await next()
    expect(verificationResult()).toBe('pending')
  })
  it.each(['cancel', 'close', 'node'] as const)('验证过程中 %s 会关闭并重置，迟到响应不能污染重新打开', async (action) => {
    const wrapper = render()
    await open()
    await reachVerification()
    const request = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(request.promise)
    button('verify').click()
    await flushPromises()
    if (action === 'node') await wrapper.setProps({ nodeId: 'new-node' })
    else { button(action).click(); await flushPromises() }
    expect(modal()).toBeNull()
    await open()
    request.resolve({ ...suggestedEnvironment, model: 'stale-success', message: '旧验证成功' })
    await flushPromises()
    expect(modal()?.textContent).not.toContain('旧验证成功')
    expect(modal()?.querySelector('[data-testid="whisper-step-deployment"]')).not.toBeNull()
    expect(button('next').disabled).toBe(true)
    expect(verificationResult()).toBeUndefined()
  })
  it('建议复制失败会提示手工复制，返回修改后迟到的复制结果不会冒充新建议已复制', async () => {
    render()
    await open()
    await reachSuggestion()
    await next()
    writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    button('copy-suggestion').click()
    await flushPromises()
    expect(modal()?.textContent).toContain('请手动选择上方片段复制')
    const copy = deferred<void>()
    writeText.mockReturnValueOnce(copy.promise)
    button('copy-suggestion').click()
    await back()
    await edit('suggested-model', 'base')
    await next()
    copy.resolve()
    await flushPromises()
    expect(modal()?.textContent).not.toContain('已复制')
    expect(modal()?.textContent).not.toContain('请手动选择上方片段复制')
  })
  it.each(['en-US', 'ja-JP'])('完整 %s 向导没有缺失翻译键', async (locale) => {
    render(locale)
    await open()
    await reachVerification()
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...suggestedEnvironment, ffmpegAvailable: false })
    button('verify').click()
    await flushPromises()
    expect(verificationResult()).toBe('failed')
    expect(modal()?.textContent).not.toMatch(/verifyHint|verifyFailure|verifyScope|blockers\.ffmpeg|steps\./)
  })
})
