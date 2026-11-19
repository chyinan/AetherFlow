// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { previewFailedNodeRerun, rerunFailedNode } = vi.hoisted(() => ({ previewFailedNodeRerun: vi.fn(), rerunFailedNode: vi.fn() }))
vi.mock('@/api/modules/workflow', () => ({ previewFailedNodeRerun, rerunFailedNode }))
import FailedNodeRerunDialog from './FailedNodeRerunDialog.vue'
import { i18n } from '@/i18n'
const preview = {
  sourceInstanceId: 1, nodeId: 'failed', revision: 'revision', eligible: true,
  invalidatedNodes: [{ nodeId: 'failed', label: '失败节点' }, { nodeId: 'downstream', label: '下游节点' }],
  preservedNodes: [{ nodeId: 'paid', label: '已完成 AI 节点' }], blockers: [],
}
const wrappers: ReturnType<typeof mount>[] = []
function dialog() {
  const wrapper = mount(FailedNodeRerunDialog, { props: { instanceId: 1, nodeId: 'failed', nodeLabel: '失败节点' }, global: { plugins: [i18n] }, attachTo: document.body })
  wrappers.push(wrapper); return wrapper
}
function action(name: string) { return document.body.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)! }

describe('失败节点局部重跑', () => {
  beforeEach(() => {
    previewFailedNodeRerun.mockReset().mockResolvedValue(preview)
    rerunFailedNode.mockReset().mockResolvedValue({ id: 2 })
  })
  afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })
  it('提交前展示全部失效和复用节点', async () => {
    const wrapper = dialog(); expect(action('rerun').disabled).toBe(true); await flushPromises()
    expect(document.body.querySelector('[data-test="invalidated"]')?.textContent).toContain('下游节点')
    expect(document.body.querySelector('[data-test="preserved"]')?.textContent).toContain('已完成 AI 节点')
    action('rerun').click(); await flushPromises()
    expect(rerunFailedNode).toHaveBeenCalledWith(1, 'failed', 'revision')
    expect(wrapper.emitted('completed')).toEqual([[2]])
  })
  it('双击只提交一次', async () => {
    let resolve!: (value: { id: number }) => void
    rerunFailedNode.mockImplementation(() => new Promise(done => { resolve = done }))
    const wrapper = dialog(); await flushPromises(); action('rerun').click(); action('rerun').click()
    expect(rerunFailedNode).toHaveBeenCalledTimes(1)
    resolve({ id: 2 }); await flushPromises(); expect(wrapper.emitted('completed')).toHaveLength(1)
  })
  it('关闭期间的响应不会触发跳转', async () => {
    let resolve!: (value: { id: number }) => void
    rerunFailedNode.mockImplementation(() => new Promise(done => { resolve = done }))
    const wrapper = dialog(); await flushPromises(); action('rerun').click(); action('close').click()
    resolve({ id: 2 }); await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1); expect(wrapper.emitted('completed')).toBeUndefined()
  })
  it('快速切换运行时丢弃旧预览', async () => {
    let resolve!: (value: typeof preview) => void
    previewFailedNodeRerun.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = dialog(); await wrapper.setProps({ instanceId: 3, nodeId: 'new' }); await flushPromises()
    resolve({ ...preview, invalidatedNodes: [{ nodeId: 'old', label: '旧预览不可出现' }] }); await flushPromises()
    expect(document.body.textContent).not.toContain('旧预览不可出现')
  })
  it('不满足资格时显示原因且禁止提交', async () => {
    previewFailedNodeRerun.mockResolvedValue({ ...preview, eligible: false, blockers: ['无关分支尚无可复用结果'] })
    dialog(); await flushPromises(); expect(action('rerun').disabled).toBe(true)
    expect(document.body.textContent).toContain('无关分支尚无可复用结果')
    action('rerun').click(); expect(rerunFailedNode).not.toHaveBeenCalled()
  })
  it('失败后使用同一版本重试，不自动重复请求', async () => {
    rerunFailedNode.mockRejectedValueOnce(new Error('暂不可用'))
    const wrapper = dialog(); await flushPromises(); action('rerun').click(); await flushPromises()
    expect(document.body.textContent).toContain('暂不可用'); expect(rerunFailedNode).toHaveBeenCalledTimes(1)
    action('rerun').click(); await flushPromises()
    expect(rerunFailedNode).toHaveBeenLastCalledWith(1, 'failed', 'revision'); expect(wrapper.emitted('completed')).toEqual([[2]])
  })
})

