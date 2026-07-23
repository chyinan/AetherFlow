import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'

import { mapWorkflowToDefinitionDTO } from '../src/api/mappers/workflowMapper.ts'

const workflowApiSource = readFileSync(new URL('../src/services/api/workflowApi.ts', import.meta.url), 'utf8')
const workflowStoreSource = readFileSync(new URL('../src/stores/workflowStore.ts', import.meta.url), 'utf8')
const workflowPageSource = readFileSync(new URL('../src/pages/workflows/WorkflowPage.vue', import.meta.url), 'utf8')
const nodeInspectorSource = readFileSync(new URL('../src/components/workflow/NodeInspector.vue', import.meta.url), 'utf8')
const workflowCanvasSource = readFileSync(new URL('../src/components/workflow/WorkflowCanvas.vue', import.meta.url), 'utf8')
const workflowNodeSource = readFileSync(new URL('../src/components/workflow/WorkflowNode.vue', import.meta.url), 'utf8')
const workflowMockSource = readFileSync(new URL('../src/services/mock/workflowMock.ts', import.meta.url), 'utf8')
const failures = []

function expectSource(source, fragment, message) {
  if (!source.includes(fragment)) {
    failures.push(message)
  }
}

function rejectSource(source, fragment, message) {
  if (source.includes(fragment)) {
    failures.push(message)
  }
}

expectSource(
  workflowApiSource,
  'throw lastError ?? new Error(',
  'existing workflow load failures must throw instead of returning an empty graph',
)
rejectSource(
  workflowApiSource,
  "return emptyWorkflow(workflowId, workflowId.replace(/^wf-/",
  'existing workflow load failures must not fall back to an empty workflow',
)
expectSource(workflowApiSource, "CODE: 'code'", 'saved code nodes must reload as code nodes')
expectSource(
  workflowApiSource,
  "TEMPLATE_TRANSFORM: 'template-transform'",
  'saved template transform nodes must reload as template transform nodes',
)
expectSource(
  workflowApiSource,
  'workflow definition graph is invalid',
  'invalid saved workflow graphs must report an error instead of becoming empty graphs',
)

expectSource(workflowStoreSource, 'loading: false', 'workflow store must expose loading state')
expectSource(
  workflowStoreSource,
  'loadingError: null as string | null',
  'workflow store must expose loading error state',
)
expectSource(
  workflowStoreSource,
  'async loadWorkflow(workflowId: string',
  'workflow store must keep the route workflow load action',
)
expectSource(
  workflowStoreSource,
  'branchLabelForConnection',
  'condition connections must receive stable true and false branch labels',
)
expectSource(
  workflowStoreSource,
  'editRevision: 0',
  'workflow store must track edits made while a save request is in flight',
)
expectSource(
  workflowStoreSource,
  'resetToEmptyWorkflow()',
  'workflow store must fully reset stale workflow identity and loading errors',
)
expectSource(
  workflowStoreSource,
  'clearCurrentWorkflow()',
  'toolbar clearing must remain an unsaved edit instead of pretending to be saved',
)

expectSource(workflowPageSource, 'retryLoadWorkflow', 'workflow page must expose an explicit retry action')
expectSource(workflowPageSource, 'workflowStore.loadingError', 'workflow page must render the workflow loading error')
expectSource(workflowPageSource, 'onBeforeRouteLeave', 'workflow page must guard in-app navigation with unsaved changes')
expectSource(
  workflowPageSource,
  'onBeforeRouteUpdate',
  'workflow page must guard switching workflow ids inside the same route component',
)
expectSource(workflowPageSource, "'beforeunload'", 'workflow page must guard refresh and tab closing')
expectSource(
  workflowPageSource,
  'workflowStore.clearCurrentWorkflow()',
  'workflow toolbar reset must use the dirty-preserving clear action',
)

for (const field of ['variable', 'operator', 'value', 'trueBranch', 'falseBranch']) {
  expectSource(
    nodeInspectorSource,
    `handleTextInput('${field}', $event)`,
    `condition inspector must bind backend field ${field}`,
  )
}
expectSource(
  nodeInspectorSource,
  "handleTextInput('language', $event)",
  'code inspector must bind the language field',
)
expectSource(
  nodeInspectorSource,
  "handleTextInput('outputVariable', $event)",
  'code and template inspectors must bind the outputVariable field',
)
rejectSource(
  nodeInspectorSource,
  "v-for=\"branch in ['if', 'elif']\"",
  'condition inspector must not present unsupported IF/ELIF rule groups',
)
rejectSource(
  nodeInspectorSource,
  "v-for=\"arg in ['arg1', 'arg2']\"",
  'code inspector must not present unbound argument rows',
)
rejectSource(
  nodeInspectorSource,
  'const canRunNode',
  'node inspector must not expose a non-functional single-node run control',
)
rejectSource(
  nodeInspectorSource,
  "handleTextInput('description', $event)",
  'node inspector must not expose a description field that the backend mapper discards',
)
rejectSource(workflowNodeSource, 'testNode:', 'workflow node cards must not expose a fake single-node run event')
rejectSource(
  workflowCanvasSource,
  "workflowStore.updateNodeStatus(nodeId, 'running')",
  'workflow canvas must not simulate node execution with a timer',
)
rejectSource(
  workflowNodeSource,
  "t('workflow.nodeCard.caseElif'",
  'condition node cards must not display unsupported IF/ELIF rows',
)
expectSource(
  workflowMockSource,
  "outputVariable: 'codeResult'",
  'new code nodes must initialize the output variable that is persisted to the backend',
)
expectSource(
  workflowMockSource,
  "outputVariable: 'renderedText'",
  'new template nodes must initialize the output variable that is persisted to the backend',
)
rejectSource(
  workflowMockSource,
  "engine: 'jinja2'",
  'template node defaults must not claim unsupported Jinja2 engine behavior',
)

