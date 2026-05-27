<script setup lang="ts">
import { PanelRightClose, PanelRightOpen, Send, Sparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import IconButton from '@/components/ui/IconButton.vue'
import { copilotApi } from '@/services/api/copilotApi'
import { initialCopilotMessages } from '@/services/mock/copilotMock'
import { useUiStore } from '@/stores/uiStore'
import type { CopilotMessage } from '@/types/copilot'

const uiStore = useUiStore()
const prompt = ref('')
const loading = ref(false)
const messages = ref<CopilotMessage[]>([...initialCopilotMessages])

const quickPrompts = [
  'Suggest the next node',
  'Explain the latest error',
  'Draft a media digest workflow',
]

const panelTitle = computed(() => (uiStore.copilotCollapsed ? 'Open Copilot' : 'Collapse Copilot'))

async function sendPrompt(value = prompt.value) {
  const text = value.trim()
  if (!text || loading.value) {
    return
  }
  messages.value.push({
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    createdAt: new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  })
  prompt.value = ''
  loading.value = true
  try {
    messages.value.push(await copilotApi.ask(text))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <aside class="flex min-h-0 bg-white">
    <div v-if="uiStore.copilotCollapsed" class="flex w-14 flex-col items-center gap-3 py-4">
      <IconButton :label="panelTitle" @click="uiStore.toggleCopilot()">
        <PanelRightOpen class="h-4 w-4" />
      </IconButton>
      <div class="mt-2 grid h-9 w-9 place-items-center rounded-md bg-ai-soft text-ai">
        <Sparkles class="h-4 w-4" />
      </div>
    </div>

    <div v-else class="flex min-h-0 w-full flex-col">
      <div class="flex h-14 items-center justify-between border-b border-app-border px-4">
        <div class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-md bg-ai-soft text-ai">
            <Sparkles class="h-4 w-4" />
          </span>
          <div>
            <p class="text-sm font-semibold text-text-primary">AI Copilot</p>
            <p class="text-xs text-text-muted">mock advisor</p>
          </div>
        </div>
        <IconButton :label="panelTitle" @click="uiStore.toggleCopilot()">
          <PanelRightClose class="h-4 w-4" />
        </IconButton>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-app-border px-4 py-3">
        <button
          v-for="item in quickPrompts"
          :key="item"
          type="button"
          class="rounded-md border border-app-border bg-app-muted px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-ai/30 hover:bg-ai-soft hover:text-ai"
          @click="sendPrompt(item)"
        >
          {{ item }}
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-app-bg2 p-4">
        <article
          v-for="message in messages"
          :key="message.id"
          class="rounded-lg border p-3 text-sm leading-6 shadow-sm"
          :class="
            message.role === 'assistant'
              ? 'border-ai/15 bg-white text-text-primary'
              : 'ml-6 border-primary/20 bg-primary text-white'
          "
        >
          <div class="mb-1 flex items-center justify-between text-[11px]" :class="message.role === 'assistant' ? 'text-text-muted' : 'text-blue-100'">
            <span>{{ message.role }}</span>
            <span>{{ message.createdAt }}</span>
          </div>
          {{ message.content }}
        </article>
      </div>

      <form class="border-t border-app-border bg-white p-3" @submit.prevent="sendPrompt()">
        <div class="flex items-center gap-2 rounded-lg border border-app-border bg-app-muted px-3 py-2 focus-within:border-ai/50 focus-within:bg-white">
          <input
            v-model="prompt"
            class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
            placeholder="Ask about this workflow"
          />
          <button class="grid h-8 w-8 place-items-center rounded-md bg-ai text-white disabled:opacity-50" type="submit" :disabled="loading">
            <Send class="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  </aside>
</template>
