<script setup lang="ts">
import { Activity, BarChart3, BookOpen, Brain, FileText, FolderKanban, Workflow } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'

const navItems = [
  { key: 'projects', to: '/projects', icon: FolderKanban },
  { key: 'workflows', to: '', icon: Workflow },
  { key: 'runs', to: '/runs', icon: Activity },
  { key: 'knowledge', to: '/knowledge', icon: BookOpen },
  { key: 'files', to: '/files', icon: FileText },
  { key: 'monitor', to: '/monitor', icon: BarChart3 },
  { key: 'models', to: '/models', icon: Brain },
] as const

const { t } = useI18n()
const route = useRoute()
const projectStore = useProjectStore()
const workflowStore = useWorkflowStore()
const optimisticActiveKey = ref<string | null>(null)

const translatedNavItems = computed(() =>
  navItems.map((item) => ({
    ...item,
    label: t(`nav.${item.key}`),
    to: item.key === 'workflows' ? workflowNavTarget.value : item.to,
  })),
)

const workflowNavTarget = computed(() => {
  if (route.path.startsWith('/workflows/')) {
    return route.fullPath
  }
  if (workflowStore.workflowId && workflowStore.workflowId !== 'new' && workflowStore.nodes.length > 0) {
    return `/workflows/${workflowStore.workflowId}`
  }
  const currentProjectWorkflow = projectStore.currentProject?.workflows[0] ?? projectStore.workflowSummaries[0]
  if (currentProjectWorkflow?.id) {
    return `/workflows/${currentProjectWorkflow.id}`
  }
  return '/projects'
})

const routeActiveKey = computed(() => {
  if (route.path.startsWith('/workflows')) return 'workflows'
  if (route.path.startsWith('/runs')) return 'runs'
  return navItems.find((item) => item.to && route.path === item.to)?.key ?? null
})

const displayedActiveKey = computed(() => optimisticActiveKey.value ?? routeActiveKey.value)

watch(
  () => route.fullPath,
  () => {
    optimisticActiveKey.value = null
  },
)

function markOptimisticActive(key: string) {
  optimisticActiveKey.value = key
  window.setTimeout(() => {
    if (optimisticActiveKey.value === key) {
      optimisticActiveKey.value = null
    }
  }, 800)
}

function handleNavClick(event: MouseEvent, key: string, navigate: (event?: MouseEvent) => void) {
  markOptimisticActive(key)
  navigate(event)
}

function isNavActive(key: string) {
  return displayedActiveKey.value === key
}
</script>

<template>
  <aside class="relative z-30 row-span-2 flex h-screen w-[72px] flex-col items-center overflow-visible bg-sidebar py-4 text-text-inverse">
    <RouterLink
      to="/projects"
      class="mb-6 grid h-10 w-10 place-items-center rounded-lg bg-primary text-white shadow-node"
      :title="t('app.name')"
    >
      <Workflow class="h-5 w-5" />
    </RouterLink>

    <nav
      class="flex w-full flex-1 flex-col items-center justify-center gap-5 pb-16 pt-1"
    >
      <RouterLink
        v-for="item in translatedNavItems"
        :key="item.key"
        :to="item.to"
        custom
        v-slot="{ href, navigate }"
      >
        <a
          :href="href"
          :title="item.label"
          :aria-label="item.label"
          class="group relative grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-300 shadow-[0_4px_12px_rgba(0,0,0,0.10)] transition-[box-shadow,background-color,border-color,color] duration-150 ease-out"
          :class="
            isNavActive(item.key)
              ? '!border-primary !bg-primary !text-white shadow-[0_8px_18px_rgba(37,99,235,0.26)]'
              : 'hover:border-white/20 hover:bg-white/[0.08] hover:text-white hover:shadow-[0_6px_14px_rgba(0,0,0,0.14)]'
          "
          @pointerdown="markOptimisticActive(item.key)"
          @click="(event) => handleNavClick(event, item.key, navigate)"
        >
          <component :is="item.icon" class="h-5 w-5" />
          <span
            class="pointer-events-none absolute left-[68px] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-app-border bg-white px-2 py-1 text-xs font-medium text-text-primary opacity-0 shadow-panel transition-opacity group-hover:opacity-100"
          >
            {{ item.label }}
          </span>
        </a>
      </RouterLink>
    </nav>
  </aside>
</template>
