export type FileStatus = 'ready' | 'processing' | 'failed'

export interface FileAsset {
  id: string
  backendFileId?: string
  uploadTaskId?: string
  name: string
  type: 'audio' | 'video' | 'document' | 'artifact'
  source: 'input' | 'artifact'
  artifactKind?: 'input' | 'audio' | 'transcript' | 'subtitle' | 'summary' | 'document' | 'archive'
  size: string
  mime: string
  status: FileStatus
  linkedRunId?: string
  workflowId?: string
  workflowName?: string
  producerNode?: string
  result?: string
  downloadUrl?: string
  objectKey?: string
  updatedAt: string
}
