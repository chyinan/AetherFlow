// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import type { WorkflowDefinitionDTO, WorkflowDefinitionEntity } from '@/api/modules/workflow'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowGraphNode } from '@/types/workflow'
import WorkflowCanvas from './WorkflowCanvas.vue'

const defaultAdapter = axiosInstance.defaults.adapter
let wrapper: VueWrapper | undefined
let entity: WorkflowDefinitionEntity
let nextPutGate: Promise<void> | undefined
let writes: WorkflowDefinitionDTO[]

function node(id: string, x = 0, y = 0, selected = false): WorkflowGraphNode {
  return {
    id, type: 'workflow', position: { x, y }, selected,
    data: { kind: 'start', label: id, description: '', config: {}, inputs: [], outputs: [], status: 'idle' },
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  localStorage.clear()
  nextPutGate = undefined
  writes = []
  entity = { id: 101, name: '已保存工作流', version: 2 }
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  axiosInstance.defaults.adapter = async (config) => {
    if (config.url !== '/workflows/definitions/101') throw new Error(`Unexpected endpoint ${config.url}`)
    if (config.method === 'put') {
      const definition = JSON.parse(config.data) as WorkflowDefinitionDTO
      writes.push(definition)
      const submitted = {
        ...entity, version: (entity.version ?? 0) + 1, name: definition.name,
        definitionJson: JSON.stringify(definition),
      }
      const gate = nextPutGate
      nextPutGate = undefined
      if (gate) await gate
      entity = submitted
    } else if (config.method !== 'get') {
      throw new Error(`Unexpected method ${config.method}`)
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: entity }
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = defaultAdapter
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function setup(nodes = [node('a')]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  store.workflowId = '101'
  store.workflowName = entity.name
  store.backendDefinitionId = entity.id
  store.backendVersion = entity.version ?? null
  store.nodes = nodes
  store.edges = []
  wrapper = mount(WorkflowCanvas, {
    attachTo: document.body,
    global: { plugins: [pinia, i18n] },
  })
  await flushPromises()
  return {
    store,
    graphNode: (id: string) => wrapper!.get<HTMLElement>(`.vue-flow__node[data-id="${id}"]`),
  }
}

describe('画布键盘移动属于可保存的布局编辑', () => {
  it('方向键移动后标记未保存，并可以撤销和重做', async () => {
    const { store, graphNode } = await setup()
    graphNode('a').element.focus()
    await graphNode('a').trigger('keydown', { key: 'Enter' })
    expect(graphNode('a').classes()).toContain('selected')
    expect(store.dirty).toBe(false)
    await graphNode('a').trigger('keydown', { key: 'ArrowRight' })
    expect(graphNode('a').element.style.transform).toContain('translate(5px,0px)')
    expect(store.nodes[0]!.position).toEqual({ x: 5, y: 0 })
    expect(store.dirty).toBe(true)
    expect(store.editRevision).toBe(1)
    expect(store.undo()).toBe(true)
    await flushPromises()
    expect(graphNode('a').element.style.transform).toContain('translate(0px,0px)')
    expect(store.redo()).toBe(true)
    await flushPromises()
    expect(graphNode('a').element.style.transform).toContain('translate(5px,0px)')
  })

  it('多选节点一次移动只占一个撤销点，Shift 仍使用原移动步长', async () => {
    const { store, graphNode } = await setup([node('a', 0, 0, true), node('b', 100, 50, true), node('c', 200, 100)])
    graphNode('a').element.focus()
    await graphNode('a').trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    expect(store.nodes.map((item) => item.position.y)).toEqual([20, 70, 100])
    expect(store.historyPast).toHaveLength(1)
    expect(store.undo()).toBe(true)
    expect(store.nodes.map((item) => item.position.y)).toEqual([0, 50, 100])
    expect(store.redo()).toBe(true)
    expect(store.nodes.map((item) => item.position.y)).toEqual([20, 70, 100])
  })

  it('旧保存回执不吞掉等待期间新的键盘布局，下次保存后重开可恢复', async () => {
    const { store, graphNode } = await setup([node('a', 0, 0, true)])
    const gate = deferred()
    nextPutGate = gate.promise
    const saving = store.saveCurrentWorkflow()
    await flushPromises()
    await graphNode('a').trigger('keydown', { key: 'ArrowRight' })
    gate.resolve()
    await saving
    expect(store.backendVersion).toBe(3)
    expect(store.dirty).toBe(true)
    expect(writes[0]?.nodes[0]?.position).toEqual({ x: 0, y: 0 })
    await store.saveCurrentWorkflow()
    expect(writes[1]).toMatchObject({
      version: 3, nodes: [{ nodeId: 'a', position: { x: 5, y: 0 } }],
    })
    expect(store.dirty).toBe(false)
    expect(await store.loadWorkflow('101')).toBe(true)
    await flushPromises()
    expect(store.nodes[0]!.position).toEqual({ x: 5, y: 0 })
    expect(graphNode('a').element.style.transform).toContain('translate(5px,0px)')
    expect(store.historyPast).toHaveLength(0)
  })

  it('未选中时的方向键、单独选中和搜索框方向键不污染编辑历史', async () => {
    const { store, graphNode } = await setup()
    await graphNode('a').trigger('keydown', { key: 'ArrowLeft' })
    await graphNode('a').trigger('keydown', { key: 'Enter' })
    expect(graphNode('a').classes()).toContain('selected')
    const search = wrapper!.get<HTMLInputElement>('input[type="search"]')
    search.element.focus()
    await search.trigger('keydown', { key: 'ArrowDown' })
    expect(store.nodes[0]!.position).toEqual({ x: 0, y: 0 })
    expect(store.dirty).toBe(false)
    expect(store.editRevision).toBe(0)
    expect(store.historyPast).toHaveLength(0)
  })
  it.each(['workflow.addNextNode', 'workflow.duplicateNode', 'workflow.deleteNode'])(
    '焦点在节点操作按钮 %s 时方向键不修改画布布局', async (labelKey) => {
      const { store, graphNode } = await setup([node('a', 0, 0, true)])
      const button = graphNode('a').findAll<HTMLButtonElement>('button')
        .find(item => item.attributes('aria-label') === i18n.global.t(labelKey))!
      button.element.focus()
      for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
        await button.trigger('keydown', { key, shiftKey: true })
        expect(store.nodes[0]!.position).toEqual({ x: 0, y: 0 })
      }
      expect(store.dirty).toBe(false)
      expect(store.editRevision).toBe(0)
      expect(store.historyPast).toHaveLength(0)
      expect(document.activeElement).toBe(button.element)
    },
  )

  it('从操作按钮返回节点容器后仍可键盘移动、撤销和重做', async () => {
    const { store, graphNode } = await setup([node('a', 0, 0, true)])
    const duplicate = graphNode('a').findAll<HTMLButtonElement>('button')
      .find(item => item.attributes('aria-label') === i18n.global.t('workflow.duplicateNode'))!
    duplicate.element.focus()
    await duplicate.trigger('keydown', { key: 'ArrowRight' })
    graphNode('a').element.focus()
    await graphNode('a').trigger('keydown', { key: 'ArrowRight' })
    expect(store.nodes[0]!.position).toEqual({ x: 5, y: 0 })
    expect(store.historyPast).toHaveLength(1)
    expect(store.undo()).toBe(true)
    expect(store.nodes[0]!.position).toEqual({ x: 0, y: 0 })
    expect(store.redo()).toBe(true)
    expect(store.nodes[0]!.position).toEqual({ x: 5, y: 0 })
  })

})
