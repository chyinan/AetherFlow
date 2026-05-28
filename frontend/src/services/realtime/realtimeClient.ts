import type { RunLogEntry, RunNodeState } from '@/types/run'

type RunHandlers = {
  onLog?: (entry: RunLogEntry) => void
  onNodePatch?: (patch: RunNodeState) => void
  onConnectionChange?: (state: 'online' | 'reconnecting' | 'offline') => void
}

const script = [
  { nodeId: 'node-whisper', label: 'Whisper', status: 'running' as const, message: 'Whisper received segment 5/8.' },
  { nodeId: 'node-whisper', label: 'Whisper', status: 'success' as const, message: 'Transcript completed and emitted transcript.text.' },
  { nodeId: 'node-translate', label: 'Translate', status: 'running' as const, message: 'Translate node started for target en-US.' },
  { nodeId: 'node-translate', label: 'Translate', status: 'success' as const, message: 'Translate node emitted translated.text.' },
  { nodeId: 'node-summary', label: 'Summary', status: 'running' as const, message: 'Summary node composing operator brief.' },
  { nodeId: 'node-summary', label: 'Summary', status: 'success' as const, message: 'Artifacts summary.md and actions.json are ready.' },
]

export const realtimeClient = {
  subscribeRun(runId: string, handlers: RunHandlers) {
    let index = 0
    handlers.onConnectionChange?.('online')

    const timer = window.setInterval(() => {
      const item = script[index % script.length]
      const time = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })

      handlers.onNodePatch?.({
        nodeId: item.nodeId,
        label: item.label,
        status: item.status,
        durationMs: 1200 + index * 930,
      })
      handlers.onLog?.({
        id: `${runId}-stream-${Date.now()}-${index}`,
        time,
        level: item.status === 'running' ? 'info' : 'debug',
        nodeId: item.nodeId,
        message: item.message,
      })

      index += 1
      if (index === 3) {
        handlers.onConnectionChange?.('reconnecting')
        window.setTimeout(() => handlers.onConnectionChange?.('online'), 460)
      }
    }, 1800)

    return () => {
      window.clearInterval(timer)
      handlers.onConnectionChange?.('offline')
    }
  },
}
