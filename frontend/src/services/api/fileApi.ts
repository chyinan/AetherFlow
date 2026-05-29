import type { FileAsset } from '@/types/file'
import { i18n } from '@/i18n'
import { mapFileMetadataToAsset } from '@/api/mappers/fileMapper'
import {
  deleteFile,
  downloadFileBlob,
  getUploadProgress,
  uploadFile,
  type UploadProgressView,
} from '@/api/modules/file'
import { isApiError, toApiError } from '@/api/client/apiError'
import { runtimeEnv } from '@/config/runtimeEnv'

import { mockFiles } from '../mock/fileMock'
import { delay } from '../mock/timing'

export interface FileUploadOptions {
  onProgress?: (percentage: number, progress?: UploadProgressView) => void
  taskId?: string
}

function mockUploadedFile(file: File) {
  return {
    id: `file-${Date.now()}`,
    name: file.name,
    type: file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'document',
    source: 'input',
    artifactKind: 'input',
    size: `${Math.max(1, Math.round(file.size / 1024 / 1024))} MB`,
    mime: file.type || 'application/octet-stream',
    status: 'processing',
    workflowId: 'wf-media-digest',
    workflowName: 'Media Digest Pipeline',
    result: i18n.global.t('files.mockResults.queuedInput'),
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  } satisfies FileAsset
}

function shouldUseMockFallback(error: unknown) {
  if (!runtimeEnv.mockFallback) {
    return false
  }

  const apiError = isApiError(error) ? error : toApiError(error, 'file')
  if ([400, 401, 403, 409, 422].includes(apiError.status ?? 0)) {
    return false
  }

  return apiError.retryable || apiError.status === 404 || apiError.status === undefined
}

function createUploadTaskId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function pollUploadProgress(
  taskId: string,
  onProgress?: FileUploadOptions['onProgress'],
) {
  try {
    const progress = await getUploadProgress(taskId)
    if (typeof progress.percentage === 'number') {
      onProgress?.(Math.max(0, Math.min(99, Math.round(progress.percentage))), progress)
    }
    return progress
  } catch {
    return null
  }
}

export const fileApi = {
  listFiles() {
    return delay<FileAsset[]>(mockFiles)
  },
  async uploadFile(file: File, options: FileUploadOptions = {}) {
    let lastProgress: UploadProgressView | null = null
    let polling = true
    let progressTimer: number | null = null

    const taskId = options.taskId ?? createUploadTaskId()
    const startPolling = (activeTaskId: string) => {
      progressTimer = window.setInterval(async () => {
        if (!polling) {
          return
        }

        lastProgress = await pollUploadProgress(activeTaskId, options.onProgress)
      }, 800)
    }

    try {
      startPolling(taskId)

      const uploaded = await uploadFile(file, {
        taskId,
        onUploadProgress: (progress) => {
          if (typeof progress.percentage === 'number') {
            options.onProgress?.(Math.max(1, Math.min(96, progress.percentage)), lastProgress ?? undefined)
          }
        },
      })

      lastProgress = await pollUploadProgress(uploaded.taskId, options.onProgress)
      options.onProgress?.(100, lastProgress ?? undefined)
      return mapFileMetadataToAsset(uploaded.metadata, lastProgress ?? { taskId: uploaded.taskId, status: 'COMPLETED', percentage: 100 })
    } catch (error) {
      if (!shouldUseMockFallback(error)) {
        throw error
      }

      options.onProgress?.(100)
      return delay<FileAsset>(mockUploadedFile(file), 420)
    } finally {
      polling = false
      if (progressTimer !== null) {
        window.clearInterval(progressTimer)
      }
    }
  },
  downloadFile(id: string) {
    return downloadFileBlob(id)
  },
  deleteFile(id: string) {
    return deleteFile(id)
  },
}
