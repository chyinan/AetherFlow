<script setup lang="ts">
import { Activity, Brain, FileText, FolderKanban, Settings, Workflow } from 'lucide-vue-next'

const navItems = [
  { label: 'Projects', to: '/projects', icon: FolderKanban },
  { label: 'Workflows', to: '/workflows/wf-media-digest', icon: Workflow },
  { label: 'Runs', to: '/runs', icon: Activity },
  { label: 'Files', to: '/files', icon: FileText },
  { label: 'Models', to: '/models', icon: Brain },
  { label: 'Settings', to: '/settings', icon: Settings },
]
</script>

<template>
  <aside class="row-span-2 flex h-screen w-[72px] flex-col items-center bg-sidebar py-4 text-text-inverse">
      <RouterLink
      to="/projects"
      class="mb-6 grid h-10 w-10 place-items-center rounded-lg bg-primary text-white shadow-node"
      title="AetherFlow"
    >
      <Workflow class="h-5 w-5" />
    </RouterLink>

    <nav class="flex flex-1 flex-col items-center gap-2">
      <RouterLink
        v-for="item in navItems"
        :key="item.label"
        :to="item.to"
        :title="item.label"
        class="grid h-10 w-10 place-items-center rounded-md text-slate-400 transition hover:bg-sidebar-soft hover:text-white"
        active-class="bg-primary text-white"
      >
        <component :is="item.icon" class="h-5 w-5" />
      </RouterLink>
    </nav>
  </aside>
</template>
