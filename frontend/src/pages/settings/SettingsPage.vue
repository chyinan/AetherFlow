<script setup lang="ts">
import { KeyRound, ShieldCheck } from 'lucide-vue-next'
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center gap-2 border-b border-app-border bg-white px-5">
      <ShieldCheck class="h-4 w-4 text-primary" />
      <div>
        <p class="text-sm font-semibold text-text-primary">Settings</p>
        <p class="text-xs text-text-muted">RBAC and project controls are reserved for the next phase.</p>
      </div>
    </header>

    <main class="p-5">
      <div class="max-w-3xl rounded-lg border border-app-border bg-white p-5 shadow-sm">
        <div class="flex items-center gap-3">
          <span class="grid h-10 w-10 place-items-center rounded-md bg-primary-soft text-primary">
            <KeyRound class="h-5 w-5" />
          </span>
          <div>
            <p class="text-sm font-semibold text-text-primary">Project access skeleton</p>
            <p class="mt-1 text-sm text-text-secondary">Roles, environment keys, and audit policy controls will attach here after backend contracts settle.</p>
          </div>
        </div>
      </div>
    </main>
  </section>
</template>
