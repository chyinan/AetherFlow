// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import LogStream from './LogStream.vue'
import type { RunLogEntry } from '@/types/run'

const wrappers: ReturnType<typeof mount>[] = []
const diagnosis = { provider: 'COMFYUI', stage: 'QUEUE', field: 'sampler', reason: 'REJECTED' } as const
function log(overrides: Partial<RunLogEntry> = {}): RunLogEntry {
  return { id: 'same-log', time: '10:00', level: 'error', nodeId: 'image-1', message: 'Workflow 42 failed.', imageFailure: diagnosis, ...overrides }
}
async function render(logs = [log()], workflowId: string | undefined = 'workflow-1', locale = 'zh-CN') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/runs/run-1')
  const wrapper = mount(LogStream, { props: { logs, runId: 'run-1', workflowId }, global: { plugins: [router, createI18n({
    legacy: false, locale, messages: { [locale]: {} }, missingWarn: false, fallbackWarn: false,
  })] } })
  wrappers.push(wrapper)
  return { wrapper, router }
}
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('历史日志复用图像故障卡', () => {
  it('保留原因、建议、节点与脱敏诊断，编辑器链接不伪装成字段聚焦', async () => {
    const { wrapper, router } = await render()
    const card = wrapper.get('[data-testid="image-execution-failure"]')
    expect(card.text()).toContain('工作流提交失败')
    expect(card.text()).toContain('服务未接受当前工作流或参数')
    expect(card.text()).toContain('兼容采样器')
    expect(card.text()).toContain('节点：image-1')
    expect(card.get('pre').text()).toBe('[IMAGE_EXECUTION:COMFYUI:QUEUE:sampler:REJECTED]')
    expect(card.find('[data-testid="locate-image-failure"]').exists()).toBe(false)
    await card.get('[data-testid="open-image-workflow"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/workflow-1')
  })

  it('旧格式错误标识可解析，原始响应敏感信息不进入 DOM 或标题', async () => {
    const { wrapper } = await render([log({ imageFailure: undefined, message: 'private-prefix [IMAGE_EXECUTION:SD_WEBUI:REQUEST:connectionId:UNREACHABLE] token=secret-response' })])
    expect(wrapper.text()).toContain('Stable Diffusion WebUI')
    expect(wrapper.text()).toContain('测试连接')
    expect(wrapper.html()).not.toContain('private-prefix')
    expect(wrapper.html()).not.toContain('secret-response')
  })

  it('搜索支持节点、原有消息及诊断建议，等级筛选继续生效', async () => {
    const { wrapper } = await render([log(), log({ id: 'info', nodeId: 'load', level: 'info', message: '普通消息内容', imageFailure: undefined })])
    const query = wrapper.get('input')
    await query.setValue('兼容采样器')
    expect(wrapper.findAll('[data-testid="image-execution-failure"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('普通消息内容')
    await wrapper.get('select').setValue('info')
    expect(wrapper.find('[data-testid="image-execution-failure"]').exists()).toBe(false)
    await query.setValue('消息')
    expect(wrapper.text()).toContain('普通消息内容')
    await wrapper.get('select').setValue('all')
    await query.setValue('IMAGE-1')
    expect(wrapper.find('[data-testid="image-execution-failure"]').exists()).toBe(true)
    await query.setValue('Workflow 42')
    expect(wrapper.find('[data-testid="image-execution-failure"]').exists()).toBe(true)
    await query.setValue('REJECTED')
    expect(wrapper.find('[data-testid="image-execution-failure"]').exists()).toBe(true)
  })

  it.each(['TIMEOUT', 'INTERRUPTED'] as const)('%s 仅提醒核对远端任务，不引导立即重复执行', async (reason) => {
    const { wrapper } = await render([log({ imageFailure: { provider: 'SD_WEBUI', stage: 'REQUEST', field: 'timeoutSeconds', reason } })])
    expect(wrapper.text()).toContain('远端任务可能仍在执行')
    expect(wrapper.text()).not.toContain('再手动重新运行')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('切换运行复用日志 ID 时重置详情展开，仅显示新运行内容并保留筛选', async () => {
    const { wrapper } = await render()
    const details = wrapper.get('details').element as HTMLDetailsElement
    details.open = true
    await wrapper.get('select').setValue('error')
    await wrapper.setProps({ runId: 'run-2', workflowId: 'workflow-2', logs: [log({ nodeId: 'image-2', imageFailure: { ...diagnosis, field: 'checkpoint' } })] })
    expect((wrapper.get('details').element as HTMLDetailsElement).open).toBe(false)
    expect(wrapper.text()).not.toContain('节点：image-1')
    expect(wrapper.text()).toContain('节点：image-2')
    expect(wrapper.text()).toContain('Checkpoint')
    expect(wrapper.get('select').element.value).toBe('error')
    expect(wrapper.get('[data-testid="open-image-workflow"]').attributes('href')).toBe('/workflows/workflow-2')
  })

  it('缺失工作流信息只给节点与检查建议，不生成错误跳转地址', async () => {
    const { wrapper } = await render()
    await wrapper.setProps({ workflowId: undefined, logs: [log({ nodeId: undefined })] })
    expect(wrapper.find('[data-testid="open-image-workflow"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('在工作流编辑器中打开对应节点')
    expect(wrapper.text()).not.toContain('节点：undefined')
  })

  it('普通长消息完整换行展示，恶意 HTML 作为文字处理', async () => {
    const message = `第一行\n${'长日志'.repeat(200)}<img src=x onerror=alert(1)>`
    const { wrapper } = await render([log({ message, imageFailure: undefined })])
    expect(wrapper.text()).toContain(message)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('[data-testid="image-execution-failure"]').exists()).toBe(false)
  })

  it.each(['en-US', 'ja-JP'])('局部消息支持 %s', async (locale) => {
    const { wrapper } = await render([log()], undefined, locale)
    expect(wrapper.get('[data-testid="image-execution-failure"]').text()).not.toContain('reasons.REJECTED')
    expect(wrapper.get('[data-testid="image-execution-failure"]').text()).not.toContain('actions.sampler')
  })
})
