import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { FileAssetMetadataView } from '@/api/modules/file'

const api = vi.hoisted(() => ({ listFiles: vi.fn(), updateFileClassification: vi.fn() }))
vi.mock('@/api/modules/file', () => ({
  abortChunkUpload: vi.fn(), completeChunkUpload: vi.fn(), deleteFile: vi.fn(), downloadFileBlob: vi.fn(),
  getUploadProgress: vi.fn(), initChunkUpload: vi.fn(), listFiles: api.listFiles, uploadChunkPart: vi.fn(),
  uploadFile: vi.fn(), updateFileClassification: api.updateFileClassification,
}))

import { useFileStore } from './fileStore'

const exportKey = 'workflow/exports/42/users/7/generated/summary.md'
const generatedArtifact: FileAssetMetadataView = {
  id: 101, backendFileId: '101', name: 'summary.md', type: 'artifact', source: 'artifact', artifactKind: 'summary',
  mime: 'text/markdown', status: 'ready', workflowId: '42', objectKey: exportKey,
}
const reclassifiedInput: FileAssetMetadataView = {
  ...generatedArtifact, type: 'document', source: 'input', artifactKind: 'input',
}

describe('文件 store 的生成导出重新分类', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
  })

  it('切换后立即显示为输入，刷新后仍保持分类并保留来源运行链接', async () => {
    api.updateFileClassification.mockResolvedValue(reclassifiedInput)
    api.listFiles
      .mockResolvedValueOnce({ page: 1, pageSize: 100, total: 1, items: [generatedArtifact] })
      .mockResolvedValue({ page: 1, pageSize: 100, total: 1, items: [reclassifiedInput] })
    const store = useFileStore()
    await store.loadFiles()
    expect(store.artifactFiles).toHaveLength(1)

    await store.toggleSource('101')

    expect(api.updateFileClassification).toHaveBeenCalledWith('101', {
      source: 'input', artifactKind: 'input', workflowId: '42',
    })
    expect(store.inputFiles).toHaveLength(1)
    expect(store.artifactFiles).toHaveLength(0)
    expect(store.inputFiles[0]).toMatchObject({
      source: 'input', type: 'document', artifactKind: 'input', linkedRunId: 'run-42',
    })

    await store.loadFiles()

    expect(store.inputFiles).toHaveLength(1)
    expect(store.artifactFiles).toHaveLength(0)
    expect(store.inputFiles[0]).toMatchObject({
      source: 'input', type: 'document', artifactKind: 'input', linkedRunId: 'run-42',
    })
  })
})
