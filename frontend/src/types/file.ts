export interface FileAsset {
  id: string
  name: string
  type: 'audio' | 'video' | 'document' | 'artifact'
  source: 'input' | 'artifact'
  artifactKind?: 'input' | 'audio' | 'transcript' | 'subtitle' | 'summary' | 'document' | 'archive'
  size: string
  mime: string
  status: 'ready' | 'processing' | 'failed'
  linkedRunId?: string
  workflowId?: string
  workflowName?: string
  producerNode?: string
  result?: string
  updatedAt: string
}
