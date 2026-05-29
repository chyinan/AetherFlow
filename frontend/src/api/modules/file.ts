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

export interface FileAssetMetadataView {
  id: number | string
  backendFileId?: number | string
  name?: string
  originalName?: string
  type?: string
  source?: string
  artifactKind?: string
  size?: number | string
  mime?: string
  status?: string
  workflowId?: string
  result?: string
  downloadUrl?: string
  objectKey?: string
  createdAt?: string
  updatedAt?: string
}

export interface FileAssetPageResponse {
  page: number
  pageSize: number
  total: number
  items: FileAssetMetadataView[]
}

export interface ListFilesParams {
  query?: string
  type?: string
  source?: string
  artifactKind?: string
  workflowId?: string
  page?: number
  pageSize?: number
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

export interface ChunkUploadInitRequest {
  originalName: string
  contentType: string
  size: number
  totalParts: number
  checksum?: string
}

export interface ChunkUploadInitResponse {
  uploadId: string
  originalName: string
  contentType?: string
  size?: number
  totalParts: number
  createdAt?: string
}

export interface ChunkUploadPartResponse {
  uploadId: string
  partNumber: number
  size: number
  receivedParts: number
  totalParts: number
  complete: boolean
}

export interface ChunkUploadCompleteRequest {
  checksum?: string
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

export function listFiles(params: ListFilesParams = {}) {
  return apiClient.get<FileAssetPageResponse>('/files', {
    source: 'file',
    params: {
      page: 1,
      pageSize: 100,
      ...params,
    },
  })
}

export function initChunkUpload(payload: ChunkUploadInitRequest) {
  return apiClient.post<ChunkUploadInitResponse>('/files/uploads', payload, {
    source: 'file',
  })
}

export function uploadChunkPart(
  uploadId: string,
  partNumber: number,
  chunk: Blob,
  options: { filename?: string; onUploadProgress?: (progress: FileUploadProgress) => void } = {},
) {
  const formData = new FormData()
  formData.append('file', chunk, options.filename ?? `part-${partNumber}`)

  return apiClient.request<ChunkUploadPartResponse>({
    method: 'PUT',
    url: `/files/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}`,
    data: formData,
    source: 'file',
    headers: {
      'Content-Type': undefined,
    },
    transformRequest: [
      (data, headers) => {
        stripContentType(headers)
        return data
      },
    ],
    onUploadProgress: (event) => {
      const total = event.total ?? chunk.size
      options.onUploadProgress?.({
        loaded: event.loaded,
        total,
        percentage: total ? Math.round((event.loaded / total) * 100) : undefined,
      })
    },
  })
}

export function completeChunkUpload(uploadId: string, payload: ChunkUploadCompleteRequest = {}) {
  return apiClient.post<FileMetadataDTO>(
    `/files/uploads/${encodeURIComponent(uploadId)}/complete`,
    payload,
    { source: 'file' },
  )
}

export function abortChunkUpload(uploadId: string) {
  return apiClient.delete<void>(`/files/uploads/${encodeURIComponent(uploadId)}`, {
    source: 'file',
  })
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
  listFiles,
  uploadFile,
  initChunkUpload,
  uploadChunkPart,
  completeChunkUpload,
  abortChunkUpload,
  getUploadProgress,
  downloadFileBlob,
  deleteFile,
}
