<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
}>()
</script>

<template>
  <button
    type="button"
    :title="label"
    class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-text-secondary transition hover:border-app-border hover:bg-app-muted hover:text-text-primary"
    :class="active ? 'border-primary/20 bg-primary-soft text-primary' : ''"
  >
    <slot />
  </button>
</template>
