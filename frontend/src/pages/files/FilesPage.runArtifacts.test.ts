// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { FileAsset } from '@/types/file'

const mocks = vi.hoisted(() => ({ listFiles: vi.fn(), downloadFile: vi.fn() }))
// 所有文件元数据和下载都使用替身，不访问真实文件或触发浏览器下载。
vi.mock('@/services/api/fileApi', () => ({ fileApi: mocks }))
import { i18n } from '@/i18n'
import { useFileStore } from '@/stores/fileStore'
import FilesPage from './FilesPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
function assets(): FileAsset[] {
  const base: FileAsset = {
    id: 'file-1', backendFileId: '101', name: 'meeting-summary.md', type: 'artifact', source: 'artifact',
    artifactKind: 'summary', status: 'ready', linkedRunId: 'run-1', workflowId: '101', workflowName: '会议总结',
    size: '1 KB', mime: 'text/markdown', updatedAt: '2026-10-15',
  }
  return [base, { ...base, id: 'file-2', backendFileId: '102', linkedRunId: 'run-2' },
    { ...base, id: 'unlinked', backendFileId: '103', linkedRunId: undefined },
    { ...base, id: 'input', backendFileId: '104', name: '会议录音.wav', type: 'audio', source: 'input' }]
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function shownRunLinks() {
  return wrapper!.findAll('[data-testid="artifact-section"] a').map(link => link.attributes('href'))
}
function downloadButtons() {
  return wrapper!.findAll('button').filter(button => button.attributes('aria-label') === i18n.global.t('files.download'))
}
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh-CN'
  mocks.listFiles.mockImplementation(async () => assets())
  mocks.downloadFile.mockRejectedValue(new Error('模拟下载失败'))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  i18n.global.locale.value = 'zh-CN'
  vi.restoreAllMocks()
})
async function setup(path = '/files?runId=run-1', initialFiles: FileAsset[] = []) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useFileStore()
  store.files = initialFiles
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/files', component: FilesPage },
    { path: '/runs/:id', component: { template: '<div />' } },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: { FileUploader: true } } })
  await flushPromises()
  return { router, store }
}

it('深链接只显示本次运行的同名成品，不混入其他运行、未关联成品或输入文件', async () => {
  const { store } = await setup()
  expect(shownRunLinks()).toEqual(['/runs/run-1'])
  expect(downloadButtons()).toHaveLength(1)
  expect(wrapper!.findAll('[title="meeting-summary.md"]')).toHaveLength(1)
  expect(wrapper!.text()).not.toContain('会议录音.wav')
  expect(wrapper!.find('file-uploader-stub').exists()).toBe(false)
  expect(wrapper!.get('[data-testid="run-artifact-filter"]').text()).toContain('本次成品 · 运行 run-1')
  expect(store.files).toHaveLength(4)
  expect(mocks.downloadFile).not.toHaveBeenCalled()
})

