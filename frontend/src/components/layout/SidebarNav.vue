<script setup lang="ts">
import { Activity, Brain, FileText, FolderKanban, Settings, Workflow } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const navItems = [
  { key: 'projects', to: '/projects', icon: FolderKanban },
  { key: 'workflows', to: '/workflows/wf-media-digest', icon: Workflow },
  { key: 'runs', to: '/runs', icon: Activity },
  { key: 'files', to: '/files', icon: FileText },
  { key: 'models', to: '/models', icon: Brain },
  { key: 'settings', to: '/settings', icon: Settings },
] as const

const { t } = useI18n()

const translatedNavItems = computed(() =>
  navItems.map((item) => ({
    ...item,
    label: t(`nav.${item.key}`),
  })),
)
</script>

<template>
  <aside class="row-span-2 flex h-screen w-[72px] flex-col items-center bg-sidebar py-4 text-text-inverse">
      <RouterLink
      to="/projects"
      class="mb-6 grid h-10 w-10 place-items-center rounded-lg bg-primary text-white shadow-node"
      :title="t('app.name')"
    >
      <Workflow class="h-5 w-5" />
    </RouterLink>

    <nav class="flex flex-1 flex-col items-center gap-2">
      <RouterLink
        v-for="item in translatedNavItems"
        :key="item.key"
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
