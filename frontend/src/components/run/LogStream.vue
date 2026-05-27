<script setup lang="ts">
import { Search, Terminal } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { RunLogEntry } from '@/types/run'

const props = defineProps<{
  logs: RunLogEntry[]
}>()

const query = ref('')
const level = ref<'all' | RunLogEntry['level']>('all')

const filteredLogs = computed(() => {
  const text = query.value.trim().toLowerCase()
  return props.logs.filter((log) => {
    const matchesLevel = level.value === 'all' || log.level === level.value
    const matchesText = !text || log.message.toLowerCase().includes(text) || log.nodeId?.toLowerCase().includes(text)
    return matchesLevel && matchesText
  })
})
</script>

<template>
  <section class="flex min-h-0 flex-col rounded-lg border border-app-border bg-sidebar text-text-inverse shadow-sm">
    <div class="flex items-center justify-between border-b border-white/10 p-4">
      <div class="flex items-center gap-2">
        <Terminal class="h-4 w-4 text-primary" />
        <p class="text-sm font-semibold">Realtime Logs</p>
      </div>
      <select v-model="level" class="rounded-md border border-white/10 bg-sidebar-soft px-2 py-1 text-xs text-slate-200 outline-none">
        <option value="all">all</option>
        <option value="info">info</option>
        <option value="debug">debug</option>
        <option value="warn">warn</option>
        <option value="error">error</option>
      </select>
    </div>

    <label class="m-3 flex items-center gap-2 rounded-md border border-white/10 bg-sidebar-soft px-3 py-2 text-sm">
      <Search class="h-4 w-4 text-slate-400" />
      <input v-model="query" class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-500" placeholder="Search logs" />
    </label>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3 font-mono text-xs leading-6">
      <p v-for="log in filteredLogs" :key="log.id" class="rounded px-2 py-1 text-slate-300 hover:bg-white/5">
        <span class="text-slate-500">{{ log.time }}</span>
        <span class="mx-2 text-primary">{{ log.level }}</span>
        <span class="text-slate-500">{{ log.nodeId }}</span>
        <span class="ml-2">{{ log.message }}</span>
      </p>
    </div>
  </section>
</template>