function panel() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}

function keyFromFocus(key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  document.activeElement?.dispatchEvent(event)
  return event
}

function deferredSubmission() {
  let resolve!: (value: { id: number }) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<{ id: number }>((done, fail) => { resolve = done; reject = fail })
  rerunFailedNode.mockReturnValueOnce(promise)
  return { resolve, reject }
}

describe('确认局部重跑期间的键盘交互', () => {
  beforeEach(() => {
    previewFailedNodeRerun.mockReset().mockResolvedValue(preview)
    rerunFailedNode.mockReset().mockResolvedValue({ id: 2 })
  })
  afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

  it('确认按钮等待时将焦点保留在对话框，反向 Tab 可到取消，Escape 关闭后迟到成功不跳转', async () => {
    const pending = deferredSubmission()
    const completed = vi.fn()
    const host = mount(defineComponent({
      setup() {
        const visible = ref(false)
        return () => h('div', [
          h('button', { type: 'button', onClick: () => { visible.value = true } }, '局部重跑'),
          visible.value ? h(FailedNodeRerunDialog, {
            instanceId: 1, nodeId: 'failed', nodeLabel: '失败节点',
            onClose: () => { visible.value = false },
            onCompleted: completed,
          }) : null,
        ])
      },
    }), { global: { plugins: [i18n] }, attachTo: document.body })
    wrappers.push(host)
    const opener = host.get('button').element as HTMLButtonElement
    opener.focus()
    opener.click()
    await flushPromises()

    const confirm = action('rerun')
    confirm.focus()
    confirm.click()
    await flushPromises()
    expect(confirm.disabled).toBe(true)
    expect.soft(document.activeElement).toBe(panel())
    expect.soft(keyFromFocus('Tab', true).defaultPrevented).toBe(true)
    expect.soft(document.activeElement).toBe(action('close'))
    keyFromFocus('Escape')
    await flushPromises()
    expect.soft(panel()).toBeNull()
    expect.soft(document.activeElement).toBe(opener)

    pending.resolve({ id: 2 })
    await flushPromises()
    expect(completed).not.toHaveBeenCalled()
    expect(rerunFailedNode).toHaveBeenCalledExactlyOnceWith(1, 'failed', 'revision')
  })

  it('提交失败保留对话框焦点和预览，只有再次确认才用相同版本重试', async () => {
    const pending = deferredSubmission()
    const wrapper = dialog()
    await flushPromises()
    action('rerun').focus()
    action('rerun').click()
    await flushPromises()

    pending.reject(new Error('暂不可用'))
    await flushPromises()
    expect.soft(document.activeElement).toBe(panel())
    expect(panel()?.querySelector('[role="alert"]')?.textContent).toContain('暂不可用')
    expect(action('rerun').disabled).toBe(false)
    expect(rerunFailedNode).toHaveBeenCalledExactlyOnceWith(1, 'failed', 'revision')
    expect(wrapper.emitted('completed')).toBeUndefined()

    expect.soft(keyFromFocus('Tab', true).defaultPrevented).toBe(true)
    expect.soft(document.activeElement).toBe(action('rerun'))
    action('rerun').click()
    await flushPromises()
    expect(rerunFailedNode.mock.calls).toEqual([[1, 'failed', 'revision'], [1, 'failed', 'revision']])
    expect(wrapper.emitted('completed')).toEqual([[2]])
  })

  it('等待时主动移到取消按钮，提交失败不把焦点抢回', async () => {
    const pending = deferredSubmission()
    dialog()
    await flushPromises()
    action('rerun').focus()
    action('rerun').click()
    await flushPromises()
    const cancel = action('close')
    cancel.focus()

    pending.reject(new Error('暂不可用'))
    await flushPromises()
    expect(document.activeElement).toBe(cancel)
    expect(action('reload')).not.toBeNull()
    expect(rerunFailedNode).toHaveBeenCalledTimes(1)
  })

  it('确认按钮原本未聚焦时，不移动对话框内的现有焦点', async () => {
    const pending = deferredSubmission()
    const wrapper = dialog()
    await flushPromises()
    const cancel = action('close')
    cancel.focus()
    action('rerun').click()
    await flushPromises()
    expect(document.activeElement).toBe(cancel)

    pending.resolve({ id: 2 })
    await flushPromises()
    expect(wrapper.emitted('completed')).toEqual([[2]])
    expect(document.activeElement).toBe(cancel)
  })
})
