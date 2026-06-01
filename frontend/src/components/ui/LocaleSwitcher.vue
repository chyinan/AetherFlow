<script setup lang="ts">
import { Check, ChevronDown, Globe2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { availableLocales, type AppLocale } from '@/i18n/locale'
import { useUiStore } from '@/stores/uiStore'

const uiStore = useUiStore()
const switcherRef = ref<HTMLDetailsElement | null>(null)

const localeOptions: Array<{ locale: AppLocale; code: string; label: string; title: string }> = [
  { locale: 'en-US', code: 'EN', label: 'English', title: 'English' },
  { locale: 'zh-CN', code: 'ZH', label: '中文', title: '简体中文' },
  { locale: 'ja-JP', code: 'JP', label: '日本語', title: '日本語' },
]

const currentLocale = computed(() => localeOptions.find((option) => option.locale === uiStore.locale) ?? localeOptions[1])

function selectLocale(locale: AppLocale) {
  uiStore.setLocale(locale)
  if (switcherRef.value) {
    switcherRef.value.open = false
  }
}
</script>

<template>
  <details ref="switcherRef" class="relative inline-block text-left">
    <summary
      class="inline-flex h-10 min-w-[120px] cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-app-border bg-white px-3 text-sm font-semibold text-text-primary shadow-sm transition hover:border-app-strong hover:bg-app-bg2 [&::-webkit-details-marker]:hidden"
      aria-haspopup="menu"
    >
      <Globe2 class="h-5 w-5 text-text-primary" />
      <span>{{ currentLocale.title }}</span>
      <ChevronDown class="h-4 w-4 text-text-muted" />
    </summary>

    <div
      class="absolute right-0 z-[90] mt-2 w-56 overflow-hidden rounded-xl border border-app-border bg-white py-2 shadow-[0_18px_48px_rgba(15,23,42,0.16)]"
      role="menu"
    >
      <button
        v-for="option in localeOptions"
        :key="option.locale"
        type="button"
        class="grid h-14 w-full grid-cols-[48px_minmax(0,1fr)_24px] items-center gap-2 px-4 text-left text-base transition hover:bg-app-bg2"
        :class="uiStore.locale === option.locale ? 'text-text-primary' : 'text-text-secondary'"
        role="menuitemradio"
        :aria-checked="uiStore.locale === option.locale"
        :disabled="!availableLocales.includes(option.locale)"
        @click="selectLocale(option.locale)"
      >
        <span class="font-medium uppercase tracking-normal">{{ option.code }}</span>
        <span class="font-medium">{{ option.label }}</span>
        <Check v-if="uiStore.locale === option.locale" class="h-4 w-4 text-primary" />
      </button>
    </div>
  </details>
</template>
