<script setup lang="ts">
import { Languages } from 'lucide-vue-next'

import { availableLocales, type AppLocale } from '@/i18n/locale'
import { useUiStore } from '@/stores/uiStore'

const uiStore = useUiStore()

const labels: Record<AppLocale, string> = {
  'zh-CN': '中文',
  'en-US': 'EN',
}

const titles: Record<AppLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
}
</script>

<template>
  <div class="inline-flex h-9 items-center rounded-md border border-app-border bg-white p-1 text-xs shadow-sm">
    <Languages class="ml-1 mr-1.5 h-3.5 w-3.5 text-text-muted" />
    <button
      v-for="locale in availableLocales"
      :key="locale"
      type="button"
      class="h-7 rounded px-2 font-medium transition"
      :class="uiStore.locale === locale ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-app-muted hover:text-text-primary'"
      :title="titles[locale]"
      :aria-pressed="uiStore.locale === locale"
      @click="uiStore.setLocale(locale)"
    >
      {{ labels[locale] }}
    </button>
  </div>
</template>
