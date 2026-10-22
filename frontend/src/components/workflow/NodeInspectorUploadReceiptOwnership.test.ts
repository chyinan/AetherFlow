// @vitest-environment jsdom
// 上传回执必须归属发起它的节点：
// 迟到结果不得写到当前选中的其他节点，也不得覆盖同一节点上更新的选择。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNodeCatalog } from '@/api/modules/node'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useFileStore } from '@/stores/fileStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const wrappers: VueWrapper[] = []

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}

async function render() {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow()
  const start = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'start')!, { x: 0, y: 0 })!
  const upload = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'upload')!, { x: 240, y: 0 })!
  useUiStore().setSelectedNode(start.id)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper); await flushPromises()
  return { wrapper, store, start, upload }
}

async function startUpload(wrapper: VueWrapper, name = 'a.mp4') {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name, size: 12, type: 'video/mp4' }] })
  await input.trigger('change')
  await flushPromises()
}

/** 模拟用户在下拉框里改选或清空已有文件。 */
async function selectExistingFile(wrapper: VueWrapper, backendFileId: string) {
  const fileStore = useFileStore()
  fileStore.files = [
    { id: 'file-99', backendFileId: 99, name: 'c.mp4', status: 'ready', source: 'input', size: 1, mime: 'video/mp4' },
    { id: 'file-5', backendFileId: 5, name: 'a.mp4', status: 'ready', source: 'input', size: 1, mime: 'video/mp4' },
  ] as never
  await flushPromises()
  await wrapper.get('[data-config-field="fileId"]').setValue(backendFileId)
  await flushPromises()
}

describe('上传回执的节点归属', () => {
  beforeEach(() => {
    vi.mocked(getNodeCatalog).mockResolvedValue([])
  })
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('上传过程中切换节点，迟到回执只写回发起的节点', async () => {
    const { wrapper, store, start, upload } = await render()
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    // 上传等待期间切换到 UPLOAD 节点。
    useUiStore().setSelectedNode(upload.id)
    await flushPromises()

    pending.resolve({ backendFileId: 7, name: 'a.mp4' })
    await flushPromises()

    // 回执不得污染当前选中的 UPLOAD 节点。
    expect(store.nodes.find((node) => node.id === upload.id)?.data.config.fileId).toBeUndefined()
    // 回执归属发起上传的节点。
    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBe(7)
  })

  it('同一节点上更晚的选择优先于迟到的上传回执', async () => {
    const { wrapper, store, start } = await render()
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    // 用户改选已有文件 B。
    store.updateNodeConfig(start.id, 'fileId', 99)
    await flushPromises()

    pending.resolve({ backendFileId: 7, name: 'a.mp4' })
    await flushPromises()

    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBe(99)
  })

  it('上传失败时保留原选择且不写入任何文件', async () => {
    const { wrapper, store, start } = await render()
    vi.spyOn(useFileStore(), 'upload').mockRejectedValue(new Error('上传失败'))

    await startUpload(wrapper)
    await flushPromises()

    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBeUndefined()
  })
})

describe('上传替换已有文件', () => {
  beforeEach(() => {
    vi.mocked(getNodeCatalog).mockResolvedValue([])
  })
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('已绑定 A 时正常上传 B 替换为 B', async () => {
    const { wrapper, store, start } = await render()
    store.updateNodeConfig(start.id, 'fileId', 5)
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    pending.resolve({ backendFileId: 7, name: 'b.mp4' })
    await flushPromises()

    // 正常上传必须替换旧文件，运行才能用新文件。
    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBe(7)
  })

  it('没有旧文件时上传正常写入', async () => {
    const { wrapper, store, start } = await render()
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    pending.resolve({ backendFileId: 7, name: 'b.mp4' })
    await flushPromises()

    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBe(7)
  })

  it('上传期间用户改选已有文件时保护用户新操作', async () => {
    const { wrapper, store, start } = await render()
    store.updateNodeConfig(start.id, 'fileId', 5)
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    await selectExistingFile(wrapper, '99')
    pending.resolve({ backendFileId: 7, name: 'b.mp4' })
    await flushPromises()

    expect(String(store.nodes.find((node) => node.id === start.id)?.data.config.fileId)).toBe('99')
  })

  it('上传期间用户清空文件时保护用户新操作', async () => {
    const { wrapper, store, start } = await render()
    store.updateNodeConfig(start.id, 'fileId', 5)
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    await selectExistingFile(wrapper, '')
    pending.resolve({ backendFileId: 7, name: 'b.mp4' })
    await flushPromises()

    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBe('')
  })

  it('上传期间改选又改回原值时仍保护用户操作', async () => {
    const { wrapper, store, start } = await render()
    store.updateNodeConfig(start.id, 'fileId', 5)
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    // 用户先改选 C，又改回 A。
    await selectExistingFile(wrapper, '99')
    await selectExistingFile(wrapper, '5')
    pending.resolve({ backendFileId: 7, name: 'b.mp4' })
    await flushPromises()

    expect(String(store.nodes.find((node) => node.id === start.id)?.data.config.fileId)).toBe('5')
  })

  it('重叠上传时只有最后一次生效', async () => {
    const { wrapper, store, start } = await render()
    const first = deferred<{ backendFileId: number; name: string }>()
    const second = deferred<{ backendFileId: number; name: string }>()
    const upload = vi.spyOn(useFileStore(), 'upload')
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never)

    await startUpload(wrapper, 'first.mp4')
    await startUpload(wrapper, 'second.mp4')

    first.resolve({ backendFileId: 7, name: 'first.mp4' })
    await flushPromises()
    second.resolve({ backendFileId: 8, name: 'second.mp4' })
    await flushPromises()

    expect(upload).toHaveBeenCalledTimes(2)
    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBe(8)
  })

  it('切换工作流后迟到回执不写入任何节点', async () => {
    const { wrapper, store, start } = await render()
    const pending = deferred<{ backendFileId: number; name: string }>()
    vi.spyOn(useFileStore(), 'upload').mockReturnValue(pending.promise as never)

    await startUpload(wrapper)
    store.workflowId = 'other-workflow'
    pending.resolve({ backendFileId: 7, name: 'b.mp4' })
    await flushPromises()

    expect(store.nodes.find((node) => node.id === start.id)?.data.config.fileId).toBeUndefined()
  })
})
