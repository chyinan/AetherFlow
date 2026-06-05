import { mapWorkflowToDefinitionDTO } from '../src/api/mappers/workflowMapper.ts'

function node(id, kind, config = {}) {
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

function workflow(nodes, edges) {
  return {
    id: 'workflow-branch-routing',
    name: 'Workflow Branch Routing',
    description: '',
    nodes,
    edges,
  }
}

function configFor(definition, nodeId) {
  return definition.nodes.find((item) => item.nodeId === nodeId)?.config
}

const classifierDefinition = mapWorkflowToDefinitionDTO(workflow([
  node('classifier', 'question-classifier', {
    input: 'question',
    class1: 'billing',
    class2: 'support',
  }),
  node('billing-node', 'summary'),
  node('support-node', 'summary'),
], [
  { id: 'edge-classifier-billing', source: 'classifier', target: 'billing-node', label: 'billing' },
  { id: 'edge-classifier-support', source: 'classifier', target: 'support-node', label: 'support' },
]))

const classifierConfig = configFor(classifierDefinition, 'classifier')
if (classifierConfig.input !== undefined) {
  throw new Error('question classifier must store inspector input as inputVariable, not literal input')
}
if (classifierConfig.inputVariable !== 'question') {
  throw new Error(`expected classifier inputVariable question, got ${classifierConfig.inputVariable}`)
}
if (classifierConfig.branches?.billing !== 'billing-node') {
  throw new Error(`expected billing branch to target billing-node, got ${classifierConfig.branches?.billing}`)
}
if (classifierConfig.branches?.support !== 'support-node') {
  throw new Error(`expected support branch to target support-node, got ${classifierConfig.branches?.support}`)
}
if (!Array.isArray(classifierConfig.nextNodes) || classifierConfig.nextNodes.length !== 2) {
  throw new Error('classifier config must retain declared nextNodes for DAG validation')
}

const orderedClassifierDefinition = mapWorkflowToDefinitionDTO(workflow([
  node('ordered-classifier', 'question-classifier', {
    class1: 'sales',
    class2: 'technical',
  }),
  node('sales-node', 'summary'),
  node('technical-node', 'summary'),
], [
  { id: 'edge-ordered-sales', source: 'ordered-classifier', target: 'sales-node' },
  { id: 'edge-ordered-technical', source: 'ordered-classifier', target: 'technical-node' },
]))

const orderedClassifierConfig = configFor(orderedClassifierDefinition, 'ordered-classifier')
if (orderedClassifierConfig.branches?.sales !== 'sales-node') {
  throw new Error(`expected first unlabeled classifier edge to map to sales, got ${orderedClassifierConfig.branches?.sales}`)
}
if (orderedClassifierConfig.branches?.technical !== 'technical-node') {
  throw new Error(`expected second unlabeled classifier edge to map to technical, got ${orderedClassifierConfig.branches?.technical}`)
}

const conditionDefinition = mapWorkflowToDefinitionDTO(workflow([
  node('condition', 'condition', {
    variable: 'score',
    operator: 'GREATER_THAN',
    value: 0.5,
  }),
  node('true-node', 'summary'),
  node('false-node', 'summary'),
], [
  { id: 'edge-condition-true', source: 'condition', target: 'true-node' },
  { id: 'edge-condition-false', source: 'condition', target: 'false-node' },
]))

const conditionConfig = configFor(conditionDefinition, 'condition')
if (conditionConfig.branches?.true !== 'true-node') {
  throw new Error(`expected true condition branch to target true-node, got ${conditionConfig.branches?.true}`)
}
if (conditionConfig.branches?.false !== 'false-node') {
  throw new Error(`expected false condition branch to target false-node, got ${conditionConfig.branches?.false}`)
}
if (conditionConfig.defaultNext !== 'true-node') {
  throw new Error(`expected condition defaultNext true-node, got ${conditionConfig.defaultNext}`)
}

console.log('workflow mapper serializes classifier and condition branch routing')
