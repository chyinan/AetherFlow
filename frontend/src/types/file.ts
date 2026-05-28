export interface FileAsset {
  id: string
  name: string
  type: 'audio' | 'video' | 'document' | 'artifact'
  size: string
  status: 'ready' | 'processing' | 'failed'
  linkedRunId?: string
  result?: string
  updatedAt: string
}
