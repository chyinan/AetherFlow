// @vitest-environment jsdom
import { TextDecoder } from 'node:util'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowDefinitionDTO, WorkflowDefinitionEntity } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'
import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
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

const existingUrl = '/workflows/definitions/201'
const convertUrl = '/workflows/definitions/import/comfyui'
const createUrl = '/workflows/definitions'
const fileText = '{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"a red bird"}}}'
const source: WorkflowDefinitionDTO = {
  name: 'Existing workflow', projectId: 11, version: 5,
  nodes: [{ nodeId: 'old-start', nodeType: 'START', config: {} }],
}
const imported: WorkflowDefinitionDTO = {
  name: 'red-bird', projectId: 11,
  nodes: [
    { nodeId: 'start', nodeType: 'START', config: { next: 'prompt' } },
    { nodeId: 'prompt', nodeType: 'PROMPT', config: { prompt: 'a red bird', stylePreset: 'comfyui-import', next: 'image' } },
    { nodeId: 'image', nodeType: 'IMAGE_GENERATION', config: {
      provider: 'COMFYUI', mode: 'workflow', workflow: fileText, workflowJson: fileText, next: 'end',
    } },
    { nodeId: 'end', nodeType: 'END', config: {} },
  ],
}
const edges = [['start', 'prompt'], ['prompt', 'image'], ['image', 'end']]
const project: ProjectSummary = {
  id: '11', name: 'Project', description: '', owner: 'tester', environment: 'dev', health: 'idle',
  scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
  workflowCount: 0, activeRunCount: 0, fileCount: 0, updatedAt: '', workflows: [],
}