it('路由切换与前进后退立即更新筛选，清除只移除 runId 并保留无关查询和 hash', async () => {
  const { router } = await setup('/files?runId=run-1&tag=a&tag=b&sort=recent#results')
  await router.push({ query: { ...router.currentRoute.value.query, runId: 'run-2' }, hash: '#results' })
  await flushPromises()
  expect(shownRunLinks()).toEqual(['/runs/run-2'])
  await wrapper!.get('[data-testid="clear-run-filter"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ tag: ['a', 'b'], sort: 'recent' })
  expect(router.currentRoute.value.hash).toBe('#results')
  expect(shownRunLinks()).toEqual(['/runs/run-1', '/runs/run-2'])
  expect(wrapper!.findAll('[title="meeting-summary.md"]')).toHaveLength(3)
  expect(downloadButtons()).toHaveLength(4)
  expect(wrapper!.find('file-uploader-stub').exists()).toBe(true)
  router.back(); await flushPromises()
  expect(shownRunLinks()).toEqual(['/runs/run-2'])
  router.back(); await flushPromises()
  expect(shownRunLinks()).toEqual(['/runs/run-1'])
  router.forward(); await flushPromises()
  expect(shownRunLinks()).toEqual(['/runs/run-2'])
  router.forward(); await flushPromises()
  expect(wrapper!.find('[data-testid="run-artifact-filter"]').exists()).toBe(false)
  expect(mocks.listFiles).toHaveBeenCalledTimes(1)
})

it('不存在或尚无成品的运行显示明确空态，不能回退到全局结果', async () => {
  await setup('/files?runId=run-404')
  expect(wrapper!.get('[data-testid="run-artifact-empty"]').text()).toContain('尚未找到运行 run-404 的成品文件')
  expect(downloadButtons()).toHaveLength(0)
  expect(wrapper!.findAll('[title="meeting-summary.md"]')).toHaveLength(0)
  expect(wrapper!.find('[data-testid="clear-run-filter"]').exists()).toBe(true)
})

it('加载期间不提前显示空态或缓存成品；响应到达时按最新 runId 筛选', async () => {
  const pending = deferred<FileAsset[]>()
  mocks.listFiles.mockReturnValue(pending.promise)
  const { router } = await setup('/files?runId=run-1', assets())
  expect(wrapper!.get('[data-testid="run-artifact-loading"]').attributes('aria-busy')).toBe('true')
  expect(downloadButtons()).toHaveLength(0)
  expect(wrapper!.find('[data-testid="run-artifact-empty"]').exists()).toBe(false)
  await router.push('/files?runId=run-2'); await flushPromises()
  pending.resolve(assets()); await flushPromises()
  expect(shownRunLinks()).toEqual(['/runs/run-2'])
  expect(wrapper!.find('[data-testid="run-artifact-loading"]').exists()).toBe(false)
})

it('加载失败保留错误与重试入口，隐藏缓存及误导空态，重试恢复原筛选', async () => {
  mocks.listFiles.mockRejectedValueOnce(new Error('模拟列表加载失败'))
  const { router } = await setup('/files?runId=run-2&keep=yes', assets())
  expect(wrapper!.get('[role="alert"]').text()).toContain('模拟列表加载失败')
  expect(wrapper!.text()).toContain('当前未显示缓存结果')
  expect(wrapper!.find('[data-testid="run-artifact-empty"]').exists()).toBe(false)
  expect(downloadButtons()).toHaveLength(0)
  await wrapper!.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ runId: 'run-2', keep: 'yes' })
  expect(shownRunLinks()).toEqual(['/runs/run-2'])
  expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
})

it('下载仍提交选中成品的文件 ID，等待禁用按钮，失败保留原有反馈和筛选', async () => {
  const { router, store } = await setup('/files?runId=run-2')
  const pending = deferred<Blob>()
  mocks.downloadFile.mockReturnValue(pending.promise)
  const downloadSpy = vi.spyOn(store, 'download')
  await downloadButtons()[0]!.trigger('click'); await flushPromises()
  expect(downloadSpy).toHaveBeenCalledExactlyOnceWith('file-2')
  expect(mocks.downloadFile).toHaveBeenCalledExactlyOnceWith('102')
  expect(downloadButtons()[0]!.attributes('disabled')).toBeDefined()
  pending.reject(new Error('模拟下载失败')); await flushPromises()
  expect(wrapper!.text()).toContain('模拟下载失败')
  expect(downloadButtons()[0]!.attributes('disabled')).toBeUndefined()
  expect(router.currentRoute.value.query.runId).toBe('run-2')
  expect(shownRunLinks()).toEqual(['/runs/run-2'])
})

