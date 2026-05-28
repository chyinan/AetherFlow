<script setup lang="ts">
import { Brain, Cpu, Gauge } from 'lucide-vue-next'
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center gap-2 border-b border-app-border bg-white px-5">
      <Brain class="h-4 w-4 text-ai" />
      <div>
        <p class="text-sm font-semibold text-text-primary">Models</p>
        <p class="text-xs text-text-muted">AI runtime providers and model capacity are reserved for backend integration.</p>
      </div>
    </header>

    <main class="min-h-0 overflow-y-auto p-5">
      <div class="grid max-w-4xl gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-app-border bg-white p-5 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-md bg-ai-soft text-ai">
              <Cpu class="h-5 w-5" />
            </span>
            <div>
              <p class="text-sm font-semibold text-text-primary">Mock AI Runtime</p>
              <p class="mt-1 text-sm text-text-secondary">Provider adapters will connect here after gateway contracts settle.</p>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-app-border bg-white p-5 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-md bg-primary-soft text-primary">
              <Gauge class="h-5 w-5" />
            </span>
            <div>
              <p class="text-sm font-semibold text-text-primary">Capacity skeleton</p>
              <p class="mt-1 text-sm text-text-secondary">Rate limits, queues, and model health will surface as realtime signals.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </section>
</template>
