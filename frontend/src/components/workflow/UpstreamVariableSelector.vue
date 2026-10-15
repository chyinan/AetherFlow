<script setup lang="ts">
// pattern: Imperative Shell
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'
import { upstreamVariables } from '@/utils/workflowVariables'
import { upstreamVariableMessages } from './upstreamVariableMessages'
const props = defineProps<{ nodeId: string; field: string; modelValue: string; nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[]; templates?: NodeTemplate[]; label: string; expectedType?: string; fixedValueActive?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n({ useScope: 'local', messages: upstreamVariableMessages })
const choices = computed(() => upstreamVariables(props.nodeId, props.nodes, props.edges, props.templates))
const selected = computed(() => choices.value.find((item) => item.name === props.modelValue.trim()))
const invalid = computed(() => props.modelValue.trim() && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(props.modelValue.trim()))
const mismatch = computed(() => selected.value && props.expectedType && selected.value.type !== 'UNKNOWN' && props.expectedType !== selected.value.type)
function choose(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (choices.value.some((item) => item.name === value)) emit('update:modelValue', value)
}
</script>
<template>
  <div class="space-y-2" :data-variable-field="field">
    <label class="block text-sm font-semibold text-text-primary">
      {{ label }}
      <select :aria-label="label" :value="selected?.name ?? ''" :data-config-field="field" class="mt-2 w-full rounded-lg border border-app-border bg-white p-3 text-sm font-normal" @change="choose">
        <option value="" disabled>{{ t('choose') }}</option>
        <option v-for="choice in choices" :key="choice.name" :value="choice.name">{{ choice.sources.map((source) => source.label).join(' / ') }} · {{ choice.name }} ({{ choice.type }})</option>
      </select>
    </label>
    <p v-if="!choices.length" class="text-xs text-text-muted">{{ t('empty') }}</p>
    <p v-if="selected" class="break-words text-xs text-text-secondary">{{ t('source') }}: {{ selected.sources.map((source) => `${source.label} (${source.id})`).join(', ') }} · {{ t('type') }}: {{ selected.type }}</p>
    <p v-if="selected && selected.writers.length > 1" role="status" class="text-xs text-amber-800">{{ t('duplicate') }} {{ selected.writers.map((source) => `${source.label} (${source.id})`).join(', ') }}</p>
    <p v-if="modelValue && !selected" role="status" class="text-xs text-amber-800">{{ t('missing') }} {{ modelValue }}</p>
    <p v-if="invalid" role="alert" class="text-xs text-status-error">{{ t('invalid') }}</p>
    <p v-if="mismatch" class="text-xs text-amber-800">{{ t('mismatch') }} {{ t('expected') }}: {{ expectedType }}</p>
    <p v-if="fixedValueActive" class="text-xs text-amber-800">{{ t('fixed') }}</p>
    <details class="rounded-lg border border-app-border p-2">
      <summary class="cursor-pointer text-xs text-primary">{{ t('advanced') }}</summary>
      <input :aria-label="`${label} · ${t('advanced')}`" :value="modelValue" class="mt-2 w-full rounded border border-app-border p-2 font-mono text-sm" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    </details>
    <p class="text-xs leading-5 text-text-muted">{{ t('global') }}</p>
  </div>
</template>
