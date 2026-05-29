import { defineStore } from 'pinia'
import type { Connection } from '@vue-flow/core'

import { i18n } from '@/i18n'
import { getBackendDefinitionId, workflowApi } from '@/services/api/workflowApi'
import { initialWorkflow, nodeTemplates } from '@/services/mock/workflowMock'
import type { CanvasPosition, NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeStatus } from '@/types/workflow'

function cloneNodes() {
  return structuredClone(initialWorkflow.nodes) as WorkflowGraphNode[]
}

function cloneEdges() {
  return structuredClone(initialWorkflow.edges) as WorkflowGraphEdge[]
}

function serializeNodesWithoutSelection(nodes: WorkflowGraphNode[]) {
  return JSON.stringify(nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  })))
}

let nodeCounter = 10
let edgeCounter = 10

function createNodeFromTemplate(template: NodeTemplate, position: CanvasPosition): WorkflowGraphNode {
  return {
    id: `node-${template.kind}-${nodeCounter++}`,
    type: 'workflow',
    position,
    data: {
      ...template,
      status: 'idle',
      runtime: { lastResult: i18n.global.t('workflow.mockResults.newNode') },
    },
  }
}

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    workflowId: initialWorkflow.id,
    workflowName: initialWorkflow.name,
    backendDefinitionId: getBackendDefinitionId(initialWorkflow.id) ?? initialWorkflow.backendDefinitionId ?? null as number | null,
    templates: nodeTemplates,
    nodes: cloneNodes(),
    edges: cloneEdges(),
    dirty: false,
    saving: false,
    savingError: null as string | null,
    runError: null as string | null,
  }),
  actions: {
    setRunError(message: string | null) {
      this.runError = message
    },
    setNodes(nodes: WorkflowGraphNode[]) {
      const changed = serializeNodesWithoutSelection(nodes) !== serializeNodesWithoutSelection(this.nodes)
      this.nodes = nodes
      if (changed) {
        this.dirty = true
        this.savingError = null
        this.runError = null
      }
    },
    setEdges(edges: WorkflowGraphEdge[]) {
      this.edges = edges
      this.dirty = true
      this.savingError = null
      this.runError = null
    },
    addConnection(connection: Connection) {
      if (!connection.source || !connection.target) {
        return
      }
      this.edges.push({
        ...connection,
        id: `edge-${edgeCounter++}`,
        animated: true,
      })
      this.dirty = true
      this.savingError = null
      this.runError = null
    },
    addNodeFromTemplate(template: NodeTemplate, position: CanvasPosition) {
      const node = createNodeFromTemplate(template, position)
      this.nodes.push(node)
      this.dirty = true
      this.savingError = null
      this.runError = null
      return node
    },
    addNodeAfter(sourceNodeId: string, template: NodeTemplate) {
      const source = this.nodes.find((node) => node.id === sourceNodeId)
      if (!source) {
        return null
      }
      const outgoingCount = this.edges.filter((edge) => edge.source === sourceNodeId).length
      const yOffsets = [0, 150, -150, 300, -300]
      const basePosition = {
        x: source.position.x + 320,
        y: source.position.y + yOffsets[outgoingCount % yOffsets.length] + Math.floor(outgoingCount / yOffsets.length) * 150,
      }
      const position = { ...basePosition }
      while (this.nodes.some((node) => Math.abs(node.position.x - position.x) < 260 && Math.abs(node.position.y - position.y) < 130)) {
        position.y += 150
      }
      const node = createNodeFromTemplate(template, position)
      this.nodes.push(node)
      this.edges.push({
        id: `edge-${edgeCounter++}`,
        source: source.id,
        target: node.id,
        animated: true,
        label: source.data.outputs[0],
      })
      this.dirty = true
      this.savingError = null
      this.runError = null
      return node
    },
    updateNodeStatus(nodeId: string, status: WorkflowNodeStatus, durationMs?: number) {
      const node = this.nodes.find((item) => item.id === nodeId)
      if (node) {
        node.data.status = status
        node.data.runtime = {
          ...node.data.runtime,
          durationMs,
          lastResult: status === 'success' ? 'completed' : status,
        }
      }
    },
    updateNodeConfig(nodeId: string, key: string, value: string | number | boolean) {
      const node = this.nodes.find((item) => item.id === nodeId)
      if (node) {
        node.data.config[key] = value
        node.data.runtime = {
          ...node.data.runtime,
          lastResult: i18n.global.t('workflow.mockResults.configUpdated'),
        }
        this.dirty = true
        this.savingError = null
        this.runError = null
      }
    },
    resetMockWorkflow() {
      this.nodes = cloneNodes()
      this.edges = cloneEdges()
      this.dirty = false
      this.savingError = null
      this.runError = null
    },
    markSaved() {
      this.dirty = false
      this.savingError = null
      this.runError = null
    },
    async loadWorkflow(workflowId: string) {
      const workflow = await workflowApi.getWorkflow(workflowId)
      this.workflowId = workflow.id
      this.workflowName = workflow.name
      this.backendDefinitionId = workflow.backendDefinitionId ?? getBackendDefinitionId(workflow.id) ?? null
      this.nodes = structuredClone(workflow.nodes)
      this.edges = structuredClone(workflow.edges)
      this.dirty = false
      this.savingError = null
      this.runError = null
    },
    async saveCurrentWorkflow(options: { allowMockFallback?: boolean } = {}) {
      this.saving = true
      this.savingError = null
      try {
        const savedWorkflow = await workflowApi.saveWorkflow({
          id: this.workflowId,
          name: this.workflowName,
          backendDefinitionId: this.backendDefinitionId ?? undefined,
          nodes: this.nodes,
          edges: this.edges,
        }, options)
        this.backendDefinitionId = savedWorkflow.backendDefinitionId ?? this.backendDefinitionId ?? null
        this.markSaved()
      } catch (error) {
        const details = error instanceof Error && error.message
          ? error.message
          : i18n.global.t('workflow.saveFailedUnknown')
        this.savingError = `${i18n.global.t('workflow.saveFailed')}: ${details}`
        throw error
      } finally {
        this.saving = false
      }
    },
  },
})
