export type SurfaceStatus = 'ready' | 'running' | 'warning' | 'disabled'

export interface KnowledgeDataset {
  id: string
  name: string
  description: string
  status: SurfaceStatus
  documentCount: number
  processingDocumentCount: number
  chunkCount: number
  failedChunkCount: number
  hitRate: number
  embeddingModel: string
  retrievalMode: string
  owner: string
  updatedAt: string
  tags: string[]
}

export interface KnowledgeSegment {
  id: string
  datasetId: string
  documentId?: string
  source: string
  preview: string
  tokens: number
  score: number
  status: SurfaceStatus
}

export interface KnowledgeDocument {
  id: string
  datasetId: string
  name: string
  sourceType: string
  mode: string
  chars: number
  chunkCount: number
  recallCount: number
  uploadedAt: string
  status: SurfaceStatus
}

export interface MonitorMetric {
  id: string
  label: string
  value: string
  delta: string
  tone: 'online' | 'degraded' | 'offline'
}

export interface ConversationLog {
  id: string
  time: string
  app: string
  user: string
  channel: 'web' | 'api' | 'console'
  intent: string
  status: 'success' | 'failed' | 'running'
  tokens: number
  cost: string
  feedback: 'like' | 'dislike' | 'none'
  reviewRequired: boolean
  reviewReason?: string
  latencyMs: number
}
