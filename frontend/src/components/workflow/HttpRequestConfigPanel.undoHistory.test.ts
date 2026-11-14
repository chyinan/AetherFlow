// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from '@/stores/workflowStore'
import HttpRequestConfigPanel from './HttpRequestConfigPanel.vue'

beforeEach(() => setActivePinia(createPinia()))

describe('HTTP 配置文本撤销历史', () => {
  it('将一次文本编辑合并为单个历史项，不挤掉此前的节点操作', async () => {
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    const start = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'start')!, { x: 0, y: 0 })!
    const http = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'http-request')!, { x: 320, y: 0 })!
    const historyAfterAddingNodes = store.historyPast.length
    const revisionBeforeTyping = store.editRevision
    const initialUrl = http.data.config.url
    const wrapper = mount(HttpRequestConfigPanel, {
      props: { config: http.data.config, nodeId: http.id },
      attrs: {
        onUpdate: (key: string, value: unknown) => store.updateNodeConfig(http.id, key, value),
        onEditStart: (nodeId: string, key: string) => store.beginHttpRequestConfigEdit(nodeId, key),
        onEditEnd: (nodeId: string, key: string) => store.finishHttpRequestConfigEdit(nodeId, key),
      },
    })

    const url = wrapper.get<HTMLInputElement>('[data-config-field="url"]')
    await url.trigger('focus')
    for (let index = 1; index <= 60; index += 1) {
      url.element.value = 'x'.repeat(index)
      await url.trigger('input')
    }
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe('x'.repeat(60))
    expect(store.dirty).toBe(true)
    expect(store.editRevision).toBe(revisionBeforeTyping + 60)

    await url.trigger('blur')
    expect(store.historyPast).toHaveLength(historyAfterAddingNodes + 1)
    expect(store.undo()).toBe(true)
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe(initialUrl)
    expect(store.undo()).toBe(true)
    expect(store.nodes.map(node => node.id)).toEqual([start.id])
    expect(store.undo()).toBe(true)
    expect(store.nodes).toHaveLength(0)

    wrapper.unmount()
  })

  it('以 blur 分隔连续文本编辑，图操作仍单独占用撤销项', async () => {
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    const http = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'http-request')!, { x: 0, y: 0 })!
    const wrapper = mount(HttpRequestConfigPanel, {
      props: { config: http.data.config, nodeId: http.id },
      attrs: {
        onUpdate: (key: string, value: unknown) => store.updateNodeConfig(http.id, key, value),
        onEditStart: (nodeId: string, key: string) => store.beginHttpRequestConfigEdit(nodeId, key),
        onEditEnd: (nodeId: string, key: string) => store.finishHttpRequestConfigEdit(nodeId, key),
      },
    })

    const url = wrapper.get<HTMLInputElement>('[data-config-field="url"]')
    await url.trigger('focus')
    url.element.value = 'a'
    await url.trigger('input')
    await url.trigger('blur')
    await url.trigger('focus')
    url.element.value = 'ab'
    await url.trigger('input')
    await url.trigger('blur')
    expect(store.historyPast).toHaveLength(3)

    const strategy = wrapper.get<HTMLSelectElement>('[data-config-field="errorStrategy"]')
    await strategy.setValue('BRANCH')
    expect(store.historyPast).toHaveLength(4)
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe('ab')
    expect(store.nodes.find(node => node.id === http.id)?.data.config.errorStrategy).toBe('BRANCH')
    expect(store.undo()).toBe(true)
    expect(store.nodes.find(node => node.id === http.id)?.data.config.errorStrategy).toBe('FAIL')
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe('ab')
    expect(store.undo()).toBe(true)
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe('a')

    wrapper.unmount()
  })

  it('打开的编辑遇到图操作时先提交文本历史，再独立记录节点操作', async () => {
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    const http = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'http-request')!, { x: 0, y: 0 })!
    const initialUrl = http.data.config.url
    const initialHistoryLength = store.historyPast.length
    const wrapper = mount(HttpRequestConfigPanel, {
      props: { config: http.data.config, nodeId: http.id },
      attrs: {
        onUpdate: (key: string, value: unknown) => store.updateNodeConfig(http.id, key, value),
        onEditStart: (nodeId: string, key: string) => store.beginHttpRequestConfigEdit(nodeId, key),
        onEditEnd: (nodeId: string, key: string) => store.finishHttpRequestConfigEdit(nodeId, key),
      },
    })

    const url = wrapper.get<HTMLInputElement>('[data-config-field="url"]')
    await url.trigger('focus')
    url.element.value = 'edited while focused'
    await url.trigger('input')
    const output = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'output')!, { x: 320, y: 0 })!
    expect(store.historyPast).toHaveLength(initialHistoryLength + 2)

    expect(store.undo()).toBe(true)
    expect(store.nodes.some(node => node.id === output.id)).toBe(false)
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe('edited while focused')
    expect(store.undo()).toBe(true)
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe(initialUrl)
    wrapper.unmount()
  })

  it('组件卸载时结束编辑分组，导航后仍可一次撤销完整文本', async () => {
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    const http = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'http-request')!, { x: 0, y: 0 })!
    const initialUrl = http.data.config.url
    const wrapper = mount(HttpRequestConfigPanel, {
      props: { config: http.data.config, nodeId: http.id },
      attrs: {
        onUpdate: (key: string, value: unknown) => store.updateNodeConfig(http.id, key, value),
        onEditStart: (nodeId: string, key: string) => store.beginHttpRequestConfigEdit(nodeId, key),
        onEditEnd: (nodeId: string, key: string) => store.finishHttpRequestConfigEdit(nodeId, key),
      },
    })

    const url = wrapper.get<HTMLInputElement>('[data-config-field="url"]')
    await url.trigger('focus')
    url.element.value = 'draft before navigation'
    await url.trigger('input')
    wrapper.unmount()

    expect(store.historyPast).toHaveLength(2)
    expect(store.undo()).toBe(true)
    expect(store.nodes.find(node => node.id === http.id)?.data.config.url).toBe(initialUrl)
  })
})