if (failures.length > 0) {
  throw new Error(`workflow editor P0 contract failures:\n- ${failures.join('\n- ')}`)
}

function workflowNode(id, kind, config = {}) {
  return {
    id,
    type: 'workflow',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      description: id,
      kind,
      config,
      inputs: [],
      outputs: [],
      status: 'idle',
    },
  }
}

function nodeConfig(definition, nodeId) {
  return definition.nodes.find((node) => node.nodeId === nodeId)?.config
}

const mappedDefinition = mapWorkflowToDefinitionDTO({
  id: 'p0-contract',
  name: 'P0 contract',
  nodes: [
    workflowNode('condition', 'condition', {
      variable: 'status',
      operator: 'EQUALS',
      value: 'READY',
      trueBranch: 'ready',
      falseBranch: 'blocked',
    }),
    workflowNode('code', 'code', {
      language: 'python3',
      code: 'def main(): return "ok"',
      outputVariable: 'codeOutput',
      timeoutSec: 30,
      args: ['fake'],
    }),
    workflowNode('template', 'template-transform', {
      template: 'Hello {{ name }}',
      outputVariable: 'greeting',
      engine: 'jinja2',
      arg1: 'fake',
    }),
  ],
  edges: [],
})

assert.deepEqual(
  Object.fromEntries(Object.entries(nodeConfig(mappedDefinition, 'condition')).filter(([key]) => !['nextNodes'].includes(key))),
  {
    variable: 'status',
    operator: 'EQUALS',
    value: 'READY',
    trueBranch: 'ready',
    falseBranch: 'blocked',
  },
)
assert.deepEqual(nodeConfig(mappedDefinition, 'code'), {
  language: 'python3',
  code: 'def main(): return "ok"',
  outputVariable: 'codeOutput',
  nextNodes: [],
})
assert.deepEqual(nodeConfig(mappedDefinition, 'template'), {
  template: 'Hello {{ name }}',
  outputVariable: 'greeting',
  nextNodes: [],
})

function backendEntity(definitionJson) {
  return {
    id: 123,
    name: 'Backend workflow',
    description: '',
    status: 'DRAFT',
    definitionJson,
    updatedAt: '2026-07-17T00:00:00Z',
  }
}

