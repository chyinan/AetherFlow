import type { NodeTemplate, WorkflowDefinition, WorkflowSummary } from '@/types/workflow'

export const nodeTemplates: NodeTemplate[] = [
  {
    kind: 'whisper',
    label: 'Whisper',
    description: 'Audio transcription and subtitle extraction.',
    category: 'Input',
    config: { language: 'auto', outputFormat: 'srt' },
    inputs: ['media.file'],
    outputs: ['transcript.text', 'subtitle.srt'],
  },
  {
    kind: 'llm',
    label: 'LLM',
    description: 'Reasoning, extraction, and structured generation.',
    category: 'AI',
    config: { model: 'aether-runtime/mock-gpt', temperature: 0.3, maxTokens: 1200 },
    inputs: ['prompt.text', 'context.text'],
    outputs: ['completion.text', 'json.data'],
  },
  {
    kind: 'ffmpeg',
    label: 'FFmpeg',
    description: 'Transcode, extract audio, or cut media segments.',
    category: 'Media',
    config: { operation: 'extract-audio', outputFormat: 'wav' },
    inputs: ['media.file'],
    outputs: ['audio.wav', 'frames.zip'],
  },
  {
    kind: 'translate',
    label: 'Translate',
    description: 'Translate transcript or generated text.',
    category: 'Transform',
    config: { sourceLanguage: 'auto', targetLanguage: 'en-US' },
    inputs: ['source.text'],
    outputs: ['translated.text'],
  },
  {
    kind: 'summary',
    label: 'Summary',
    description: 'Create meeting notes, briefs, and action items.',
    category: 'Output',
    config: { length: 'medium', style: 'operator-brief', structured: true },
    inputs: ['content.text'],
    outputs: ['summary.md', 'actions.json'],
  },
]

export const workflowSummaries: WorkflowSummary[] = [
  {
    id: 'wf-media-digest',
    name: 'Media Digest Pipeline',
    updatedAt: '2026-05-28 01:30',
    status: 'ready',
  },
]

export const initialWorkflow: WorkflowDefinition = {
  id: 'wf-media-digest',
  name: 'Media Digest Pipeline',
  nodes: [
    {
      id: 'node-ffmpeg',
      type: 'workflow',
      position: { x: 80, y: 160 },
      data: {
        ...nodeTemplates[2],
        status: 'success',
        runtime: { durationMs: 1420, lastResult: 'audio.wav ready' },
      },
    },
    {
      id: 'node-whisper',
      type: 'workflow',
      position: { x: 380, y: 110 },
      data: {
        ...nodeTemplates[0],
        status: 'running',
        runtime: { durationMs: 8200, lastResult: 'transcribing segment 4/8' },
      },
    },
    {
      id: 'node-translate',
      type: 'workflow',
      position: { x: 690, y: 220 },
      data: {
        ...nodeTemplates[3],
        status: 'queued',
        runtime: { lastResult: 'waiting for transcript.text' },
      },
    },
    {
      id: 'node-summary',
      type: 'workflow',
      position: { x: 1010, y: 150 },
      data: {
        ...nodeTemplates[4],
        status: 'idle',
        runtime: { lastResult: 'not started' },
      },
    },
  ],
  edges: [
    {
      id: 'edge-ffmpeg-whisper',
      source: 'node-ffmpeg',
      target: 'node-whisper',
      animated: true,
      label: 'audio.wav',
    },
    {
      id: 'edge-whisper-translate',
      source: 'node-whisper',
      target: 'node-translate',
      animated: true,
      label: 'transcript.text',
    },
    {
      id: 'edge-translate-summary',
      source: 'node-translate',
      target: 'node-summary',
      label: 'translated.text',
    },
  ],
}
