<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import SidebarNav from './SidebarNav.vue'
import TopStatusBar from './TopStatusBar.vue'

const route = useRoute()
const isSettingsPage = computed(() => route.name === 'settings')
const isAccountPage = computed(() => route.name === 'account')
</script>

<template>
  <div v-if="isSettingsPage || isAccountPage" class="h-screen overflow-auto bg-app-bg text-text-primary">
    <RouterView />
  </div>
  <div
    v-else
    class="grid h-screen overflow-hidden bg-app-bg text-text-primary"
    :style="{
      gridTemplateColumns: '72px minmax(0, 1fr)',
      gridTemplateRows: '56px minmax(0, 1fr)',
    }"
  >
    <SidebarNav class="col-start-1 row-span-2 row-start-1" />
    <TopStatusBar class="col-start-2 row-start-1" />
    <main class="col-start-2 row-start-2 min-h-0 min-w-0 overflow-hidden">
      <RouterView />
    </main>
  </div>
</template>
