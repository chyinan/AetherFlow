import type { CopilotMessage } from '@/types/copilot'

import { delay } from '../mock/timing'

export const copilotApi = {
  ask(prompt: string) {
    const lowered = prompt.toLowerCase()
    const content = lowered.includes('error')
      ? 'The likely failure point is the active Whisper node. Check input media format, runtime queue capacity, and transcript output mapping before rerunning.'
      : lowered.includes('node')
        ? 'A solid next node is Summary after Translate. Keep the summary node output as summary.md and actions.json so Files can show final artifacts.'
        : 'I can turn that into a workflow draft by adding media input, FFmpeg, Whisper, Translate, and Summary nodes with typed outputs.'

    return delay<CopilotMessage>({
      id: `copilot-${Date.now()}`,
      role: 'assistant',
      content,
      createdAt: new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    })
  },
}
