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
  {
    id: 'wf-meeting-notes',
    name: 'Meeting Notes Generator',
    updatedAt: '2026-05-28 00:18',
    status: 'running',
  },
  {
    id: 'wf-clip-translator',
    name: 'Clip Translator',
    updatedAt: '2026-05-27 22:44',
    status: 'draft',
  },
  {
    id: 'wf-ticket-classifier',
    name: 'Ticket Classifier',
    updatedAt: '2026-05-27 23:42',
    status: 'ready',
  },
  {
    id: 'wf-reply-drafter',
    name: 'Reply Drafter',
    updatedAt: '2026-05-27 21:13',
    status: 'draft',
  },
  {
    id: 'wf-paper-ingest',
    name: 'Paper Ingest',
    updatedAt: '2026-05-27 18:20',
    status: 'ready',
  },
  {
    id: 'wf-weekly-brief',
    name: 'Weekly Brief',
    updatedAt: '2026-05-26 20:08',
    status: 'draft',
  },
]

function createWorkflow(id: string, name: string): WorkflowDefinition {
  return {
    id,
    name,
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
}

export const workflowDefinitions: Record<string, WorkflowDefinition> = Object.fromEntries(
  workflowSummaries.map((workflow) => [workflow.id, createWorkflow(workflow.id, workflow.name)]),
) as Record<string, WorkflowDefinition>

export const initialWorkflow: WorkflowDefinition = workflowDefinitions['wf-media-digest']
