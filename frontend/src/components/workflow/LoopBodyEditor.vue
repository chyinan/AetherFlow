<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NodeConnectionSelector from './NodeConnectionSelector.vue'
import StructuredMappingEditor from './StructuredMappingEditor.vue'
import type { WorkflowNodeCatalogItem, WorkflowNodeConfigSchema } from '@/api/modules/node'

type BodyNode = { nodeId: string; nodeType: string; displayName: string; config: Record<string, unknown> }
const props = defineProps<{ modelValue: unknown; catalog: WorkflowNodeCatalogItem[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: BodyNode[]] }>()
const nodes = computed<BodyNode[]>(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const selectedType = ref('WHISPER')
const jsonErrors = ref<Record<string, string>>({})
const available = computed(() => props.catalog.filter(item => !['START', 'END', 'CONDITION', 'LOOP', 'ITERATION', 'QUESTION_CLASSIFIER'].includes(item.type ?? item.nodeType ?? '')))
watch(() => props.modelValue, () => { jsonErrors.value = {} })
function update(index: number, patch: Partial<BodyNode>) {
  emit('update:modelValue', nodes.value.map((node, i) => i === index ? { ...node, ...patch } : node))
}
function add() {
  if (nodes.value.length >= 100) return
  const item = available.value.find(item => (item.type ?? item.nodeType) === selectedType.value)
  if (!item) return
  let serial = 1
  while (nodes.value.some(node => node.nodeId === `step-${serial}`)) serial++
  const config: Record<string, unknown> = structuredClone(item?.exampleConfig ?? {})
  if (selectedType.value === 'WHISPER') { delete config.fileUrl; delete config.fileId; config.fileUrlVariable = 'item' }
  if (selectedType.value === 'HTTP_REQUEST') { delete config.url; delete config.bodyJson; delete config.bodyVariable; config.urlVariable = 'item'; config.method = 'GET'; config.errorStrategy = 'FAIL' }
  if (selectedType.value === 'IMAGE_GENERATION') { delete config.prompt; config.promptVariable = 'item' }
  emit('update:modelValue', [...nodes.value, { nodeId: `step-${serial}`, nodeType: selectedType.value, displayName: item?.displayName ?? selectedType.value, config }])
}
function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= nodes.value.length) return
  const next = [...nodes.value]; [next[index], next[target]] = [next[target]!, next[index]!]
  emit('update:modelValue', next)
}
function fields(node: BodyNode) {
  const connectionFields = ['connectionId', 'provider', 'checkpoint', 'vae', 'lora', 'sampler', 'scheduler', 'upscaler']
  return (props.catalog.find(item => (item.type ?? item.nodeType) === node.nodeType)?.configSchema ?? []).filter(field =>
    !(node.nodeType === 'HTTP_REQUEST' && field.name === 'errorStrategy')
    && !(['IMAGE_GENERATION', 'UPSCALE'].includes(node.nodeType) && connectionFields.includes(field.name))
    && !(node.nodeType === 'TEMPLATE_TRANSFORM' && node.config.transformMode === 'structured' && ['mapping', 'template', 'outputVariable'].includes(field.name)))
}
function applyValues(values: Record<string, unknown>, nodeId: string) {
  const index = nodes.value.findIndex(node => node.nodeId === nodeId)
  if (index >= 0) update(index, { config: { ...nodes.value[index]!.config, ...values } })
}
function value(node: BodyNode, field: WorkflowNodeConfigSchema) { return node.config[field.name] ?? '' }
function change(index: number, field: WorkflowNodeConfigSchema, event: Event) {
  const input = event.target as HTMLInputElement
  let result: unknown = input.value
  const key = `${nodes.value[index]?.nodeId}:${field.name}`
  try {
    if (field.type === 'NUMBER' || field.type === 'INTEGER') result = input.value === '' ? undefined : Number(input.value)
    if (field.type === 'BOOLEAN') result = input.checked
    if (field.type === 'OBJECT' || field.type === 'ARRAY') result = input.value.trim() ? JSON.parse(input.value) : undefined
    delete jsonErrors.value[key]
    update(index, { config: { ...nodes.value[index]!.config, [field.name]: result } })
  } catch { jsonErrors.value[key] = '请输入有效 JSON，原配置尚未更改' }
}
function display(value: unknown) { return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '') }
</script>

