<script setup lang="ts">
import { computed } from 'vue'
import { checkCustomField, type CustomField } from '@/utils/customNodes'
const props = defineProps<{ field: CustomField; modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const value = computed(() => props.modelValue === undefined ? props.field.defaultValue : props.modelValue)
const text = computed(() => props.field.type === 'STRING' || typeof value.value === 'string' ? String(value.value ?? '') : value.value === undefined ? '' : JSON.stringify(value.value))
const error = computed(() => { try { checkCustomField(props.field, value.value); return '' } catch (e) { return e instanceof Error ? e.message : String(e) } })
function update(event: Event) {
  const input = (event.target as HTMLInputElement).value
  if (props.field.options?.length && input === '') emit('update:modelValue', null)
  else if (props.field.type === 'STRING') emit('update:modelValue', input)
  else if (!input.trim()) emit('update:modelValue', null)
  else { try { emit('update:modelValue', JSON.parse(input)) } catch { emit('update:modelValue', input) } }
}
</script>
<template>
  <label class="block text-sm">{{ field.name }} · {{ field.type }} {{ field.required ? '*' : '' }}
    <select v-if="field.options?.length" class="mt-1 w-full rounded border p-2" :value="value ?? ''" @change="update"><option value="">请选择</option><option v-for="option in field.options" :key="option">{{ option }}</option></select>
    <select v-else-if="field.type === 'BOOLEAN'" class="mt-1 w-full rounded border p-2" :value="value == null ? '' : String(value)" @change="update"><option value="">未设置</option><option value="true">true</option><option value="false">false</option></select>
    <textarea v-else-if="['OBJECT', 'ARRAY'].includes(field.type)" class="mt-1 w-full rounded border p-2 font-mono" :value="text" :aria-invalid="Boolean(error)" @input="update" />
    <input v-else class="mt-1 w-full rounded border p-2" :value="text" :type="field.type === 'NUMBER' ? 'number' : 'text'" :aria-invalid="Boolean(error)" @input="update" />
    <span v-if="error" role="alert" class="mt-1 block text-xs text-status-error">{{ error }}</span>
  </label>
</template>
