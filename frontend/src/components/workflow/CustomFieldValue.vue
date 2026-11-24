<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { checkCustomField, type CustomField } from '@/utils/customNodes'
const props = defineProps<{ field: CustomField; modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const value = computed(() => props.modelValue === undefined ? props.field.defaultValue : props.modelValue)
const structured = computed(() => props.field.type === 'OBJECT' || props.field.type === 'ARRAY')
const structuredDraft = shallowRef<{ text: string; signature: string | undefined } | null>(null)
const structuredSignature = computed(() => structured.value ? JSON.stringify(value.value) : undefined)
const text = computed(() => props.field.type === 'STRING' || typeof value.value === 'string' ? String(value.value ?? '') : value.value === undefined ? '' : JSON.stringify(value.value))
const structuredText = computed(() => structuredDraft.value?.text ?? (value.value == null ? '' : text.value))
const error = computed(() => { try { checkCustomField(props.field, value.value); return '' } catch (e) { return e instanceof Error ? e.message : String(e) } })
watch([() => props.field.name, () => props.field.type, structuredSignature], ([name, type, signature], [previousName, previousType]) => {
  // 画布回传同一 JSON 时保留原文与选区；外部修改、撤销或重做换了值则显示历史配置。
  if (name !== previousName || type !== previousType || structuredDraft.value?.signature !== signature) structuredDraft.value = null
})
function update(event: Event) {
  const input = (event.target as HTMLInputElement).value
  if (props.field.options?.length && input === '') emit('update:modelValue', null)
  else if (props.field.type === 'STRING') emit('update:modelValue', input)
  else {
    let next: unknown = null
    if (input.trim()) {
      try { next = JSON.parse(input) } catch { next = input }
    }
    if (structured.value) structuredDraft.value = { text: input, signature: JSON.stringify(next) }
    emit('update:modelValue', next)
  }
}
</script>
<template>
  <label class="block text-sm">{{ field.name }} · {{ field.type }} {{ field.required ? '*' : '' }}
    <select v-if="field.options?.length" class="mt-1 w-full rounded border p-2" :value="value ?? ''" @change="update"><option value="">请选择</option><option v-for="option in field.options" :key="option">{{ option }}</option></select>
    <select v-else-if="field.type === 'BOOLEAN'" class="mt-1 w-full rounded border p-2" :value="value == null ? '' : String(value)" @change="update"><option value="">未设置</option><option value="true">true</option><option value="false">false</option></select>
    <textarea v-else-if="structured" class="mt-1 w-full rounded border p-2 font-mono" :value="structuredText" :aria-invalid="Boolean(error)" @input="update" />
    <input v-else class="mt-1 w-full rounded border p-2" :value="text" :type="field.type === 'NUMBER' ? 'number' : 'text'" :aria-invalid="Boolean(error)" @input="update" />
    <span v-if="error" role="alert" class="mt-1 block text-xs text-status-error">{{ error }}</span>
  </label>
</template>
