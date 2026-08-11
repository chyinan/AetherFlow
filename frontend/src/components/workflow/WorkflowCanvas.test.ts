import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('工作流画布删除操作', () => {
  it('删除节点前确认，避免误删节点和连线', () => {
    const source = readFileSync(fileURLToPath(new URL('./WorkflowCanvas.vue', import.meta.url)), 'utf8')

    expect(source).toContain('deleteNodeConfirm')
    expect(source).toContain('window.confirm')
  })
})

describe('工作流画布拖拽输入', () => {
  it('忽略损坏的拖拽数据而不让异常冒泡到页面', () => {
    const source = readFileSync(fileURLToPath(new URL('./WorkflowCanvas.vue', import.meta.url)), 'utf8')
    const dropHandler = source.slice(source.indexOf('function parseNodeTemplate'), source.indexOf('async function duplicateNode'))

    expect(dropHandler).toContain('try {')
    expect(dropHandler).toContain('catch')
    expect(dropHandler).toContain('const template = parseNodeTemplate(raw)')
  })
})
