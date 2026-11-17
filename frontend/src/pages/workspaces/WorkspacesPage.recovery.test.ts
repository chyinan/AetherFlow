// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
}))
vi.mock('@/api/modules/workspace', () => api)

import { i18n } from '@/i18n'
import WorkspacesPage from './WorkspacesPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
const emptyResult = { records: [], total: 0 }

function render() {
  wrapper = mount(WorkspacesPage, { global: { plugins: [i18n] } })
  return wrapper
}

beforeEach(() => {
  api.listWorkspaces.mockReset()
  api.createWorkspace.mockReset()
  api.deleteWorkspace.mockReset()
  api.updateWorkspace.mockReset()
  i18n.global.locale.value = 'en-US'
  api.deleteWorkspace.mockResolvedValue(undefined)
  api.updateWorkspace.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Workspace recovery tests must not access the network') }))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
  i18n.global.locale.value = 'zh-CN'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('first-use workspace recovery', () => {
  it('does not present a failed initial list request as a successful empty result', async () => {
    api.listWorkspaces.mockRejectedValueOnce(new Error('synthetic temporary list failure'))
    const page = render()
    await flushPromises()

    expect(page.get('[role="alert"]').text()).toContain('synthetic temporary list failure')
    expect(page.text()).not.toContain(i18n.global.t('workspaces.emptyTitle'))
    expect(page.text()).not.toContain(i18n.global.t('workspaces.total', { count: 0 }))
    expect(page.find('[aria-busy="true"]').exists()).toBe(false)
  })

  it('shows the empty state only after a successful retry returns no workspaces', async () => {
    api.listWorkspaces.mockRejectedValueOnce(new Error('synthetic temporary list failure')).mockResolvedValueOnce(emptyResult)
    const page = render()
    await flushPromises()
    await page.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.text()).toContain(i18n.global.t('workspaces.emptyTitle'))
    expect(page.text()).toContain(i18n.global.t('workspaces.total', { count: 0 }))
  })

  it('retains the create draft after a failed request and closes only after retry succeeds', async () => {
    const created = { id: 'synthetic-workspace-1', name: 'QA-only workspace' }
    api.listWorkspaces.mockResolvedValueOnce(emptyResult).mockResolvedValueOnce({ records: [created], total: 1 })
    api.createWorkspace.mockRejectedValueOnce(new Error('synthetic create failure')).mockResolvedValueOnce(created)
    const page = render()
    await flushPromises()
    const createButton = page.findAll('button').find(button => button.text().trim() === i18n.global.t('workspaces.create'))!
    await createButton.trigger('click')

    const dialog = page.get('[role="dialog"]')
    await dialog.get('input').setValue(created.name)
    await dialog.get('form').trigger('submit')
    await flushPromises()
    expect(dialog.get('[role="alert"]').text()).toContain('synthetic create failure')
    expect(dialog.get('input').element.value).toBe(created.name)

    await dialog.get('form').trigger('submit')
    await flushPromises()
    expect(page.find('[role="dialog"]').exists()).toBe(false)
    expect(page.text()).toContain(created.name)
    expect(api.createWorkspace).toHaveBeenCalledTimes(2)
  })
})
