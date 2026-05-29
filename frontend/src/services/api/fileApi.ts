import type { FileAsset } from '@/types/file'
import { i18n } from '@/i18n'
import { mapFileAssetViewToAsset, mapFileMetadataToAsset } from '@/api/mappers/fileMapper'
import {
  deleteFile,
  downloadFileBlob,
  getUploadProgress,
  listFiles,
  uploadFile,
  type UploadProgressView,
} from '@/api/modules/file'
import { isApiError, toApiError } from '@/api/client/apiError'
import { runtimeEnv } from '@/config/runtimeEnv'

import { mockFiles } from '../mock/fileMock'
import { delay } from '../mock/timing'

const unavailableStatuses = new Set([0, 404, 502, 503, 504])
const unavailableCodeTokens = ['GATEWAY', 'UNAVAILABLE', 'TIMEOUT', 'NETWORK', 'ECONNREFUSED', 'ECONNABORTED', 'ERR_NETWORK']

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
  const status = apiError.status
  const numericCode = typeof apiError.code === 'number' ? apiError.code : Number(apiError.code)
  const codeText = String(apiError.code ?? '').trim().toUpperCase()
  const codeIndicatesUnavailable =
    (Number.isFinite(numericCode) && unavailableStatuses.has(numericCode)) ||
    unavailableCodeTokens.some((token) => codeText.includes(token))

  if ([400, 401, 403, 409, 422].includes(status ?? 0) || apiError.source === 'auth') {
    return false
  }

  if (apiError.source === 'network') {
    return true
  }

  if (apiError.source !== 'gateway') {
    return status !== undefined && [502, 503, 504].includes(status)
  }

  return (status !== undefined && unavailableStatuses.has(status)) || (status === undefined && codeIndicatesUnavailable)
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
  async listFiles() {
    try {
      const response = await listFiles({ page: 1, pageSize: 100 })
      const items = Array.isArray(response.items) ? response.items : []
      return items.map(mapFileAssetViewToAsset)
    } catch (error) {
      if (!shouldUseMockFallback(error)) {
        throw error
      }

      return delay<FileAsset[]>(mockFiles)
    }
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