async function checkRuntimeContracts() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })

  try {
    setActivePinia(createPinia())
    const { useWorkflowStore } = await vite.ssrLoadModule('/src/stores/workflowStore.ts')
    const { workflowApi } = await vite.ssrLoadModule('/src/services/api/workflowApi.ts')
    const { apiClient } = await vite.ssrLoadModule('/src/api/client/apiClient.ts')
    const store = useWorkflowStore()
    const originalGetWorkflow = workflowApi.getWorkflow
    const originalSaveWorkflow = workflowApi.saveWorkflow
    const originalApiGet = apiClient.get

    try {
      const before = {
        workflowId: 'keep-id',
        workflowName: 'Keep name',
        backendDefinitionId: 77,
        nodes: [{ id: 'keep-node' }],
        edges: [{ id: 'keep-edge', source: 'a', target: 'b' }],
        dirty: true,
      }
      Object.assign(store, { ...before, loadingError: 'old error' })

      let rejectLoad
      workflowApi.getWorkflow = () => new Promise((_, reject) => {
        rejectLoad = reject
      })
      const pending = store.loadWorkflow('wf-123')
      assert.equal(store.loading, true)
      assert.equal(store.loadingError, null)
      rejectLoad(new Error('backend down'))
      assert.equal(await pending, false)
      assert.equal(store.workflowId, before.workflowId)
      assert.equal(store.workflowName, before.workflowName)
      assert.equal(store.backendDefinitionId, before.backendDefinitionId)
      assert.deepEqual(store.nodes, before.nodes)
      assert.deepEqual(store.edges, before.edges)
      assert.equal(store.dirty, true)
      assert.equal(store.loading, false)
      assert.match(store.loadingError, /backend down/)

      Object.assign(store, {
        workflowId: 'atomic-id',
        workflowName: 'Atomic workflow',
        backendDefinitionId: 88,
        nodes: [workflowNode('atomic-node', 'summary')],
        edges: [],
        dirty: false,
      })
      workflowApi.getWorkflow = async () => ({
        id: 'broken-id',
        name: 'Broken workflow',
        backendDefinitionId: 99,
        nodes: [{ ...workflowNode('broken-node', 'summary'), nonCloneable: () => 'nope' }],
        edges: [],
      })
      assert.equal(await store.loadWorkflow('broken-id'), false)
      assert.equal(store.workflowId, 'atomic-id')
      assert.equal(store.workflowName, 'Atomic workflow')
      assert.equal(store.backendDefinitionId, 88)
      assert.equal(store.nodes[0].id, 'atomic-node')

      store.resetToEmptyWorkflow()
      assert.equal(store.workflowId, 'new')
      assert.equal(store.backendDefinitionId, null)
      assert.equal(store.loadingError, null)
      assert.deepEqual(store.nodes, [])
      assert.deepEqual(store.edges, [])
      assert.equal(store.dirty, false)

      Object.assign(store, {
        workflowId: '55',
        workflowName: 'Editing workflow',
        backendDefinitionId: 55,
        nodes: [workflowNode('editable', 'summary', { prompt: 'old' })],
        edges: [],
        dirty: true,
      })
      let resolveSave
      workflowApi.saveWorkflow = () => new Promise((resolve) => {
        resolveSave = resolve
      })
      const pendingSave = store.saveCurrentWorkflow()
      store.updateNodeConfig('editable', 'prompt', 'new')
      resolveSave({
        id: '55',
        name: 'Editing workflow',
        backendDefinitionId: 55,
        nodes: [],
        edges: [],
      })
      await pendingSave
      assert.equal(store.dirty, true, 'edits made during save must remain unsaved')

      workflowApi.getWorkflow = originalGetWorkflow
      let invalidIdRequestCount = 0
      apiClient.get = async () => {
        invalidIdRequestCount += 1
        throw new Error('must not request an ambiguous workflow id')
      }
      await assert.rejects(() => workflowApi.getWorkflow('draft-abc123'), /workflow definition id is invalid/)
      assert.equal(invalidIdRequestCount, 0)

      apiClient.get = async () => backendEntity('{invalid json')
      await assert.rejects(() => workflowApi.getWorkflow('123'), /workflow definition graph is invalid/)

      apiClient.get = async () => backendEntity(JSON.stringify({
        nodes: [{ nodeId: 'unknown', nodeType: 'UNKNOWN_NODE', config: {} }],
      }))
      await assert.rejects(() => workflowApi.getWorkflow('123'), /unsupported workflow node type/)

      apiClient.get = async () => backendEntity(JSON.stringify({
        nodes: [
          {
            nodeId: 'condition',
            nodeType: 'CONDITION',
            config: {
              variable: 'status',
              operator: 'EQUALS',
              value: 'READY',
              trueBranch: 'ready',
              falseBranch: 'blocked',
              nextNodes: ['false-node', 'true-node'],
              branches: { ready: 'true-node', blocked: 'false-node' },
            },
          },
          { nodeId: 'code', nodeType: 'CODE', config: { language: 'python3', code: 'pass', outputVariable: 'codeOutput' } },
          { nodeId: 'template', nodeType: 'TEMPLATE_TRANSFORM', config: { template: '{{ name }}', outputVariable: 'greeting' } },
          { nodeId: 'true-node', nodeType: 'END', config: {} },
          { nodeId: 'false-node', nodeType: 'END', config: {} },
        ],
      }))
      const loaded = await workflowApi.getWorkflow('123')
      assert.equal(loaded.nodes.find((node) => node.id === 'code')?.data.kind, 'code')
      assert.equal(loaded.nodes.find((node) => node.id === 'template')?.data.kind, 'template-transform')
      assert.equal(loaded.edges.find((edge) => edge.target === 'true-node')?.label, 'ready')
      assert.equal(loaded.edges.find((edge) => edge.target === 'false-node')?.label, 'blocked')

      const remapped = mapWorkflowToDefinitionDTO(loaded)
      assert.deepEqual(nodeConfig(remapped, 'condition').branches, {
        ready: 'true-node',
        blocked: 'false-node',
      })
    } finally {
      workflowApi.getWorkflow = originalGetWorkflow
      workflowApi.saveWorkflow = originalSaveWorkflow
      apiClient.get = originalApiGet
    }
  } finally {
    await vite.close()
  }
}

await checkRuntimeContracts()

console.log('workflow editor P0 loading, inspector, and unsaved-change contracts are enforced')
