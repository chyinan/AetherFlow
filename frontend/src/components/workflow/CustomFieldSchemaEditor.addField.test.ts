// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkflowStore } from '@/stores/workflowStore'
import { installCustomNodeLockHarness } from '@/test/customNodeLockHarness'
import { CUSTOM_NODE_STORAGE_KEY, importCustomDefinitions } from '@/utils/customNodes'
import CustomNodeLibrary from './CustomNodeLibrary.vue'

type Group = '输入' | '表单' | '输出'
const groupCases = [
  { label: '输入', key: 'inputs', remainingDefault: 'text' },
  { label: '表单', key: 'fields', remainingDefault: undefined },
  { label: '输出', key: 'outputs', remainingDefault: 'result' },
] as const

let wrapper: ReturnType<typeof mount> | undefined
let lockHarness: ReturnType<typeof installCustomNodeLockHarness>

function group(label: Group) {
  return [...document.querySelectorAll('h3')].find((heading) => heading.textContent === label)!.parentElement!
}

function fields(label: Group) {
  return [...group(label).querySelectorAll<HTMLInputElement>('input[aria-label*="字段名"]')]
}

function namedButton(scope: ParentNode, text: string) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text)
  expect(button, text).toBeDefined()
  return button!
}

async function click(button: HTMLButtonElement) {
  button.click()
  await flushPromises()
}

async function open() {
  wrapper = mount(CustomNodeLibrary, { attachTo: document.body })
  await click(namedButton(document, '自定义节点 · API / 代码'))
}

async function add(label: Group) {
  await click(namedButton(group(label), `添加${label}字段`))
}

async function remove(label: Group, row: number) {
  await click(group(label).querySelector<HTMLButtonElement>(`button[aria-label="删除${label} ${row}"]`)!)
}

async function edit(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function save() {
  await click(namedButton(document, '保存模板'))
}

function persistedTemplate() {
  const raw = localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)
  expect(raw, document.querySelector('[role="alert"]')?.textContent ?? '应保存模板').not.toBeNull()
  const [saved] = importCustomDefinitions(raw!)
  expect(useWorkflowStore().customDefinitions).toEqual([saved])
  return saved!
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  lockHarness = installCustomNodeLockHarness()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('此回归不发送网络请求') }))
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('此回归不发送网络请求') })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  localStorage.clear()
  document.body.innerHTML = ''
  lockHarness.restore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('自定义模板添加字段时分配同组未使用的名称', () => {
  it.each(groupCases)('删除较早的$label字段后，直接重新添加并保存', async ({ label, key, remainingDefault }) => {
    await open()
    for (let index = 0; index < 3; index++) await add(label)
    const firstGeneratedRow = remainingDefault ? 2 : 1
    await remove(label, firstGeneratedRow)
    await add(label)
    await save()

    const saved = persistedTemplate()[key]
    expect(saved.map((field) => field.name)).toEqual(remainingDefault
      ? [remainingDefault, 'field3', 'field4', 'field5']
      : ['field2', 'field3', 'field4'])
    if (label === '输出') expect(saved.map((field) => field.path)).toEqual(['/result', '/field3', '/field4', '/field5'])
    if (label === '输入') expect(saved[0]).toMatchObject({ name: 'text', defaultValue: 'hello', required: true })
  })

  it('跳过多个已手动使用的名称，不重命名现有字段或改写路径', async () => {
    await open()
    await add('输出')
    await add('输出')
    await edit(fields('输出')[1]!, 'field4')
    await edit(fields('输出')[2]!, 'field5')
    await edit(group('输出').querySelectorAll<HTMLInputElement>('input.font-mono')[1]!, '/nested/value')
    await add('输出')
    await save()

    expect(persistedTemplate().outputs.map(({ name, path }) => [name, path])).toEqual([
      ['result', '/result'], ['field4', '/nested/value'], ['field5', '/field3'], ['field6', '/field6'],
    ])
  })

  it('正常连续添加保持原命名，各组可以独立使用同一个名字', async () => {
    await open()
    for (const label of ['输入', '表单', '输出'] as const) {
      await add(label)
      await add(label)
    }
    await save()
    const saved = persistedTemplate()
    expect(saved.inputs.map((field) => field.name)).toEqual(['text', 'field2', 'field3'])
    expect(saved.fields.map((field) => field.name)).toEqual(['field1', 'field2'])
    expect(saved.outputs.map((field) => [field.name, field.path])).toEqual([
      ['result', '/result'], ['field2', '/field2'], ['field3', '/field3'],
    ])
  })

  it('保留显式重名校验，不在保存时偷偷更名', async () => {
    await open()
    await add('表单')
    await add('表单')
    await edit(fields('表单')[1]!, 'field1')
    await save()
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('字段名称无效或重复')
    expect(fields('表单').map((input) => input.value)).toEqual(['field1', 'field1'])
  })

  it('每组仍限制 32 个字段，删除后能再次添加第 32 个字段', async () => {
    await open()
    for (let index = 0; index < 32; index++) await add('表单')
    const addButton = namedButton(group('表单'), '添加表单字段')
    expect(addButton.disabled).toBe(true)
    await click(addButton)
    expect(fields('表单')).toHaveLength(32)
    await remove('表单', 2)
    expect(addButton.disabled).toBe(false)
    await add('表单')
    expect(fields('表单')).toHaveLength(32)
    expect(addButton.disabled).toBe(true)
    await save()
    expect(persistedTemplate().fields.at(-1)?.name).toBe('field33')
  })
})
