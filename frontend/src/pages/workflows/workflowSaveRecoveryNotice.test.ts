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

import type { WorkflowDefinitionDTO, WorkflowDefinitionEntity } from '@/api/modules/workflow'
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
    routes: [
      { path: '/workflows/:id', component: WorkflowPage },
      { path: '/elsewhere', component: { template: '<div>其他页面</div>' } },
    ],
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

// 与后端内置 Text summary 模板的名称、节点和连线一致。
const textSummaryTemplate: WorkflowDefinitionDTO = {
  name: 'Text summary',
  description: 'Generate a concise summary from a prompt.',
  nodes: [
    { nodeId: 'start', nodeType: 'START', displayName: 'Start', config: { nextNodes: ['llm'] } },
    { nodeId: 'llm', nodeType: 'LLM', displayName: 'Generate summary', config: { nextNodes: ['end'], promptVariable: 'prompt' } },
    { nodeId: 'end', nodeType: 'END', displayName: 'Complete', config: {} },
  ],
}

function recoveryHint() {
  return wrapper!.find('[data-testid="save-recovery-hint"]')
}

async function openTemplates() {
  await wrapper!.get('[data-action="workflow-templates"]').trigger('click')
  await flushPromises()
}

function templateDialog() {
  return wrapper!.get('[aria-labelledby="workflow-template-title"]')
}

