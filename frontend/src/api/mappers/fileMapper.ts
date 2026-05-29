import { i18n } from '@/i18n'
import type { FileAssetMetadataView, FileMetadataDTO, UploadProgressView } from '@/api/modules/file'
import type { FileAsset, FileStatus } from '@/types/file'

function formatSize(size: FileMetadataDTO['size']) {
  const numericSize = typeof size === 'number' ? size : Number(size)

  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    return '0 KB'
  }

  if (numericSize >= 1024 * 1024 * 1024) {
    return `${Math.max(1, Math.round(numericSize / 1024 / 1024 / 1024))} GB`
  }

  if (numericSize >= 1024 * 1024) {
    return `${Math.max(1, Math.round(numericSize / 1024 / 1024))} MB`
  }

  return `${Math.max(1, Math.round(numericSize / 1024))} KB`
}

function inferFileType(contentType: string, name: string): FileAsset['type'] {
  const lowerName = name.toLowerCase()

  if (contentType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(lowerName)) {
    return 'audio'
  }

  if (contentType.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm)$/i.test(lowerName)) {
    return 'video'
  }

  return 'document'
}

export function mapUploadStatus(status: UploadProgressView['status']): FileStatus {
  const normalized = String(status ?? '').trim().toUpperCase()

  if (['FAILED', 'ERROR', 'CANCELLED'].includes(normalized)) {
    return 'failed'
  }

  if (['COMPLETED', 'SUCCESS', 'DONE', 'READY'].includes(normalized)) {
    return 'ready'
  }

  return 'processing'
}

export function mapFileMetadataToAsset(
  metadata: FileMetadataDTO,
  progress?: UploadProgressView | null,
): FileAsset {
  const name = metadata.originalName?.trim() || metadata.objectKey?.split('/').pop() || `file-${metadata.id}`
  const mime = metadata.contentType?.trim() || 'application/octet-stream'

  return {
    id: String(metadata.id),
    backendFileId: String(metadata.id),
    uploadTaskId: progress?.taskId,
    name,
    type: inferFileType(mime, name),
    source: 'input',
    artifactKind: 'input',
    size: formatSize(metadata.size),
    mime,
    status: mapUploadStatus(progress?.status ?? 'COMPLETED'),
    workflowId: 'wf-media-digest',
    workflowName: 'Media Digest Pipeline',
    result: progress?.message || i18n.global.t('files.mockResults.readyInput'),
    downloadUrl: metadata.url,
    objectKey: metadata.objectKey,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
}

function normalizeSource(source?: string): FileAsset['source'] {
  return String(source ?? '').trim().toLowerCase() === 'artifact' ? 'artifact' : 'input'
}

function normalizeArtifactKind(kind?: string): FileAsset['artifactKind'] {
  const normalized = String(kind ?? '').trim().toLowerCase()
  if (['input', 'audio', 'transcript', 'subtitle', 'summary', 'document', 'archive'].includes(normalized)) {
    return normalized as FileAsset['artifactKind']
  }

  return 'input'
}

function isWorkflowExportObject(objectKey?: string) {
  return String(objectKey ?? '').trim().toLowerCase().startsWith('workflow/exports/')
}

function inferExportArtifactKind(name: string): FileAsset['artifactKind'] {
  const lowerName = name.toLowerCase()
  if (/\.(md|markdown|txt|json)$/i.test(lowerName)) {
    return 'summary'
  }
  return 'document'
}

function normalizeFileType(type?: string, mime?: string, name?: string): FileAsset['type'] {
  const normalized = String(type ?? '').trim().toLowerCase()
  if (['audio', 'video', 'document', 'artifact'].includes(normalized)) {
    return normalized as FileAsset['type']
  }

  return inferFileType(mime ?? 'application/octet-stream', name ?? '')
}

function formatDateTime(value?: string) {
  if (!value) {
    return new Date().toLocaleString('zh-CN', { hour12: false })
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', { hour12: false })
}

export function mapFileAssetViewToAsset(view: FileAssetMetadataView): FileAsset {
  const id = String(view.id ?? view.backendFileId ?? `file-${Date.now()}`)
  const backendFileId = view.backendFileId ?? view.id
  const name = view.name?.trim() || view.originalName?.trim() || view.objectKey?.split('/').pop() || `file-${id}`
  const mime = view.mime?.trim() || 'application/octet-stream'
  const isExportArtifact = isWorkflowExportObject(view.objectKey)
  const source: FileAsset['source'] = isExportArtifact ? 'artifact' : normalizeSource(view.source)

  return {
    id,
    backendFileId: backendFileId === undefined || backendFileId === null ? undefined : String(backendFileId),
    name,
    type: isExportArtifact ? 'artifact' : normalizeFileType(view.type, mime, name),
    source,
    artifactKind: isExportArtifact ? inferExportArtifactKind(name) : source === 'input' ? 'input' : normalizeArtifactKind(view.artifactKind),
    size: formatSize(view.size),
    mime,
    status: mapUploadStatus(view.status ?? 'READY') as FileStatus,
    workflowId: view.workflowId,
    result: isExportArtifact ? i18n.global.t('files.mockResults.generatedByRun') : view.result || i18n.global.t('files.mockResults.readyInput'),
    downloadUrl: view.downloadUrl,
    objectKey: view.objectKey,
    updatedAt: formatDateTime(view.updatedAt ?? view.createdAt),
  }
}
