import { describe, expect, it } from 'vitest'

import { nodeTemplates } from '@/services/mock/workflowMock'
import type { CopilotWorkflowPlan } from '@/types/copilotWorkflowPlan'
import { buildCopilotWorkflowPlanGraph } from './workflowCopilotActions'

function plan(recipe: CopilotWorkflowPlan['recipe']): CopilotWorkflowPlan {
  return {
    status: 'READY',
    requirements: {
      goal: 'Summarize the source',
      inputKind: recipe === 'URL_SUMMARY' ? 'PUBLIC_URL' : 'MEDIA_FILE',
      inputDescription: recipe === 'URL_SUMMARY' ? 'A public URL at run time' : 'A media file at run time',
      outputFormat: 'Markdown',
      language: 'English',
      audience: 'Project team',
      instruction: 'Focus on decisions',
      constraints: [],
    },
    recipe,
    steps: ['Read the source', 'Summarize the content', 'Export the result'],
    explanation: 'A supported summary plan.',
    clarifyingQuestion: null,
    assumptions: [],
  }
}

describe('Copilot workflow recipe compiler', () => {
  it('compiles a media summary chain with correct upstream variable labels', () => {
    const graph = buildCopilotWorkflowPlanGraph(plan('MEDIA_SUMMARY'), nodeTemplates, { idPrefix: 'media-plan' })
    expect(graph.nodes.map((node) => node.data.kind)).toEqual([
      'start', 'upload', 'ffmpeg', 'whisper', 'summary', 'export', 'output',
    ])
    expect(graph.edges.map((edge) => edge.label)).toEqual([
      'fileId', 'fileUrl', 'fileUrl', 'transcription', 'summary', 'summary',
    ])
    expect(graph.nodes.find((node) => node.data.kind === 'summary')?.data.config)
      .toMatchObject({ textVariable: 'transcription', language: 'English', prompt: 'Focus on decisions' })
  })

  it('compiles a URL summary with a public URL runtime input and URL text output', () => {
    const graph = buildCopilotWorkflowPlanGraph(plan('URL_SUMMARY'), nodeTemplates, { idPrefix: 'url-plan' })
    expect(graph.nodes.map((node) => node.data.kind)).toEqual(['start', 'url-fetch', 'summary', 'export', 'output'])
    expect(graph.nodes[0].data.outputs).toEqual(['websiteUrl'])
    expect(graph.edges.map((edge) => edge.label)).toEqual(['websiteUrl', 'urlText', 'summary', 'summary'])
    expect(graph.nodes.find((node) => node.data.kind === 'url-fetch')?.data.config)
      .toMatchObject({ urlVariable: 'websiteUrl', outputVariable: 'urlText' })
  })

  it('rejects recipes whose existing node capability is unavailable', () => {
    const templates = nodeTemplates.map((template) => template.kind === 'whisper'
      ? { ...template, availability: { available: false, reason: 'Whisper is disabled' } }
      : template)
    expect(() => buildCopilotWorkflowPlanGraph(plan('MEDIA_SUMMARY'), templates))
      .toThrow('Unavailable node capabilities: whisper')
  })
})
