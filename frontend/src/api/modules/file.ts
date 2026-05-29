import type { AxiosRequestHeaders } from 'axios'

import { apiClient } from '@/api/client/apiClient'

export interface FileMetadataDTO {
  id: number | string
  bucket?: string
  objectKey?: string
  originalName?: string
  contentType?: string
  size?: number | string
  url?: string
}

export type UploadProgressStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'SUCCESS'
  | 'FAILED'
  | 'ERROR'
  | 'CANCELLED'
  | string

export interface UploadProgressView {
  taskId?: string
  fileId?: number | string
  status?: UploadProgressStatus
  percentage?: number
  message?: string
  hash?: string
  userId?: number | string
}

export interface FileUploadProgress {
  loaded: number
  total?: number
  percentage?: number
}

export interface UploadFileOptions {
  taskId?: string
  onUploadProgress?: (progress: FileUploadProgress) => void
}

export interface UploadFileResult {
  metadata: FileMetadataDTO
  taskId: string
}

function createUploadTaskId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function stripContentType(headers: AxiosRequestHeaders | undefined) {
  if (!headers) {
    return
  }

  const removableHeaders = headers as AxiosRequestHeaders & {
    delete?: (name: string) => void
  }

  if (typeof removableHeaders.delete === 'function') {
    removableHeaders.delete('Content-Type')
    removableHeaders.delete('content-type')
    return
  }

  delete (headers as Record<string, unknown>)['Content-Type']
  delete (headers as Record<string, unknown>)['content-type']
}

export async function uploadFile(
  file: File,
  options: UploadFileOptions = {},
): Promise<UploadFileResult> {
  const formData = new FormData()
  const taskId = options.taskId ?? createUploadTaskId()

  formData.append('file', file)

  const metadata = await apiClient.request<FileMetadataDTO>({
    method: 'POST',
    url: '/files/upload',
    data: formData,
    source: 'file',
    headers: {
      'X-Upload-Task-Id': taskId,
      'Content-Type': undefined,
    },
    transformRequest: [
      (data, headers) => {
        stripContentType(headers)
        return data
      },
    ],
    onUploadProgress: (event) => {
      const total = event.total ?? undefined
      options.onUploadProgress?.({
        loaded: event.loaded,
        total,
        percentage: total ? Math.round((event.loaded / total) * 100) : undefined,
      })
    },
  })

  return {
    metadata,
    taskId,
  }
}

export function getUploadProgress(taskId: string) {
  return apiClient.get<UploadProgressView>(`/files/progress/${encodeURIComponent(taskId)}`, {
    source: 'file',
  })
}

export function downloadFileBlob(id: number | string) {
  return apiClient.request<Blob>({
    method: 'GET',
    url: `/files/${encodeURIComponent(String(id))}/download`,
    responseType: 'blob',
    source: 'file',
  })
}

export function deleteFile(id: number | string) {
  return apiClient.delete<void>(`/files/${encodeURIComponent(String(id))}`, {
    source: 'file',
  })
}

export const fileModuleApi = {
  uploadFile,
  getUploadProgress,
  downloadFileBlob,
  deleteFile,
}