function entity(id: number, version: number, definition: WorkflowDefinitionDTO): WorkflowDefinitionEntity {
  return {
    id, version, name: definition.name, description: definition.description ?? '', projectId: definition.projectId,
    definitionJson: JSON.stringify(definition), status: 'ready',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function lostResponse(url: string) {
  return { isAxiosError: true, message: 'Network Error', config: { url }, response: undefined }
}

let remote: WorkflowDefinitionEntity
let created: WorkflowDefinitionEntity | undefined
let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('TextDecoder', TextDecoder)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  localStorage.clear()
  remote = entity(201, 5, source)
  created = undefined
  http.get.mockImplementation(async (url: string) => {
    if (url === existingUrl) return remote
    if (url === '/workflows/definitions/401' && created) return created
    throw new Error('Unexpected GET ' + url)
  })
  http.post.mockImplementation(async (url: string, payload: WorkflowDefinitionDTO) => {
    if (url === convertUrl) return imported
    if (url === createUrl) {
      created = entity(401, 1, payload)
      return created
    }
    throw new Error('Unexpected POST ' + url)
  })
  http.put.mockImplementation(async (url: string, payload: WorkflowDefinitionDTO) => {
    if (url !== existingUrl) throw new Error('Unexpected PUT ' + url)
    remote = entity(201, 6, payload)
    throw lostResponse(url)
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const projects = useProjectStore()
  projects.projects = [project]
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
  store.updateNodeConfig('old-start', 'variables', { prompt: 'saved only in the original workflow' })
  return { store, router }
}

function button(...keys: string[]) {
  const labels = keys.map((key) => i18n.global.t('workflow.' + key))
  const control = wrapper!.findAll('button').find((item) => labels.includes(item.text()))
  if (!control) throw new Error('Missing workflow button ' + keys.join('/'))
  return control
}

async function save() {
  await button('saveWorkflow', 'saved').trigger('click')
  await flushPromises()
}

function recoveryNotice() {
  return wrapper!.find('[data-testid="save-recovery-hint"]')
}

async function selectImport() {
  const input = wrapper!.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [new File([fileText], 'red-bird.json', { type: 'application/json' })],
  })
  await input.trigger('change')
  await flushPromises()
}

describe('ComfyUI import and prior workflow save recovery', () => {
  it('withdraws the old save confirmation only when the import replaces the canvas, then saves and reopens the new draft', async () => {
    const { store, router } = await setup()
    await save()
    expect(recoveryNotice().text()).toContain(i18n.global.t('workflow.saveRecoveryCommitted'))
    expect(store.dirty).toBe(false)
    expect(store.backendVersion).toBe(6)

    const conversion = deferred<WorkflowDefinitionDTO>()
    http.post.mockReturnValueOnce(conversion.promise)
    await selectImport()
    expect(http.post).toHaveBeenCalledWith(convertUrl, expect.objectContaining({
      name: 'red-bird', projectId: 11, workflowJson: fileText,
    }), expect.any(Object))
    expect(recoveryNotice().exists()).toBe(true)
    conversion.resolve(imported)
    await flushPromises()
    expect(store.workflowId).toBe('new')
    expect(store.workflowName).toBe(imported.name)
    expect(store.backendDefinitionId).toBeNull()
    expect(store.nodes.map((node) => node.id)).toEqual(['start', 'prompt', 'image', 'end'])
    expect(store.edges.map(({ source, target }) => [source, target])).toEqual(edges)
    expect(store.dirty).toBe(true)
    expect.soft(recoveryNotice().exists()).toBe(false)
    expect(http.post).toHaveBeenCalledTimes(1)

    await save()
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.post).toHaveBeenCalledTimes(2)
    expect(http.post).toHaveBeenLastCalledWith(createUrl, expect.objectContaining({
      name: imported.name, projectId: 11, idempotencyKey: expect.any(String),
      nodes: expect.arrayContaining([expect.objectContaining({
        nodeId: 'image', config: expect.objectContaining({ workflowJson: fileText }),
      })]),
    }), expect.any(Object))
    expect(router.currentRoute.value.fullPath).toBe('/workflows/401?projectId=11')
    expect(store.dirty).toBe(false)

    await router.push('/workflows/201?projectId=11')
    await flushPromises()
    expect(store.nodes[0]?.data.config.variables).toEqual({ prompt: 'saved only in the original workflow' })
    await router.push('/workflows/401?projectId=11')
    await flushPromises()
    expect(store.workflowId).toBe('401')
    expect(store.nodes.find((node) => node.id === 'image')?.data.config.workflowJson).toBe(fileText)
    expect(store.edges.map(({ source, target }) => [source, target])).toEqual(edges)
    expect(recoveryNotice().exists()).toBe(false)
  })

  it.each(['resolve', 'reject'] as const)('drops pending recovery on import and quarantines its late %s', async (outcome) => {
    const { store } = await setup()
    const readback = deferred<WorkflowDefinitionEntity>()
    http.get.mockReturnValueOnce(readback.promise)
    await save()
    expect(recoveryNotice().text()).toContain(i18n.global.t('workflow.saveRecoveryReconciling'))
    expect(store.pendingSaveSubmission?.workflowId).toBe('201')

    await selectImport()
    expect(store.workflowName).toBe(imported.name)
    expect(store.dirty).toBe(true)
    expect.soft(recoveryNotice().exists()).toBe(false)
    expect.soft(store.pendingSaveSubmission).toBeNull()

    if (outcome === 'resolve') readback.resolve(remote)
    else readback.reject(lostResponse(existingUrl))
    await flushPromises()
    expect(store.backendVersion).toBeNull()
    expect(store.savingError).toBeNull()
    expect(store.workflowId).toBe('new')
    expect(store.edges.map(({ source, target }) => [source, target])).toEqual(edges)
    expect(http.put).toHaveBeenCalledTimes(1)
    expect(http.post).toHaveBeenCalledTimes(1)
  })

  it('preserves recovery for a cancelled import, a failed conversion, and clearing the same workflow', async () => {
    const { store } = await setup()
    const readback = deferred<WorkflowDefinitionEntity>()
    http.get.mockReturnValueOnce(readback.promise)
    await save()

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await selectImport()
    expect(http.post).not.toHaveBeenCalled()
    expect(recoveryNotice().text()).toContain(i18n.global.t('workflow.saveRecoveryReconciling'))
    expect(store.pendingSaveSubmission?.workflowId).toBe('201')

    http.post.mockRejectedValueOnce(new Error('Conversion unavailable'))
    await selectImport()
    expect(wrapper!.text()).toContain('Conversion unavailable')
    expect(store.nodes.map((node) => node.id)).toEqual(['old-start'])
    expect(recoveryNotice().text()).toContain(i18n.global.t('workflow.saveRecoveryReconciling'))
    expect(store.pendingSaveSubmission?.workflowId).toBe('201')

    await button('reset').trigger('click')
    expect(store.workflowId).toBe('201')
    expect(store.nodes).toHaveLength(0)
    expect(store.pendingSaveSubmission?.workflowId).toBe('201')
    readback.resolve(remote)
    await flushPromises()
    expect(store.dirty).toBe(true)
    expect(store.backendVersion).toBe(6)
    expect(recoveryNotice().text()).toContain(i18n.global.t('workflow.saveRecoveryCommittedWithNewerEdits'))
  })
})