async function selectTemplate() {
  const option = templateDialog().findAll('button').find(button => button.text().includes(textSummaryTemplate.name))
  expect(option).toBeDefined()
  await option!.trigger('click')
  await flushPromises()
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

  let created: WorkflowDefinitionEntity | undefined

  beforeEach(() => {
    remoteVersion = 5
    created = undefined
    remotePayload = {
      name: '已有工作流', description: '', projectId: 11, version: 5,
      nodes: [{ nodeId: 'start-1', nodeType: 'START', displayName: '开始', config: {} }],
    }
    http.get.mockImplementation(async (url: string) => {
      if (url === '/workflows/definitions/201') return definition(remoteVersion, remotePayload)
      if (url === '/workflows/definitions/401' && created) return created
      if (url === '/workflows/templates') return [textSummaryTemplate]
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

  it('核对确认 A 后编辑 B 会明确提示 B 尚未保存，普通保存后撤下核对提示', async () => {
    http.put.mockImplementationOnce(async (url: string, payload: WorkflowDefinitionDTO) => {
      remoteVersion += 1
      remotePayload = payload
      throw networkError(url)
    }).mockImplementationOnce(async (_url: string, payload: WorkflowDefinitionDTO) => {
      remoteVersion += 1
      remotePayload = payload
      return definition(remoteVersion, remotePayload)
    })
    const { store, router } = await setup()
    store.updateNodeConfig('start-1', 'variables', { prompt: '已提交的 A' })
    await saveButton().trigger('click')
    await flushPromises()

    expect(recoveryHint().text()).toBe(i18n.global.t('workflow.saveRecoveryCommitted'))
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saved'))
    expect(store.backendVersion).toBe(6)

    store.updateNodeConfig('start-1', 'variables', { prompt: '尚未保存的 B' })
    await flushPromises()
    expect.soft(recoveryHint().text()).toBe(i18n.global.t('workflow.saveRecoveryCommittedWithNewerEdits'))
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saveWorkflow'))
    expect(store.dirty).toBe(true)
    expect(store.nodes[0]?.data.config.variables).toEqual({ prompt: '尚未保存的 B' })
    expect(http.put).toHaveBeenCalledTimes(1)

    await saveButton().trigger('click')
    await flushPromises()
    expect(http.put).toHaveBeenCalledTimes(2)
    expect(http.put.mock.calls.at(-1)?.[1]).toMatchObject({ version: 6, nodes: [{
      nodeId: 'start-1', config: { variables: { prompt: '尚未保存的 B' } },
    }] })
    expect(recoveryHint().exists()).toBe(false)
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saved'))

    await router.push('/elsewhere')
    await router.push('/workflows/201?projectId=11')
    await flushPromises()
    expect(store.backendVersion).toBe(7)
    expect(store.nodes[0]?.data.config.variables).toEqual({ prompt: '尚未保存的 B' })
    expect(recoveryHint().exists()).toBe(false)
  })

  it.each([
    { editWhileChecking: false, editAfterWrite: false },
    { editWhileChecking: false, editAfterWrite: true },
    { editWhileChecking: true, editAfterWrite: false },
    { editWhileChecking: true, editAfterWrite: true },
  ])('重试时按实际提交区分已保存内容（核对时编辑：$editWhileChecking，提交后编辑：$editAfterWrite）', async ({ editWhileChecking, editAfterWrite }) => {
    http.put.mockImplementationOnce(async (url: string, payload: WorkflowDefinitionDTO) => {
      remoteVersion += 1
      remotePayload = payload
      throw networkError(url)
    })
    const { store, router } = await setup()
    http.get.mockRejectedValueOnce(networkError('/workflows/definitions/201'))
    store.updateNodeConfig('start-1', 'variables', { prompt: '已提交但尚未确认的 A' })
    await saveButton().trigger('click')
    await flushPromises()

    expect(wrapper!.get('[role="alert"]').text()).toContain(i18n.global.t('workflow.saveRecoveryRetryable'))
    expect(store.backendVersion).toBe(5)
    expect(store.pendingSaveSubmission?.expectedVersion).toBe(5)
    expect(http.put).toHaveBeenCalledTimes(1)

    store.updateNodeConfig('start-1', 'variables', { prompt: '点击重试时的 B' })
    let finishCheck!: () => void
    http.get.mockImplementationOnce(() => new Promise<WorkflowDefinitionEntity>((resolve) => {
      finishCheck = () => resolve(definition(remoteVersion, remotePayload))
    }))
    let finishWrite!: () => void
    http.put.mockImplementationOnce((_url: string, payload: WorkflowDefinitionDTO) =>
      new Promise<WorkflowDefinitionEntity>((resolve) => {
        finishWrite = () => {
          remoteVersion += 1
          remotePayload = payload
          resolve(definition(remoteVersion, remotePayload))
        }
      }))
    await saveButton().trigger('click')
    await flushPromises()

    expect(recoveryHint().text()).toBe(i18n.global.t('workflow.saveRecoveryReconciling'))
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saving'))
    expect(http.put).toHaveBeenCalledTimes(1)
    const submittedPrompt = editWhileChecking ? '重试核对期间编辑的 C' : '点击重试时的 B'
    if (editWhileChecking) store.updateNodeConfig('start-1', 'variables', { prompt: submittedPrompt })

    finishCheck()
    await flushPromises()
    expect(recoveryHint().text()).toBe(i18n.global.t('workflow.saveRecoveryCommittedWithNewerEdits'))
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saving'))
    expect(http.put).toHaveBeenCalledTimes(2)
    expect(http.put.mock.calls.at(-1)?.[1]).toMatchObject({ version: 6, nodes: [{
      nodeId: 'start-1', config: { variables: { prompt: submittedPrompt } },
    }] })
    const localPrompt = editAfterWrite ? '提交之后编辑的 D' : submittedPrompt
    if (editAfterWrite) store.updateNodeConfig('start-1', 'variables', { prompt: localPrompt })
    const historyLength = store.historyPast.length

    finishWrite()
    await flushPromises()
    expect(recoveryHint().exists()).toBe(false)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(store.backendVersion).toBe(7)
    expect(store.pendingSaveSubmission).toBeNull()
    expect(store.nodes[0]?.data.config.variables).toEqual({ prompt: localPrompt })
    expect(store.historyPast).toHaveLength(historyLength)
    expect(http.put).toHaveBeenCalledTimes(2)
    expect(http.get).toHaveBeenCalledTimes(3)
    expect(http.post).not.toHaveBeenCalled()
    expect.soft(saveButton().text()).toBe(i18n.global.t(editAfterWrite ? 'workflow.saveWorkflow' : 'workflow.saved'))
    expect(store.dirty).toBe(editAfterWrite)
    expect(router.currentRoute.value.fullPath).toBe('/workflows/201?projectId=11')
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

  it('更换模板立即撤下上一画布的保存确认，新图仍须独立保存并可重开', async () => {
    http.put.mockImplementationOnce(async (url: string, payload: WorkflowDefinitionDTO) => {
      remoteVersion += 1
      remotePayload = payload
      throw networkError(url)
    })
    http.post.mockImplementationOnce(async (_url: string, payload: WorkflowDefinitionDTO) => {
      created = { ...definition(1, payload), id: 401, name: payload.name, description: payload.description ?? '' }
      return created
    })
    const { store, router } = await setup()
    store.updateNodeConfig('start-1', 'variables', { prompt: '已保存的原画布' })
    await saveButton().trigger('click')
    await flushPromises()
    expect(recoveryHint().text()).toContain(i18n.global.t('workflow.saveRecoveryCommitted'))
    expect(store.dirty).toBe(false)
    expect(store.backendVersion).toBe(6)

    await openTemplates()
    await selectTemplate()
    expect(store.workflowName).toBe(textSummaryTemplate.name)
    expect(store.workflowId).toBe('new')
    expect(store.backendDefinitionId).toBeNull()
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saveWorkflow'))
    expect.soft(recoveryHint().exists()).toBe(false)
    expect(http.post).not.toHaveBeenCalled()

    store.updateNodeConfig('llm', 'prompt', '独立模板的新编辑')
    await saveButton().trigger('click')
    await flushPromises()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.post).toHaveBeenCalledTimes(1)
    expect(http.post).toHaveBeenCalledWith('/workflows/definitions', expect.objectContaining({
      name: textSummaryTemplate.name, projectId: 11, idempotencyKey: expect.any(String),
      nodes: expect.arrayContaining([expect.objectContaining({
        nodeId: 'llm', config: expect.objectContaining({ prompt: '独立模板的新编辑', nextNodes: ['end'] }),
      })]),
    }), expect.any(Object))
    expect(router.currentRoute.value.fullPath).toBe('/workflows/401?projectId=11')
    expect(store.dirty).toBe(false)
    expect(recoveryHint().exists()).toBe(false)

    await router.push('/elsewhere')
    await router.push('/workflows/401?projectId=11')
    await flushPromises()
    expect(http.get).toHaveBeenCalledWith('/workflows/definitions/401', expect.any(Object))
    expect(store.workflowId).toBe('401')
    expect(store.nodes.find(node => node.id === 'llm')?.data.config.prompt).toBe('独立模板的新编辑')
    expect(store.edges.map(({ source, target }) => [source, target])).toEqual([['start', 'llm'], ['llm', 'end']])
    expect(store.dirty).toBe(false)
  })

  it.each(['成功', '失败'] as const)('更换模板清理仍在核对的提示和提交快照，迟到的核对%s不影响新画布', async (outcome) => {
    const { store } = await setup()
    let resolve!: (value: WorkflowDefinitionEntity) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<WorkflowDefinitionEntity>((yes, no) => { resolve = yes; reject = no })
    http.put.mockImplementationOnce(async (url: string, payload: WorkflowDefinitionDTO) => {
      remoteVersion += 1
      remotePayload = payload
      throw networkError(url)
    })
    http.get.mockReturnValueOnce(promise)
    store.updateNodeConfig('start-1', 'variables', { prompt: '等待核对的原画布' })
    await saveButton().trigger('click')
    await flushPromises()
    expect(recoveryHint().text()).toContain(i18n.global.t('workflow.saveRecoveryReconciling'))
    expect(store.pendingSaveSubmission?.workflowId).toBe('201')

    await openTemplates()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await selectTemplate()
    expect(templateDialog().isVisible()).toBe(true)
    expect(store.workflowId).toBe('201')
    expect(store.pendingSaveSubmission?.workflowId).toBe('201')
    expect(recoveryHint().text()).toContain(i18n.global.t('workflow.saveRecoveryReconciling'))

    await selectTemplate()
    expect(store.workflowId).toBe('new')
    expect(store.dirty).toBe(true)
    expect.soft(recoveryHint().exists()).toBe(false)
    expect.soft(store.pendingSaveSubmission?.workflowId).toBeUndefined()

    if (outcome === '成功') resolve(definition(remoteVersion, remotePayload))
    else reject(networkError('/workflows/definitions/201'))
    await flushPromises()
    expect(store.workflowName).toBe(textSummaryTemplate.name)
    expect(store.backendDefinitionId).toBeNull()
    expect(store.backendVersion).toBeNull()
    expect(store.dirty).toBe(true)
    expect(store.savingError).toBeNull()
    expect.soft(recoveryHint().exists()).toBe(false)
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.post).not.toHaveBeenCalled()
  })
})
