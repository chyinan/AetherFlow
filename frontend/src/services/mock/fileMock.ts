import type { FileAsset } from '@/types/file'

export const mockFiles: FileAsset[] = [
  {
    id: 'file-raw-meeting',
    name: 'quarterly-review.mp4',
    type: 'video',
    size: '428 MB',
    status: 'ready',
    linkedRunId: 'run-20260528-001',
    result: 'Input media for Media Digest Pipeline',
    updatedAt: '2026-05-28 01:22',
  },
  {
    id: 'file-audio-track',
    name: 'audio.wav',
    type: 'audio',
    size: '82 MB',
    status: 'processing',
    linkedRunId: 'run-20260528-001',
    result: 'Extracted by FFmpeg',
    updatedAt: '2026-05-28 01:34',
  },
  {
    id: 'file-summary',
    name: 'summary.md',
    type: 'artifact',
    size: '24 KB',
    status: 'ready',
    linkedRunId: 'run-20260527-018',
    result: 'Meeting summary and action items',
    updatedAt: '2026-05-27 22:17',
  },
]
