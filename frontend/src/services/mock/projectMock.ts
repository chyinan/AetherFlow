import type { ProjectSummary } from '@/types/project'

import { workflowSummaries } from './workflowMock'

export const mockProjects: ProjectSummary[] = [
  {
    id: 'project-media-ops',
    name: 'Media Ops Lab',
    description: 'Audio/video processing workflows for transcription, translation, and executive summaries.',
    owner: 'aether.operator',
    environment: 'dev',
    health: 'healthy',
    workflowCount: 3,
    activeRunCount: 1,
    fileCount: 18,
    updatedAt: '2026-05-28 02:10',
    workflows: workflowSummaries.slice(0, 3),
  },
  {
    id: 'project-support-ai',
    name: 'Support AI Desk',
    description: 'Customer ticket enrichment, intent extraction, and multilingual reply drafting.',
    owner: 'ops.lead',
    environment: 'staging',
    health: 'attention',
    workflowCount: 2,
    activeRunCount: 0,
    fileCount: 7,
    updatedAt: '2026-05-27 23:42',
    workflows: workflowSummaries.slice(3, 5),
  },
  {
    id: 'project-research-digest',
    name: 'Research Digest',
    description: 'Document ingestion and weekly brief generation for research assets.',
    owner: 'research.bot',
    environment: 'dev',
    health: 'idle',
    workflowCount: 2,
    activeRunCount: 0,
    fileCount: 12,
    updatedAt: '2026-05-27 18:20',
    workflows: workflowSummaries.slice(5, 7),
  },
]
