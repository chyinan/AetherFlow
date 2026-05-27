import { defineStore } from 'pinia'

import type { ServiceStatus } from '@/types/api'

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebarCompact: true,
    copilotCollapsed: false,
    commandMenuOpen: false,
    selectedNodeId: 'node-whisper' as string | null,
    realtimeState: 'online' as 'online' | 'reconnecting' | 'offline',
    theme: 'light' as 'light' | 'dark',
    statuses: [
      { name: 'Gateway', state: 'online', detail: 'mock gateway ready' },
      { name: 'Realtime', state: 'online', detail: 'mock stream connected' },
      { name: 'AI Runtime', state: 'degraded', detail: 'mock provider only' },
    ] as ServiceStatus[],
  }),
  actions: {
    toggleCopilot() {
      this.copilotCollapsed = !this.copilotCollapsed
    },
    setSelectedNode(nodeId: string | null) {
      this.selectedNodeId = nodeId
    },
    setRealtimeState(state: 'online' | 'reconnecting' | 'offline') {
      this.realtimeState = state
      const realtime = this.statuses.find((item) => item.name === 'Realtime')
      if (realtime) {
        realtime.state = state === 'online' ? 'online' : state === 'reconnecting' ? 'degraded' : 'offline'
        realtime.detail = state === 'online' ? 'mock stream connected' : state
      }
    },
  },
})
