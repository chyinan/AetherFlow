<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const AppShell = defineAsyncComponent(() => import('@/components/layout/AppShell.vue'))
</script>

<template>
  <RouterView v-if="route.meta.layout === 'auth'" />
  <AppShell v-else />
</template>
