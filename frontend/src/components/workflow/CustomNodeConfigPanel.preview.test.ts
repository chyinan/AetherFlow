// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { customNodeTemplate, defaultCustomDefinition } from '@/utils/customNodes'
import CustomNodeConfigPanel from './CustomNodeConfigPanel.vue'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn(async () => []) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const selector = '[data-testid="custom-node-config"]'
const previewSelector = '[data-testid="custom-preview"]'
const wrappers: { unmount(): void }[] = []
function definition(version = '1.0.0') {
  const base = defaultCustomDefinition('API')
  return {
    ...base,
    version,
    fields: [{ name: 'suffix', type: 'STRING' as const, defaultValue: '原配置' }],
    request: { ...base.request!, body: { text: '{{inputs.text}}', suffix: '{{config.suffix}}' } },
  }
}
function config() { return customNodeTemplate(definition()).config }
function render(initial = config()) {
  const wrapper = mount(CustomNodeConfigPanel, { props: { config: initial } })
  wrappers.push(wrapper)
  return wrapper
}
function panel(wrapper: Pick<ReturnType<typeof mount>, 'get'>) {
  const scope = wrapper.get(selector)
  return {
    input: () => scope.findAll<HTMLTextAreaElement>('details textarea')[0]!,
    response: () => scope.findAll<HTMLTextAreaElement>('details textarea')[1]!,
    generate: () => scope.findAll('details button')[0]!.trigger('click'),
    clear: () => scope.findAll('details button')[1]!.trigger('click'),
    result: () => JSON.parse(scope.get(previewSelector).text()),
    hasResult: () => scope.find(previewSelector).exists(),
    alert: () => scope.find('details [role="alert"]'),
  }
}
beforeEach(() => { vi.spyOn(globalThis, 'fetch') })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks() })

describe('自定义节点本地预览的输入归属', () => {
  it('更换模拟响应后不再显示旧的成功输出，手动重算才展示新值', async () => {
    const wrapper = render()
    const { response, generate, result, hasResult } = panel(wrapper)
    await generate()
    expect(result().outputs).toEqual({ result: '示例输出' })
    await response().setValue('{"result":"第二次"}')
    expect(hasResult()).toBe(false)
    expect(response().element.value).toBe('{"result":"第二次"}')
    expect(wrapper.emitted('update')).toBeUndefined()
    await generate()
    expect(result().outputs).toEqual({ result: '第二次' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('修正模拟响应后不再显示上次预览失败，未生成前也不报告成功', async () => {
    const { response, generate, result, hasResult, alert } = panel(render())
    await response().setValue('{"missing":1}')
    await generate()
    expect(alert().text()).toContain('字段必填')
    await response().setValue('{"result":"已修正"}')
    expect(alert().exists()).toBe(false)
    expect(hasResult()).toBe(false)
    await generate()
    expect(result().outputs).toEqual({ result: '已修正' })
  })

  it('同一绑定更换模拟工作流变量后立即作废旧请求体，重算后替换成新值', async () => {
    const wrapper = render({ ...config(), inputBindings: { text: 'sample' } })
    const { input, generate, result, hasResult } = panel(wrapper)
    await input().setValue('{"sample":"旧变量"}')
    await generate()
    expect(result().request.body).toEqual({ text: '旧变量', suffix: '原配置' })
    await input().setValue('{"sample":"新变量"}')
    expect(hasResult()).toBe(false)
    await generate()
    expect(result().request.body).toEqual({ text: '新变量', suffix: '原配置' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['固定输入', { customInputs: { text: '新固定输入' } }, '1.0.0', { text: '新固定输入', suffix: '原配置' }],
    ['输入绑定', { inputBindings: { text: 'nextSample' } }, '1.0.0', { text: '绑定值', suffix: '原配置' }],
    ['表单参数', { customValues: { suffix: '新配置' } }, '1.0.0', { text: 'hello', suffix: '新配置' }],
    ['模板快照', { customDefinition: definition('1.1.0') }, '1.1.0', { text: 'hello', suffix: '原配置' }],
  ])('同一面板接收外部%s变更时作废已有预览', async (_label, patch, version, body) => {
    const initial = config()
    const wrapper = render(initial)
    const { input, response, generate, result, hasResult } = panel(wrapper)
    await input().setValue('{"nextSample":"绑定值"}')
    await response().setValue('{"result":"保留样本"}')
    await generate()
    expect(hasResult()).toBe(true)
    await wrapper.setProps({ config: { ...initial, ...patch } })
    expect(hasResult()).toBe(false)
    expect(input().element.value).toBe('{"nextSample":"绑定值"}')
    expect(response().element.value).toBe('{"result":"保留样本"}')
    expect(wrapper.emitted('update')).toBeUndefined()
    await generate()
    expect(result().request.body).toEqual(body)
    expect(result().template).toEqual(`my-api@${version}`)
  })

  it('无关字段的变更不清除预览；可明确清除而不改样本', async () => {
    const initial = config()
    const wrapper = render(initial)
    const { input, generate, result, hasResult, clear } = panel(wrapper)
    const sample = '{"unused":"合成样本"}'
    await input().setValue(sample)
    await generate()
    await wrapper.setProps({ config: { ...initial, note: '无关变更' } })
    expect(result().request.body).toEqual({ text: 'hello', suffix: '原配置' })
    await clear()
    expect(hasResult()).toBe(false)
    expect(input().element.value).toBe(sample)
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('同一同步事件轮内更新样本并生成新结果，不清除本轮结果', async () => {
    const { response, generate, result } = panel(render())
    await generate()
    const updated = response().setValue('{"result":"同一轮新结果"}')
    const regenerated = generate()
    await updated
    await regenerated
    expect(result().outputs).toEqual({ result: '同一轮新结果' })
  })

  it('在真实检查器撤销和重做固定输入，仅作废对应预览并保留模拟样本', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
    vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
    const store = useWorkflowStore()
    const node = store.addNodeFromTemplate(customNodeTemplate(defaultCustomDefinition('API')), { x: 0, y: 0 })!
    expect(node).toBeDefined()
    useUiStore().setSelectedNode(node.id)
    const wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n] } })
    wrappers.push(wrapper)
    await flushPromises()
    const { input, response, generate, result, hasResult } = panel(wrapper)
    const fixed = wrapper.get<HTMLInputElement>(`${selector} input:not([type="number"])`)
    const mockInput = '{"unused":1}'
    const mockResponse = '{"result":"保留样本"}'
    await input().setValue(mockInput)
    await response().setValue(mockResponse)
    await fixed.setValue('固定输入 B')
    expect(store.nodes.find(item => item.id === node.id)?.data.config.customInputs).toEqual({ text: '固定输入 B' })
    await generate()
    expect(result().request.body).toEqual({ text: '固定输入 B' })
    expect(store.undo()).toBe(true)
    await nextTick()
    expect(hasResult()).toBe(false)
    expect(fixed.element.value).toBe('hello')
    expect(input().element.value).toBe(mockInput)
    expect(response().element.value).toBe(mockResponse)
    await generate()
    expect(result().request.body).toEqual({ text: 'hello' })
    expect(store.redo()).toBe(true)
    await nextTick()
    expect(hasResult()).toBe(false)
    expect(fixed.element.value).toBe('固定输入 B')
    await generate()
    expect(result().request.body).toEqual({ text: '固定输入 B' })
    expect(result().outputs).toEqual({ result: '保留样本' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
