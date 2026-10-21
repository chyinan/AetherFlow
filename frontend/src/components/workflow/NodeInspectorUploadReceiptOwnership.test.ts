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
