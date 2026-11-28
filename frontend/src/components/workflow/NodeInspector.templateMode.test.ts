// @vitest-environment jsdom
// pattern: Imperative Shell
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', async original => ({ ...await original<typeof import('@/api/modules/node')>(), getNodeCatalog: vi.fn(async () => []) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
let wrapper: VueWrapper | undefined
const originalLocale=i18n.global.locale.value
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); i18n.global.locale.value=originalLocale })

it.each(['zh-CN','en-US','ja-JP'] as const)('%s 文本模板面板正常显示字面语法，结构化模式往返保留模板配置', async locale => {
  const pinia=createPinia(); setActivePinia(pinia); i18n.global.locale.value=locale
  vi.spyOn(useModelStore(),'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(),'refreshDatasets').mockResolvedValue(undefined)
  const store=useWorkflowStore(); store.resetToEmptyWorkflow()
  const node=store.addNodeFromTemplate(nodeTemplates.find(t=>t.kind==='template-transform')!,{x:0,y:0})!
  store.updateNodeConfigValues(node.id,{transformMode:'text',template:'你好 {{ name }}',outputVariable:'renderedText'})
  useUiStore().setSelectedNode(node.id)
  const errors:unknown[]=[]
  wrapper=mount(NodeInspector,{attachTo:document.body,global:{plugins:[pinia,i18n],config:{errorHandler:e=>errors.push(e)},stubs:{NodeConnectionSelector:true,WhisperEnvironmentDialog:true}}})
  await flushPromises()
  expect(errors).toEqual([])
  expect(wrapper.text().match(/\{\{ variable \}\}/g)).toHaveLength(2)
  expect(wrapper.get<HTMLTextAreaElement>('[data-config-field="template"]').element.value).toBe('你好 {{ name }}')
  await wrapper.get('[data-config-field="transformMode"]').setValue('structured')
  expect(wrapper.find('[data-testid="structured-mapping-editor"]').exists()).toBe(true)
  await wrapper.get('[data-config-field="transformMode"]').setValue('text')
  expect(errors).toEqual([])
  expect(wrapper.text().match(/\{\{ variable \}\}/g)).toHaveLength(2)
  expect(wrapper.get<HTMLTextAreaElement>('[data-config-field="template"]').element.value).toBe('你好 {{ name }}')
  expect(store.nodes.find(n=>n.id===node.id)!.data.config).toMatchObject({transformMode:'text',template:'你好 {{ name }}',outputVariable:'renderedText'})
})
