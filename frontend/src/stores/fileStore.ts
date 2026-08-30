import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { toApiError } from '@/api/client/apiError'
import { fileApi } from '@/services/api/fileApi'
import type { FileAsset } from '@/types/file'
import type { WorkflowRun } from '@/types/run'
import { formatDateTime } from '@/utils/localeFormat'

// pattern: Imperative Shell
export const useFileStore = defineStore('file', {
  state: () => ({
    files: [] as FileAsset[],
    loading: false,
    loadError: null as string | null,
    uploading: false,
    uploadProgress: 0,
    uploadError: null as string | null,
    deletingIds: [] as string[],
    downloadingIds: [] as string[],
    fileActionError: null as string | null,
    loadRequestId: 0,
  }),
  getters: {
    inputFiles: (state) => state.files.filter((file) => file.source === 'input'),
    artifactFiles: (state) => state.files.filter((file) => file.source === 'artifact'),
    processingCount: (state) => state.files.filter((file) => file.status === 'processing').length,
    failedCount: (state) => state.files.filter((file) => file.status === 'failed').length,
    readyCount: (state) => state.files.filter((file) => file.status === 'ready').length,
    latestBackendInputFileId: (state) =>
      state.files.find((file) => file.source === 'input' && file.backendFileId && file.status !== 'failed')
        ?.backendFileId,
  },
  actions: {
    async loadFiles() {
      const requestId = ++this.loadRequestId
      const isCurrent = () => this.loadRequestId === requestId
      this.loading = true
      this.loadError = null
      try {
        const loadedFiles = await fileApi.listFiles()
        if (isCurrent()) {
          this.files = loadedFiles
        }
      } catch (error) {
        if (isCurrent()) {
          const normalized = toApiError(error, 'file')
          this.loadError = normalized.status
            ? `HTTP ${normalized.status} · ${normalized.message}`
            : normalized.message || i18n.global.t('files.loadFailed')
        }
        throw error
      } finally {
        if (isCurrent()) {
          this.loading = false
        }
      }
    },
    async refreshArtifactsFromBackend() {
      try {
        await this.loadFiles()
      } catch {
        // Runtime success should stay visible even if a file-list refresh is temporarily unavailable.
      }
    },
    async upload(file: File) {
      this.uploading = true
      this.uploadProgress = 1
      this.uploadError = null
      try {
        const asset = await fileApi.uploadFile(file, {
          onProgress: (percentage) => {
            this.uploadProgress = Math.max(this.uploadProgress, Math.min(100, percentage))
          },
        })
        this.files.unshift(asset)
        this.uploadProgress = 100
        window.setTimeout(() => {
          const uploaded = this.files.find((item) => item.id === asset.id)
          if (uploaded && !uploaded.backendFileId && uploaded.status === 'processing') {
            uploaded.status = 'ready'
            uploaded.result = i18n.global.t('files.mockResults.readyInput')
            uploaded.updatedAt = formatDateTime(new Date())
          }
        }, 900)
        return asset
      } catch (error) {
        this.uploadError = error instanceof Error && error.message
          ? error.message
          : i18n.global.t('files.uploadFailed')
        throw error
      } finally {
        window.setTimeout(() => {
          this.uploading = false
          this.uploadProgress = 0
        }, 420)
      }
    },
    async download(fileId: string) {
      const file = this.files.find((item) => item.id === fileId)
      if (!file) {
        return
      }

      this.fileActionError = null
      this.downloadingIds = [...new Set([...this.downloadingIds, fileId])]
      try {
        if (file.backendFileId) {
          const blob = await fileApi.downloadFile(file.backendFileId)
          const url = URL.createObjectURL(blob)
          triggerBrowserDownload(url, file.name)
          window.setTimeout(() => URL.revokeObjectURL(url), 1000)
          return
        }

        if (file.downloadUrl) {
          triggerBrowserDownload(file.downloadUrl, file.name)
          return
        }

        throw new Error(i18n.global.t('files.downloadUnavailable'))
      } catch (error) {
        this.fileActionError = error instanceof Error && error.message
          ? error.message
          : i18n.global.t('files.downloadFailed')
        throw error
      } finally {
        this.downloadingIds = this.downloadingIds.filter((id) => id !== fileId)
      }
    },
    async deleteAsset(fileId: string) {
      const file = this.files.find((item) => item.id === fileId)
      if (!file) {
        return
      }

      this.fileActionError = null
      this.deletingIds = [...new Set([...this.deletingIds, fileId])]
      try {
        if (file.backendFileId) {
          await fileApi.deleteFile(file.backendFileId)
        }
        this.files = this.files.filter((item) => item.id !== fileId)
      } catch (error) {
        this.fileActionError = error instanceof Error && error.message
          ? error.message
          : i18n.global.t('files.deleteFailed')
        throw error
      } finally {
        this.deletingIds = this.deletingIds.filter((id) => id !== fileId)
      }
    },
    async toggleSource(fileId: string) {
      const file = this.files.find((item) => item.id === fileId)
      if (!file) {
        return
      }
      const previous = { ...file }
      const source = file.source === 'input' ? 'artifact' : 'input'
      const artifactKind = source === 'input' ? 'input' : file.artifactKind === 'input' ? 'document' : file.artifactKind
      file.source = source
      file.artifactKind = artifactKind
      file.result = source === 'input'
        ? i18n.global.t('files.mockResults.markedInput')
        : i18n.global.t('files.mockResults.markedArtifact')
      file.updatedAt = formatDateTime(new Date())
      if (!file.backendFileId) {
        return
      }
      try {
        const persisted = await fileApi.updateClassification(file.backendFileId, {
          source,
          artifactKind,
          workflowId: file.workflowId ?? null,
        })
        Object.assign(file, persisted)
      } catch (error) {
        Object.assign(file, previous)
        this.fileActionError = error instanceof Error && error.message
          ? error.message
          : i18n.global.t('files.updateFailed')
        throw error
      }
    },
    addArtifactsFromRun(run: WorkflowRun) {
      const existingIds = new Set(this.files.map((file) => file.id))
      const createdAt = formatDateTime(new Date())
      const artifacts: FileAsset[] = run.artifactNames.map((name, index) => {
        const kind = name.endsWith('.srt')
          ? 'subtitle'
          : name.endsWith('.md')
            ? 'summary'
            : name.endsWith('.txt') || name.endsWith('.json')
              ? 'transcript'
              : name.endsWith('.wav')
                ? 'audio'
                : 'document'
        return {
          id: `file-${run.id}-${index}`,
          name,
          type: kind === 'audio' ? 'audio' : 'artifact',
          source: 'artifact',
          artifactKind: kind,
          size: kind === 'audio' ? '82 MB' : '24 KB',
          mime: kind === 'audio' ? 'audio/wav' : kind === 'subtitle' ? 'text/srt' : kind === 'summary' ? 'text/markdown' : 'application/json',
          status: run.status === 'success' ? 'ready' : 'processing',
          linkedRunId: run.id,
          workflowId: run.workflowId,
          workflowName: run.workflowName,
          producerNode: index === 0 ? 'FFmpeg' : index === 1 ? 'Whisper' : index === 2 ? 'Translate' : 'Summary',
          result:
            run.status === 'success'
              ? i18n.global.t('files.mockResults.generatedByRun')
              : i18n.global.t('files.mockResults.waitingNode'),
          updatedAt: createdAt,
        }
      })
      this.files = [...artifacts.filter((file) => !existingIds.has(file.id)), ...this.files]
    },
    markRunArtifactsReady(runId: string) {
      const now = formatDateTime(new Date())
      this.files.forEach((file) => {
        if (file.linkedRunId === runId && file.source === 'artifact') {
          file.status = 'ready'
          file.result = i18n.global.t('files.mockResults.generatedByRun')
          file.updatedAt = now
        }
      })
    },
  },
})

function triggerBrowserDownload(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
