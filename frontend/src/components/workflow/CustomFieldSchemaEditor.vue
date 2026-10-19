<script setup lang="ts">
import { fieldTypes, type CustomField } from '@/utils/customNodes'
const props = defineProps<{ modelValue: CustomField[]; output?: boolean; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [fields: CustomField[]] }>()
function update(index: number, key: string, value: unknown) { emit('update:modelValue', props.modelValue.map((field, i) => i === index ? { ...field, [key]: value } : field)) }
function defaultValue(index: number, event: Event) {
  const text = (event.target as HTMLInputElement).value
  if (!text.trim()) { emit('update:modelValue', props.modelValue.map((field, i) => { const copy = { ...field }; if (i === index) delete copy.defaultValue; return copy })); return }
  try { update(index, 'defaultValue', JSON.parse(text)) } catch { update(index, 'defaultValue', text) }
}
</script>
<template>
  <section class="space-y-2 rounded-lg border border-app-border p-3">
    <h3 class="font-semibold">{{ label }}</h3>
    <div v-for="(field, index) in modelValue" :key="index" class="grid grid-cols-2 gap-2 rounded border border-app-border p-2">
      <label class="text-xs">字段名<input :aria-label="`${label}字段名 ${index + 1}`" class="mt-1 w-full rounded border p-2" :value="field.name" @input="update(index, 'name', ($event.target as HTMLInputElement).value)" /></label>
      <label class="text-xs">类型<select :aria-label="`${label}类型 ${index + 1}`" class="mt-1 w-full rounded border p-2" :value="field.type" @change="update(index, 'type', ($event.target as HTMLSelectElement).value)"><option v-for="type in fieldTypes" :key="type">{{ type }}</option></select></label>
      <label class="text-xs"><input type="checkbox" :checked="field.required" @change="update(index, 'required', ($event.target as HTMLInputElement).checked)" /> 必填</label>
      <button type="button" class="text-right text-xs text-status-error" :aria-label="`删除${label} ${index + 1}`" @click="emit('update:modelValue', modelValue.filter((_, i) => i !== index))">删除字段</button>
      <label v-if="output" class="col-span-2 text-xs">响应路径（JSON Pointer，空值表示整个结果）<input class="mt-1 w-full rounded border p-2 font-mono" :value="field.path ?? `/${field.name}`" @input="update(index, 'path', ($event.target as HTMLInputElement).value)" /></label>
      <label v-else class="col-span-2 text-xs">默认值（JSON，如 "文字"、3、true、{}）<input class="mt-1 w-full rounded border p-2 font-mono" :value="JSON.stringify(field.defaultValue) ?? ''" @change="defaultValue(index, $event)" /></label>
      <label v-if="field.type === 'STRING'" class="col-span-2 text-xs">枚举选项（逗号分隔，可留空）<input class="mt-1 w-full rounded border p-2" :value="field.options?.join(',') ?? ''" @input="update(index, 'options', ($event.target as HTMLInputElement).value.split(',').map(value => value.trim()).filter(Boolean))" /></label>
    </div>
    <button type="button" class="rounded border px-3 py-2 text-xs" :disabled="modelValue.length >= 32" @click="emit('update:modelValue', [...modelValue, { name: `field${modelValue.length + 1}`, type: 'STRING', required: false, ...(output ? { path: `/field${modelValue.length + 1}` } : {}) }])">添加{{ label }}字段</button>
  </section>
</template>