<template>
  <section data-test="loop-body-editor" class="space-y-3 rounded-xl border border-primary/30 p-3">
    <div><h3 class="text-sm font-semibold">循环体 · {{ nodes.length }} / 100</h3><p class="mt-1 text-xs text-text-secondary">从上到下执行，每项独立保存结果。节点的输入变量可以使用上方绑定的 item / index 名称。</p></div>
    <p v-if="!nodes.length" class="text-xs text-text-muted">尚无循环体。空循环保留原来的列表 / 状态输出行为。</p>
    <article v-for="(node, index) in nodes" :key="node.nodeId" class="space-y-2 rounded-lg border border-app-border bg-app-muted p-3" :data-body-id="node.nodeId">
      <div class="flex items-center gap-2"><span class="text-xs">{{ index + 1 }} · {{ node.nodeType }}</span><input aria-label="步骤名称" class="min-w-0 flex-1 rounded px-2 py-1 text-sm" :value="node.displayName" @input="update(index, { displayName: ($event.target as HTMLInputElement).value })" /></div>
      <div class="flex gap-2 text-xs"><button type="button" aria-label="上移步骤" :disabled="index === 0" @click="move(index, -1)">上移</button><button type="button" aria-label="下移步骤" :disabled="index === nodes.length - 1" @click="move(index, 1)">下移</button><button type="button" aria-label="删除步骤" @click="emit('update:modelValue', nodes.filter((_, i) => i !== index))">删除</button></div>
      <NodeConnectionSelector v-if="node.nodeType === 'IMAGE_GENERATION' || node.nodeType === 'UPSCALE'" :node-id="node.nodeId" :node-type="node.nodeType" :config="node.config" @apply="applyValues" @update-config="(key, value) => applyValues({ [key]: value }, node.nodeId)" />
      <StructuredMappingEditor v-if="node.nodeType === 'TEMPLATE_TRANSFORM' && node.config.transformMode === 'structured'" :node-id="node.nodeId" :config="node.config" @apply="applyValues" />
      <label v-for="field in fields(node)" :key="field.name" class="block text-xs"><span>{{ field.name }}{{ field.required ? ' *' : '' }}</span>
        <select v-if="field.options?.length" class="mt-1 w-full rounded border p-2" :value="value(node, field)" @change="change(index, field, $event)"><option v-for="option in field.options" :key="String(option)" :value="option">{{ option }}</option></select>
        <input v-else-if="field.type === 'BOOLEAN'" type="checkbox" :checked="Boolean(value(node, field))" @change="change(index, field, $event)" />
        <textarea v-else-if="field.type === 'OBJECT' || field.type === 'ARRAY'" class="mt-1 w-full rounded border p-2 font-mono" :value="display(value(node, field))" @change="change(index, field, $event)" />
        <input v-else class="mt-1 w-full rounded border p-2" :type="field.type === 'NUMBER' || field.type === 'INTEGER' ? 'number' : 'text'" :value="value(node, field)" @input="change(index, field, $event)" />
        <span v-if="jsonErrors[`${node.nodeId}:${field.name}`]" class="text-status-error" role="alert">{{ jsonErrors[`${node.nodeId}:${field.name}`] }}</span>
      </label>
    </article>
    <div class="flex gap-2"><select v-model="selectedType" aria-label="循环体节点类型" class="min-w-0 flex-1 rounded border p-2 text-xs"><option v-for="item in available" :key="item.type ?? item.nodeType" :value="item.type ?? item.nodeType">{{ item.displayName ?? item.type }}</option></select><button type="button" data-test="add-body-node" class="rounded bg-primary px-3 py-2 text-xs text-white" :disabled="nodes.length >= 100 || !available.length" @click="add">添加步骤</button></div>
  </section>
</template>