it('下载成功路径仍调用现有 store 动作，测试替身不发起真实下载', async () => {
  const { store } = await setup()
  const downloadSpy = vi.spyOn(store, 'download').mockResolvedValue(undefined)
  await downloadButtons()[0]!.trigger('click'); await flushPromises()
  expect(downloadSpy).toHaveBeenCalledExactlyOnceWith('file-1')
  expect(mocks.downloadFile).not.toHaveBeenCalled()
})

it('重复查询参数取首个值，空白参数保持普通文件页语义', async () => {
  const { router } = await setup('/files?runId=run-2&runId=run-1')
  expect(shownRunLinks()).toEqual(['/runs/run-2'])
  await router.push('/files?runId='); await flushPromises()
  expect(wrapper!.find('[data-testid="run-artifact-filter"]').exists()).toBe(false)
  expect(downloadButtons()).toHaveLength(4)
})

it('直接打开成品深链时无需运行缓存，也提供可用的来源运行返回入口', async () => {
  const { router } = await setup('/files?runId=run-2')
  const link = wrapper!.get('[data-testid="return-source-run"]')
  expect(link.attributes('href')).toBe('/runs/run-2')
  await link.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/runs/run-2')
})

it('来源返回保存历史筛选和分页，清除运行筛选同时移除其返回上下文', async () => {
  const source = '/runs/run-2?q=meeting&workflowId=workflow-10&status=FAILED&page=4&pageSize=50&tag=a&tag=b#detail'
  const { router } = await setup(`/files?runId=run-2&runReturnLocation=${encodeURIComponent(source)}&keep=yes#files`)
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe(source)
  await wrapper!.get('[data-testid="clear-run-filter"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ keep: 'yes' })
  expect(router.currentRoute.value.hash).toBe('#files')
  expect(wrapper!.find('[data-testid="return-source-run"]').exists()).toBe(false)
  router.back(); await flushPromises()
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe(source)
  await wrapper!.get('[data-testid="return-source-run"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(source)
})

it('重复查询及路由变化只依据当前筛选生成返回入口，绝不沿用旧运行来源', async () => {
  const { router } = await setup('/files?runId=run-2&runId=run-1&runReturnLocation=%2Fruns%2Frun-2%3Fpage%3D3&runReturnLocation=%2Fruns%2Frun-1')
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe('/runs/run-2?page=3')
  await router.push({ query: { ...router.currentRoute.value.query, runId: 'run-1' } }); await flushPromises()
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe('/runs/run-1')
  router.back(); await flushPromises()
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe('/runs/run-2?page=3')
  router.forward(); await flushPromises()
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe('/runs/run-1')
})

it.each(['https://outside.example/runs/run-2', '//outside.example', '/runs/run-99?page=4', '/workflows/workflow-1'])('无效或不同来源的返回位置安全回退：%s', async source => {
  await setup(`/files?runId=run-2&runReturnLocation=${encodeURIComponent(source)}`)
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe('/runs/run-2')
})

it.each([
  ['zh-CN', '本次成品 · 运行 run-404', '清除运行筛选', '尚未找到运行 run-404', '返回来源运行'],
  ['en-US', 'Artifacts · Run run-404', 'Clear run filter', 'No artifact files found for run run-404', 'Return to source run'],
  ['ja-JP', '成果物 · 実行 run-404', '実行の絞り込みを解除', '実行 run-404 の成果物ファイルはまだありません', '元の実行に戻る'],
] as const)('筛选、清除和空态支持 %s，并响应运行时语言切换', async (locale, filter, clear, empty, returnText) => {
  await setup('/files?runId=run-404')
  i18n.global.locale.value = locale
  await flushPromises()
  expect(wrapper!.get('[data-testid="run-artifact-filter"]').text()).toContain(filter)
  expect(wrapper!.get('[data-testid="clear-run-filter"]').text()).toBe(clear)
  expect(wrapper!.get('[data-testid="run-artifact-empty"]').text()).toContain(empty)
  expect(wrapper!.get('[data-testid="return-source-run"]').text()).toBe(returnText)
})
