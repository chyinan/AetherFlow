<script setup lang="ts">
import { Activity, BarChart3, BookOpen, Brain, FileText, FolderKanban, Workflow } from 'lucide-vue-next'
import { computed, ref } from 'vue'
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
const dockRoot = ref<HTMLElement | null>(null)
const dockItemRefs = ref<(HTMLElement | null)[]>([])
const pointerY = ref<number | null>(null)

const magnificationRange = 112
const maxScale = 1.62

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

function setDockItemRef(element: unknown, index: number) {
  dockItemRefs.value[index] = element instanceof HTMLElement ? element : null
}

function handleDockPointerMove(event: PointerEvent) {
  if (!dockRoot.value) return
  if (event.pointerType && event.pointerType !== 'mouse') {
    clearDockPointer()
    return
  }

  pointerY.value = event.clientY
}

function clearDockPointer() {
  pointerY.value = null
}

function dockScale(index: number) {
  const item = dockItemRefs.value[index]
  if (pointerY.value === null || !item) return 1

  const rect = item.getBoundingClientRect()
  const center = rect.top + rect.height / 2
  const distance = Math.abs(pointerY.value - center)
  const influence = Math.max(0, 1 - distance / magnificationRange)
  return 1 + influence * (maxScale - 1)
}

function dockItemStyle(index: number) {
  const scale = dockScale(index)
  return {
    transform: `translateX(${(scale - 1) * 10}px) scale(${scale})`,
    transformOrigin: 'left center',
    zIndex: Math.round(scale * 100),
  }
}

function isNavActive(key: string, to: string) {
  if (key === 'workflows') return route.path.startsWith('/workflows')
  if (key === 'runs') return route.path.startsWith('/runs')
  return route.path === to
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
      ref="dockRoot"
      class="flex w-28 flex-1 flex-col items-center justify-center gap-2.5 overflow-visible pb-16 pt-1"
      @pointerenter="handleDockPointerMove"
      @pointermove="handleDockPointerMove"
      @pointerleave="clearDockPointer"
      @pointercancel="clearDockPointer"
    >
      <RouterLink
        v-for="(item, index) in translatedNavItems"
        :key="item.key"
        :to="item.to"
        custom
        v-slot="{ href, navigate }"
      >
        <a
          :ref="(element) => setDockItemRef(element, index)"
          :href="href"
          :title="item.label"
          :aria-label="item.label"
          class="group relative grid h-10 w-10 place-items-center rounded-md text-slate-400 shadow-sm transition-[background-color,color,box-shadow,transform] duration-100 ease-out will-change-transform hover:bg-sidebar-soft hover:text-white hover:shadow-node"
          :class="isNavActive(item.key, item.to) ? 'bg-primary text-white shadow-node' : ''"
          :style="dockItemStyle(index)"
          @click="navigate"
        >
          <component :is="item.icon" class="h-5 w-5" />
          <span
            class="pointer-events-none absolute left-[52px] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-app-border bg-white px-2 py-1 text-xs font-medium text-text-primary opacity-0 shadow-panel transition-opacity group-hover:opacity-100"
          >
            {{ item.label }}
          </span>
        </a>
      </RouterLink>
    </nav>
  </aside>
</template>
