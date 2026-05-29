import { i18n } from '@/i18n'
import type { FileMetadataDTO, UploadProgressView } from '@/api/modules/file'
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
