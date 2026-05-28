import type { FileAsset } from '@/types/file'

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
        size: `${Math.max(1, Math.round(file.size / 1024 / 1024))} MB`,
        status: 'processing',
        result: 'Queued for workflow input mapping',
        updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      },
      420,
    )
  },
}
