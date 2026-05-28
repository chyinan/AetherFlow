<script setup lang="ts">
import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import { useUiStore } from '@/stores/uiStore'

import SidebarNav from './SidebarNav.vue'
import TopStatusBar from './TopStatusBar.vue'

const uiStore = useUiStore()
</script>

<template>
  <div
    class="grid h-screen overflow-hidden bg-app-bg text-text-primary"
    :style="{
      gridTemplateColumns: `72px minmax(0, 1fr) ${uiStore.copilotCollapsed ? '56px' : '360px'}`,
      gridTemplateRows: '56px minmax(0, 1fr)',
    }"
  >
    <SidebarNav class="col-start-1 row-span-2 row-start-1" />
    <TopStatusBar class="col-start-2 row-start-1" />
    <main class="col-start-2 row-start-2 min-h-0 min-w-0 overflow-hidden">
      <RouterView />
    </main>
    <AICopilotPanel class="col-start-3 row-span-2 row-start-1 border-l border-app-border" />
  </div>
</template>
