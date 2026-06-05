interface PositionedWorkflowNode {
  position: {
    x: number
    y: number
  }
}

const NODE_COLLISION_X_DISTANCE = 260
const NODE_COLLISION_Y_DISTANCE = 130
const DUPLICATE_X_OFFSET = 320
const DUPLICATE_Y_OFFSET = 170

function positionCollidesWithNode(position: PositionedWorkflowNode['position'], node: PositionedWorkflowNode) {
  return Math.abs(node.position.x - position.x) < NODE_COLLISION_X_DISTANCE
    && Math.abs(node.position.y - position.y) < NODE_COLLISION_Y_DISTANCE
}

function positionIsAvailable(position: PositionedWorkflowNode['position'], nodes: PositionedWorkflowNode[]) {
  return !nodes.some((node) => positionCollidesWithNode(position, node))
}

export function findDuplicateNodePosition(source: PositionedWorkflowNode, nodes: PositionedWorkflowNode[]) {
  const rightX = source.position.x + DUPLICATE_X_OFFSET
  const fartherRightX = rightX + DUPLICATE_X_OFFSET
  const candidates = [
    { x: rightX, y: source.position.y },
    { x: rightX, y: source.position.y + DUPLICATE_Y_OFFSET },
    { x: rightX, y: source.position.y - DUPLICATE_Y_OFFSET },
    { x: fartherRightX, y: source.position.y },
    { x: fartherRightX, y: source.position.y + DUPLICATE_Y_OFFSET },
    { x: fartherRightX, y: source.position.y - DUPLICATE_Y_OFFSET },
    { x: source.position.x, y: source.position.y + DUPLICATE_Y_OFFSET },
  ]

  const availableCandidate = candidates.find((position) => positionIsAvailable(position, nodes))
  if (availableCandidate) {
    return availableCandidate
  }

  const fallbackPosition = {
    x: rightX,
    y: source.position.y + DUPLICATE_Y_OFFSET * 2,
  }
  while (!positionIsAvailable(fallbackPosition, nodes)) {
    fallbackPosition.y += DUPLICATE_Y_OFFSET
  }
  return fallbackPosition
}
