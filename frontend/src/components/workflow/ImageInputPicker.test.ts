// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { WorkflowGraphNode } from '@/types/workflow'
const mocks = vi.hoisted(() => ({ readImageFile: vi.fn() }))
vi.mock('./imageInputSupport', async (load) => ({ ...await load<object>(), readImageFile: mocks.readImageFile }))
import ImageInputPicker from './ImageInputPicker.vue'
import { ImageInputError } from './imageInputSupport'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5AAAAABJRU5ErkJggg=='
const image = { base64: png, contentType: 'image/png', preview: `data:image/png;base64,${png}` }
const wrappers: VueWrapper[] = []
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { resolve, reject, promise } }
function render(config: Record<string, unknown> = {}) {
  const nodes: WorkflowGraphNode[] = [{ id: 'parent', type: 'workflow', position: { x: 0, y: 0 }, data: { ...nodeTemplates.find((node) => node.kind === 'image-generation')!, status: 'idle' } }]
  const wrapper = mount(ImageInputPicker, { props: { nodeId: 'current', config, nodes, edges: [{ id: 'edge', source: 'parent', target: 'current' }] }, global: { plugins: [i18n] } })
  wrappers.push(wrapper); return wrapper
}
async function choose(wrapper: VueWrapper, files = [new File(['image'], 'image.png', { type: 'image/png' })]) {
  const input = wrapper.get('[data-testid="image-file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: files })
  await input.trigger('change')
}
describe('图片选择器', () => {
  beforeEach(() => { mocks.readImageFile.mockReset(); mocks.readImageFile.mockResolvedValue(image) })
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
  it('选图只原子写入 sourceImage，保留旧变量，并重置原生输入方便再次选同图', async () => {
    const wrapper = render({ sourceImageVariable: 'legacyBase64' })
    await choose(wrapper); await flushPromises()
    expect(wrapper.emitted('apply')).toEqual([[{ sourceImage: png }, 'current']])
    expect((wrapper.get('[data-testid="image-file"]').element as HTMLInputElement).value).toBe('')
    await wrapper.setProps({ config: { sourceImage: png, sourceImageVariable: 'legacyBase64' } })
    expect(wrapper.get('[data-testid="image-preview"]').attributes('src')).toBe(image.preview)
    expect(wrapper.text()).toContain('legacyBase64')
    await wrapper.get('[data-testid="clear-image"]').trigger('click')
    expect(wrapper.emitted('apply')?.at(-1)).toEqual([{ sourceImage: '' }, 'current'])
  })
  it('选择真实上游变量时一次清除固定图片并绑定文件 ID 输出', async () => {
    const wrapper = render({ sourceImage: png, sourceImageVariable: 'legacy' })
    await wrapper.get('[data-testid="image-upstream"]').setValue('imageFileIds')
    expect(wrapper.emitted('apply')).toEqual([[{ sourceImage: '', sourceImageVariable: 'imageFileIds' }, 'current']])
  })
  it.each(['unsupported', 'tooLarge', 'empty', 'readFailed', 'invalidImage'] as const)('选图错误 %s 不覆盖已存储配置', async (code) => {
    mocks.readImageFile.mockRejectedValue(new ImageInputError(code))
    const wrapper = render({ sourceImage: png })
    await choose(wrapper); await flushPromises()
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.get('[data-testid="image-error"]').text()).not.toBe('')
    expect(wrapper.get('[data-testid="image-preview"]').attributes('src')).toBe(image.preview)
  })
  it('取消文件对话框和取消读取不写配置，迟到结果被丢弃', async () => {
    const pending = deferred<typeof image>(); mocks.readImageFile.mockReturnValueOnce(pending.promise)
    const wrapper = render({ sourceImageVariable: 'old' }); await choose(wrapper, [])
    expect(mocks.readImageFile).not.toHaveBeenCalled()
    await choose(wrapper)
    const signal = mocks.readImageFile.mock.calls[0]?.[1] as AbortSignal
    await wrapper.get('[data-testid="cancel-image-read"]').trigger('click')
    expect(signal.aborted).toBe(true)
    pending.resolve(image); await flushPromises()
    expect(wrapper.emitted('apply')).toBeUndefined()
  })
  it('连续选图只接受最新结果，即使旧读取最后完成', async () => {
    const first = deferred<typeof image>(); const second = deferred<typeof image>()
    mocks.readImageFile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const wrapper = render(); await choose(wrapper); await choose(wrapper)
    second.resolve({ ...image, base64: 'new-image' }); await flushPromises()
    first.resolve(image); await flushPromises()
    expect(wrapper.emitted('apply')).toEqual([[{ sourceImage: 'new-image' }, 'current']])
  })
  it('节点快速切换、卸载、外部撤销时不能回写旧结果', async () => {
    const pending = deferred<typeof image>(); mocks.readImageFile.mockReturnValueOnce(pending.promise)
    const wrapper = render(); await choose(wrapper)
    await wrapper.setProps({ nodeId: 'new-node', config: { sourceImageVariable: 'next' } })
    pending.resolve(image); await flushPromises(); expect(wrapper.emitted('apply')).toBeUndefined()
    const undo = deferred<typeof image>(); mocks.readImageFile.mockReturnValueOnce(undo.promise)
    await choose(wrapper); await wrapper.setProps({ config: { sourceImage: png } })
    undo.resolve(image); await flushPromises(); expect(wrapper.emitted('apply')).toBeUndefined()
    const unmounted = deferred<typeof image>(); mocks.readImageFile.mockReturnValueOnce(unmounted.promise)
    await choose(wrapper); wrapper.unmount(); unmounted.resolve(image); await flushPromises()
    expect(wrapper.emitted('apply')).toBeUndefined()
  })
  it('旧变量和值不在挂载时重写，远程 URL 不预览且高级编辑保留兼容', async () => {
    const wrapper = render({ sourceImage: 'https://example.test/private.png', sourceImageVariable: 'my.image' })
    expect(wrapper.find('img').exists()).toBe(false); expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.text()).toContain('my.image')
    await wrapper.get('[data-testid="image-base64"]').setValue('legacy base64')
    await wrapper.get('[data-testid="image-variable"]').setValue('customVariable')
    await wrapper.get('[data-testid="apply-image-advanced"]').trigger('click')
    expect(wrapper.emitted('apply')).toEqual([[{ sourceImage: 'legacy base64', sourceImageVariable: 'customVariable' }, 'current']])
  })
  it('切换上游或清除时取消正在读取的本地文件', async () => {
    const pending = deferred<typeof image>(); mocks.readImageFile.mockReturnValueOnce(pending.promise)
    const wrapper = render({ sourceImage: png }); await choose(wrapper)
    await wrapper.get('[data-testid="image-upstream"]').setValue('imageFileIds')
    pending.resolve(image); await flushPromises()
    expect(wrapper.emitted('apply')).toEqual([[{ sourceImage: '', sourceImageVariable: 'imageFileIds' }, 'current']])
  })
  it('高级设置显式应用时将安全 Data URL 转成执行器使用的纯 Base64', async () => {
    const wrapper = render()
    await wrapper.get('[data-testid="image-base64"]').setValue(image.preview)
    await wrapper.get('[data-testid="apply-image-advanced"]').trigger('click')
    expect(wrapper.emitted('apply')).toEqual([[{ sourceImage: png, sourceImageVariable: 'sourceImage' }, 'current']])
  })

})
