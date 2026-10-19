<script setup lang="ts">
import { computed, ref } from 'vue'
import CustomFieldValue from './CustomFieldValue.vue'
import { parseCustomDefinition, previewCustomNode } from '@/utils/customNodes'
const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [key: string, value: unknown] }>()
const definition = computed(() => { try { return parseCustomDefinition(props.config.customDefinition) } catch { return null } })
const definitionError = computed(() => { try { parseCustomDefinition(props.config.customDefinition); return '' } catch (e) { return e instanceof Error ? e.message : String(e) } })
const variables = ref('{}'), response = ref('{"result":"示例输出"}'), preview = ref(''), error = ref('')
function values(key: string): Record<string, unknown> { const raw = props.config[key]; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {} }
function update(key: string, name: string, value: unknown) { emit('update', key, { ...values(key), [name]: value }); preview.value = ''; error.value = '' }
function debug() { try { preview.value = JSON.stringify(previewCustomNode(parseCustomDefinition(props.config.customDefinition), props.config, JSON.parse(variables.value), JSON.parse(response.value)), null, 2); error.value = '' } catch (e) { preview.value = ''; error.value = e instanceof Error ? e.message : String(e) } }
</script>
<template>
  <section class="space-y-4 p-5" data-testid="custom-node-config">
    <p v-if="definitionError" role="alert" class="text-status-error">{{ definitionError }}。请恢复兼容的模板快照。</p>
    <template v-if="definition">
      <h3 class="font-semibold">{{ definition.name }}</h3><p class="text-xs text-text-muted">{{ definition.id }}@{{ definition.version }} · 固定版本快照</p>
      <p class="text-sm">{{ definition.description }}</p>
      <p v-if="definition.kind === 'CODE'" class="text-xs text-status-warning">实际执行需要管理员已配置并确认隔离的 Python 运行时；未启用时后端会拒绝运行。</p>
      <h4 class="font-semibold">输入</h4>
      <div v-for="field in definition.inputs" :key="field.name" class="space-y-2 rounded border p-2">
        <CustomFieldValue v-if="!values('inputBindings')[field.name]" :field="field" :model-value="values('customInputs')[field.name]" @update:model-value="update('customInputs', field.name, $event)" />
        <label class="block text-xs">{{ field.name }} 的工作流变量（优先于固定值）<input class="mt-1 w-full rounded border p-2" :value="values('inputBindings')[field.name] ?? ''" @input="update('inputBindings', field.name, ($event.target as HTMLInputElement).value)" /></label>
      </div>
      <h4 v-if="definition.fields.length" class="font-semibold">配置表单</h4>
      <CustomFieldValue v-for="field in definition.fields" :key="field.name" :field="field" :model-value="values('customValues')[field.name]" @update:model-value="update('customValues', field.name, $event)" />
      <p class="text-xs text-text-muted">输出：{{ definition.outputs.map(field => `${field.name} (${field.type})`).join('、') }}</p>
      <details class="space-y-3 rounded border p-3"><summary class="cursor-pointer font-semibold">调试预览</summary>
        <p class="mt-3 text-xs">本地校验输入、占位符和响应映射；不会发送 HTTP 请求或执行代码。</p>
        <label class="block text-xs">模拟工作流变量（JSON 对象）<textarea v-model="variables" class="mt-1 w-full rounded border p-2 font-mono" /></label>
        <label class="block text-xs">模拟响应 JSON（API 响应体 / 代码返回值）<textarea v-model="response" class="mt-1 w-full rounded border p-2 font-mono" /></label>
        <button type="button" class="rounded border px-3 py-2 text-sm" @click="debug">生成调试预览</button>
        <button type="button" class="ml-2 text-sm" @click="preview = ''; error = ''">清空预览</button>
        <p v-if="error" role="alert" class="text-xs text-status-error">{{ error }}</p><pre v-if="preview" class="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs" data-testid="custom-preview">{{ preview }}</pre>
      </details>
    </template>
  </section>
</template>
