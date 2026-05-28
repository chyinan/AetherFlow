import type { CopilotMessage } from '@/types/copilot'

export const initialCopilotMessages: CopilotMessage[] = [
  {
    id: 'copilot-welcome',
    role: 'assistant',
    content:
      'I can draft workflow nodes, explain run failures, or suggest the next node from the current canvas.',
    createdAt: '01:32',
  },
]
