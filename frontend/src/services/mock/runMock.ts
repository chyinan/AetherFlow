import type { RunLogEntry, WorkflowRun } from '@/types/run'

export const mockRuns: WorkflowRun[] = [
  {
    id: 'run-20260528-001',
    workflowId: 'wf-media-digest',
    workflowName: 'Media Digest Pipeline',
    status: 'running',
    startedAt: '2026-05-28 01:34',
    durationMs: 12640,
    artifactCount: 2,
    nodeStates: [
      { nodeId: 'node-ffmpeg', label: 'FFmpeg', status: 'success', durationMs: 1420 },
      { nodeId: 'node-whisper', label: 'Whisper', status: 'running', durationMs: 8200 },
      { nodeId: 'node-translate', label: 'Translate', status: 'queued' },
      { nodeId: 'node-summary', label: 'Summary', status: 'idle' },
    ],
  },
  {
    id: 'run-20260527-018',
    workflowId: 'wf-media-digest',
    workflowName: 'Media Digest Pipeline',
    status: 'success',
    startedAt: '2026-05-27 22:16',
    durationMs: 44210,
    artifactCount: 4,
    nodeStates: [
      { nodeId: 'node-ffmpeg', label: 'FFmpeg', status: 'success', durationMs: 2190 },
      { nodeId: 'node-whisper', label: 'Whisper', status: 'success', durationMs: 30110 },
      { nodeId: 'node-translate', label: 'Translate', status: 'success', durationMs: 6210 },
      { nodeId: 'node-summary', label: 'Summary', status: 'success', durationMs: 5700 },
    ],
  },
  {
    id: 'run-20260527-011',
    workflowId: 'wf-media-digest',
    workflowName: 'Media Digest Pipeline',
    status: 'failed',
    startedAt: '2026-05-27 19:08',
    durationMs: 18300,
    artifactCount: 1,
    nodeStates: [
      { nodeId: 'node-ffmpeg', label: 'FFmpeg', status: 'success', durationMs: 1800 },
      { nodeId: 'node-whisper', label: 'Whisper', status: 'failed', durationMs: 16500 },
      { nodeId: 'node-translate', label: 'Translate', status: 'skipped' },
      { nodeId: 'node-summary', label: 'Summary', status: 'skipped' },
    ],
  },
]

export const mockLogs: RunLogEntry[] = [
  {
    id: 'log-1',
    time: '01:34:04',
    level: 'info',
    nodeId: 'node-ffmpeg',
    message: 'FFmpeg extracted audio stream to audio.wav.',
  },
  {
    id: 'log-2',
    time: '01:34:06',
    level: 'info',
    nodeId: 'node-whisper',
    message: 'Whisper runtime accepted audio.wav, language auto detection enabled.',
  },
  {
    id: 'log-3',
    time: '01:34:12',
    level: 'debug',
    nodeId: 'node-whisper',
    message: 'Segment 4/8 transcribed; partial transcript appended.',
  },
]
