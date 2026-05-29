import type { FileAsset } from '@/types/file'
import { i18n } from '@/i18n'

import { mockFiles } from '../mock/fileMock'
import { delay } from '../mock/timing'

export const fileApi = {
  listFiles() {
    return delay<FileAsset[]>(mockFiles)
  },
  uploadFile(file: File) {
    return delay<FileAsset>(
      {
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
      },
      420,
    )
  },
}
