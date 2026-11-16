// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  updateWorkspace: vi.fn(),
}))

vi.mock('@/api/modules/workspace', () => api)

import { i18n } from '@/i18n'
import WorkspacesPage from './WorkspacesPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
const existing = {
  id: 'qa-workspace-7',
  name: 'Operations',
  slug: 'operations',
  region: 'cn-shanghai',
  environment: 'dev',
  owner: 'QA',
  memberCount: 1,
  defaultTimeoutMin: 60,
  retentionDays: 90,
}
let rows: typeof existing[]

function render() {
  wrapper = mount(WorkspacesPage, { global: { plugins: [i18n] } })
  return wrapper
}

function field(name: string) {
  const label = wrapper!.findAll('label').find(candidate => candidate.text().includes(name))
  if (!label) throw new Error(`Missing field label: ${name}`)
  return label.get('input')
}

async function openEdit() {
  const row = wrapper!.get('tbody tr')
  await row.get('button').trigger('click')
  await flushPromises()
  return wrapper!.get('[role="dialog"]')
}

beforeEach(() => {
  api.createWorkspace.mockReset().mockResolvedValue({})
  api.deleteWorkspace.mockReset().mockResolvedValue(undefined)
  api.updateWorkspace.mockReset().mockResolvedValue({})
  rows = [{ ...existing }]
  api.listWorkspaces.mockReset().mockImplementation(async () => ({ records: rows.map(row => ({ ...row })), total: rows.length }))
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Workspace form tests must not access the network') }))
  i18n.global.locale.value = 'en-US'
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
  i18n.global.locale.value = 'zh-CN'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('workspace management limit fields', () => {
  it.each([
    ['zero', '0'],
    ['fractional', '1.5'],
    ['overflow', '2147483648'],
  ])('keeps an edit open and blocks %s before sending it to the positive-integer API', async (_case, value) => {
    render()
    await flushPromises()
    const dialog = await openEdit()

    await field('Default timeout').setValue(value)
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(api.updateWorkspace).not.toHaveBeenCalled()
    expect(wrapper!.get('[role="dialog"] [role="alert"]').text()).toContain('whole numbers')
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(true)
  })

  it('omits blank limits when editing so the existing values are retained', async () => {
    const page = render()
    await flushPromises()
    const dialog = await openEdit()

    await field('Default timeout').setValue('')
    await field('Artifact retention').setValue('')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(api.updateWorkspace).toHaveBeenCalledTimes(1)
    const payload = api.updateWorkspace.mock.calls[0][1]
    expect(payload).not.toHaveProperty('defaultTimeoutMin')
    expect(payload).not.toHaveProperty('retentionDays')
    expect(page.find('[role="dialog"]').exists()).toBe(false)

    await openEdit()
    expect(field('Default timeout').element.value).toBe('60')
    expect(field('Artifact retention').element.value).toBe('90')
  })

  it('sends the visible 30/30 defaults when creating without changing them', async () => {
    const page = render()
    await flushPromises()
    await page.findAll('button').find(button => button.text().trim() === 'New workspace')!.trigger('click')
    const dialog = page.get('[role="dialog"]')

    await field('Name').setValue('Configured workspace')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(api.createWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Configured workspace',
      defaultTimeoutMin: 30,
      retentionDays: 30,
    }))
  })

  it('omits blank limits on create so the service can apply its defaults', async () => {
    const page = render()
    await flushPromises()
    await page.findAll('button').find(button => button.text().trim() === 'New workspace')!.trigger('click')
    const dialog = page.get('[role="dialog"]')

    await field('Name').setValue('Fresh workspace')
    await field('Default timeout').setValue('')
    await field('Artifact retention').setValue('')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(api.createWorkspace).toHaveBeenCalledTimes(1)
    const payload = api.createWorkspace.mock.calls[0][0]
    expect(payload).not.toHaveProperty('defaultTimeoutMin')
    expect(payload).not.toHaveProperty('retentionDays')
    expect(page.find('[role="dialog"]').exists()).toBe(false)
  })

  it('accepts valid positive values, saves, and refreshes the edited row', async () => {
    api.updateWorkspace.mockImplementation(async (_id, payload) => {
      rows = [{ ...existing, ...payload }]
      return rows[0]
    })
    const page = render()
    await flushPromises()
    const dialog = await openEdit()

    await field('Name').setValue('  Operations  ')
    await field('Default timeout').setValue('75')
    await field('Artifact retention').setValue('120')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(api.updateWorkspace).toHaveBeenCalledWith(existing.id, expect.objectContaining({
      name: 'Operations',
      defaultTimeoutMin: 75,
      retentionDays: 120,
    }))
    expect(page.find('[role="dialog"]').exists()).toBe(false)
    expect(page.get('tbody tr').text()).toContain('Operations')
  })
})
