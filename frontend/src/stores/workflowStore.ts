import { defineStore } from 'pinia'
import type { Connection } from '@vue-flow/core'

import { initialWorkflow, nodeTemplates } from '@/services/mock/workflowMock'
import type { CanvasPosition, NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeStatus } from '@/types/workflow'

function cloneNodes() {
  return structuredClone(initialWorkflow.nodes) as WorkflowGraphNode[]
}

function cloneEdges() {
  return structuredClone(initialWorkflow.edges) as WorkflowGraphEdge[]
}

let nodeCounter = 10
let edgeCounter = 10

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    workflowId: initialWorkflow.id,
    workflowName: initialWorkflow.name,
    templates: nodeTemplates,
    nodes: cloneNodes(),
    edges: cloneEdges(),
    dirty: false,
    saving: false,
  }),
  actions: {
    setNodes(nodes: WorkflowGraphNode[]) {
      this.nodes = nodes
      this.dirty = true
    },
    setEdges(edges: WorkflowGraphEdge[]) {
      this.edges = edges
      this.dirty = true
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
    },
    addNodeFromTemplate(template: NodeTemplate, position: CanvasPosition) {
      const node: WorkflowGraphNode = {
        id: `node-${template.kind}-${nodeCounter++}`,
        type: 'workflow',
        position,
        data: {
          ...template,
          status: 'idle',
          runtime: { lastResult: 'new node' },
        },
      }
      this.nodes.push(node)
      this.dirty = true
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
        this.dirty = true
      }
    },
    resetMockWorkflow() {
      this.nodes = cloneNodes()
      this.edges = cloneEdges()
      this.dirty = false
    },
    markSaved() {
      this.dirty = false
    },
  },
})
