import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const storePath = join(root, 'src/stores/workflowStore.ts')
const clonePath = join(root, 'src/utils/workflowNodeClone.ts')
const placementPath = join(root, 'src/utils/workflowNodePlacement.ts')
const storeSource = readFileSync(storePath, 'utf8')

const failures = []

if (!storeSource.includes("from '@/utils/workflowNodePlacement'")) {
  failures.push('workflowStore must import duplicate placement from workflowNodePlacement')
}

if (!storeSource.includes("from '@/utils/workflowNodeClone'")) {
  failures.push('workflowStore must import duplicate construction from workflowNodeClone')
}

if (!/position:\s*findDuplicateNodePosition\(source,\s*this\.nodes\)/.test(storeSource)) {
  failures.push('duplicateNode must use findDuplicateNodePosition(source, this.nodes)')
}

if (/structuredClone\(source\)/.test(storeSource)) {
  failures.push('duplicateNode must not structuredClone the whole source node')
}

if (!/duplicateWorkflowNode\(/.test(storeSource)) {
  failures.push('duplicateNode must use duplicateWorkflowNode to avoid Vue Flow runtime fields')
}

if (!existsSync(clonePath)) {
  failures.push('workflowNodeClone.ts is missing')
}

if (!existsSync(placementPath)) {
  failures.push('workflowNodePlacement.ts is missing')
}

if (failures.length === 0) {
  const { duplicateWorkflowNode } = await import(pathToFileURL(clonePath).href)
  const { findDuplicateNodePosition } = await import(pathToFileURL(placementPath).href)
  const source = {
    id: 'source',
    type: 'workflow',
    position: { x: 100, y: 100 },
    data: {
      label: 'Source',
      description: 'Source node',
      kind: 'ffmpeg',
      config: { fileIdVariable: 'fileId' },
      inputs: ['fileId'],
      outputs: ['fileUrl'],
      status: 'success',
      runtime: {
        lastResult: 'completed',
        debugWindowRef: globalThis,
      },
    },
    domNode: globalThis,
  }

  const emptyPosition = findDuplicateNodePosition(source, [source])
  if (emptyPosition.x !== 420 || emptyPosition.y !== 100) {
    failures.push(`expected empty-space duplicate at (420, 100), got (${emptyPosition.x}, ${emptyPosition.y})`)
  }

  const occupied = { id: 'occupied', position: { x: 420, y: 100 } }
  const occupiedPosition = findDuplicateNodePosition(source, [source, occupied])
  const collidesWithOccupied = Math.abs(occupied.position.x - occupiedPosition.x) < 260
    && Math.abs(occupied.position.y - occupiedPosition.y) < 130
  if (collidesWithOccupied) {
    failures.push(`duplicate position collides with occupied node: (${occupiedPosition.x}, ${occupiedPosition.y})`)
  }

  if (emptyPosition.x === source.position.x && emptyPosition.y === source.position.y + 170) {
    failures.push('duplicate position must not be the old vertical-only offset')
  }

  let duplicated
  try {
    duplicated = duplicateWorkflowNode(source, {
      id: 'source-copy',
      position: emptyPosition,
      lastResult: 'new node',
    })
  } catch (error) {
    failures.push(`duplicateWorkflowNode must ignore non-cloneable data internals: ${error.message}`)
  }
  if (!duplicated) {
    duplicated = {
      id: '',
      position: null,
      data: {},
    }
  }
  if (duplicated.id !== 'source-copy') {
    failures.push(`expected duplicated node id source-copy, got ${duplicated.id}`)
  }
  if ('domNode' in duplicated) {
    failures.push('duplicated workflow node leaked Vue Flow runtime domNode field')
  }
  if (duplicated.position !== emptyPosition) {
    failures.push('duplicated workflow node must use provided blank-space position')
  }
  if (duplicated.data.status !== 'idle') {
    failures.push(`expected duplicated data status idle, got ${duplicated.data.status}`)
  }
  if (duplicated.data.runtime?.lastResult !== 'new node') {
    failures.push(`expected duplicated runtime lastResult new node, got ${duplicated.data.runtime?.lastResult}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('workflow duplicate placement uses adjacent blank space and ignores Vue Flow runtime fields')
