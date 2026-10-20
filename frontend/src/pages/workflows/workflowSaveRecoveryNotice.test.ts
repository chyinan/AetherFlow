// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({
  apiClient: http,
  setUnauthorizedSessionRefresher: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}))
vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn().mockResolvedValue(null),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'

import WorkflowPage from './WorkflowPage.vue'

function project(id: string): ProjectSummary {
  return {
    id, name: `P${id}`, description: '', owner: 'tester', environment: 'dev', health: 'idle',
    scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
    workflowCount: 0, activeRunCount: 0, fileCount: 0, updatedAt: '', workflows: [],
  }
}

function networkError(url: string) {
  return { isAxiosError: true, message: 'Network Error', config: { url }, response: undefined }
}

let wrapper: ReturnType<typeof mount> | undefined

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const projects = useProjectStore()
  projects.projects = [project('11'), project('22')]
  vi.spyOn(projects, 'loadProjects').mockResolvedValue(undefined)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:id', component: WorkflowPage }],
  })
  await router.push('/workflows/201?projectId=11')
  await router.isReady()
  wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
    },
  })
  await flushPromises()
  return { store, router, projects }
}

function saveButton() {
  const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map((key) => i18n.global.t(key))
  return wrapper!.findAll('button').find((button) => labels.includes(button.text()))!
}

function definition(version: number, payload: unknown) {
  return {
    id: 201, name: '已有工作流', description: '', projectId: 11, version,
    definitionJson: JSON.stringify(payload), status: 'ready',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  const base = {
    name: '已有工作流', description: '', projectId: 11, version: 5,
    nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: {} }],
  }
  http.get.mockImplementation(async (url: string) => {
    if (url === '/workflows/definitions/201') return definition(5, base)
    throw new Error('Unexpected GET ' + url)
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

describe('保存响应丢失后的页面反馈', () => {
  let remoteVersion = 5
  let remotePayload: unknown = {
    name: '已有工作流', description: '', projectId: 11, version: 5,
    nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: {} }],
  }

  beforeEach(() => {
    remoteVersion = 5
    remotePayload = {
      name: '已有工作流', description: '', projectId: 11, version: 5,
      nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: {} }],
    }
    http.get.mockImplementation(async (url: string) => {
      if (url === '/workflows/definitions/201') return definition(remoteVersion, remotePayload)
      throw new Error('Unexpected GET ' + url)
    })
  })

  it('远端已提交时页面给出确认提示而不是保存失败', async () => {
    http.put.mockImplementation(async (url: string, payload: any) => {
      remoteVersion = remoteVersion + 1
      remotePayload = payload
      throw networkError(url)
    })
    const { store } = await setup()

    await saveButton().trigger('click')
    await flushPromises()

    expect(store.backendVersion).toBe(6)
    expect(store.dirty).toBe(false)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="save-recovery-hint"]').text()).toContain(i18n.global.t('workflow.saveRecoveryCommitted'))
  })

  it('远端被他人修改时页面明确冲突且不继续导航', async () => {
    http.put.mockImplementation(async (url: string) => {
      throw networkError(url)
    })
    const { store, router } = await setup()
    // 用户有未保存的本地草稿。
    store.updateNodeConfig('start-1', 'note', '本地草稿')
    // 核对之前，远端已被其他编辑者改成别的内容。
    remoteVersion = 6
    remotePayload = {
      name: '他人的工作流', description: '', projectId: 11, version: 5,
      nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: { other: true } }],
    }
    const pathBefore = router.currentRoute.value.fullPath

    await saveButton().trigger('click')
    await flushPromises()

    expect(store.backendVersion).toBe(5)
    expect(store.dirty).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe(pathBefore)
    expect(wrapper!.find('[role="alert"]').text()).toContain(i18n.global.t('workflow.saveRecoveryConflict'))
  })
})
