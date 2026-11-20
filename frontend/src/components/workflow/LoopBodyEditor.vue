<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NodeConnectionSelector from './NodeConnectionSelector.vue'
import StructuredMappingEditor from './StructuredMappingEditor.vue'
import type { WorkflowNodeCatalogItem, WorkflowNodeConfigSchema } from '@/api/modules/node'

type BodyNode = { nodeId: string; nodeType: string; displayName: string; config: Record<string, unknown> }
type JsonDraft = { text: string; error: 'invalidJson' | 'expectedJsonObject' | 'expectedJsonArray' }
const props = defineProps<{ modelValue: unknown; catalog: WorkflowNodeCatalogItem[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: BodyNode[]] }>()
const { t } = useI18n()
const nodes = computed<BodyNode[]>(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const selectedType = ref('WHISPER')
const jsonDrafts = ref<Record<string, JsonDraft>>({})
const available = computed(() => props.catalog.filter(item => !['START', 'END', 'CONDITION', 'LOOP', 'ITERATION', 'QUESTION_CLASSIFIER'].includes(item.type ?? item.nodeType ?? '')))
let localBodyUpdate: BodyNode[] | undefined
function emitBodyUpdate(next: BodyNode[]) {
  localBodyUpdate = next
  emit('update:modelValue', next)
}
function update(index: number, patch: Partial<BodyNode>) {
  emitBodyUpdate(nodes.value.map((node, i) => i === index ? { ...node, ...patch } : node))
}
function add() {
  if (nodes.value.length >= 100) return
  const item = available.value.find(item => (item.type ?? item.nodeType) === selectedType.value)
  if (!item) return
  let serial = 1
  while (nodes.value.some(node => node.nodeId === `step-${serial}`)) serial++
  const config: Record<string, unknown> = structuredClone(toRaw(item?.exampleConfig ?? {}))
  if (selectedType.value === 'WHISPER') { delete config.fileUrl; delete config.fileId; config.fileUrlVariable = 'item' }
  if (selectedType.value === 'HTTP_REQUEST') { delete config.url; delete config.bodyJson; delete config.bodyVariable; config.urlVariable = 'item'; config.method = 'GET'; config.errorStrategy = 'FAIL' }
  if (selectedType.value === 'IMAGE_GENERATION') { delete config.prompt; config.promptVariable = 'item' }
  emitBodyUpdate([...nodes.value, { nodeId: `step-${serial}`, nodeType: selectedType.value, displayName: item?.displayName ?? selectedType.value, config }])
}
function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= nodes.value.length) return
  const next = [...nodes.value]; [next[index], next[target]] = [next[target]!, next[index]!]
  emitBodyUpdate(next)
}
function fields(node: BodyNode) {
  const connectionFields = ['connectionId', 'provider', 'checkpoint', 'vae', 'lora', 'sampler', 'scheduler', 'upscaler']
  return (props.catalog.find(item => (item.type ?? item.nodeType) === node.nodeType)?.configSchema ?? []).filter(field =>
    !(node.nodeType === 'HTTP_REQUEST' && field.name === 'errorStrategy')
    && !(['IMAGE_GENERATION', 'UPSCALE'].includes(node.nodeType) && connectionFields.includes(field.name))
    && !(node.nodeType === 'TEMPLATE_TRANSFORM' && node.config.transformMode === 'structured' && ['mapping', 'template', 'outputVariable'].includes(field.name)))
}
function isJsonField(field: WorkflowNodeConfigSchema) {
  return field.type === 'OBJECT' || field.type === 'ARRAY'
}
function isJsonObject(value: unknown, allowObjectText: boolean) {
  if (allowObjectText && typeof value === 'string') {
    try {
      value = JSON.parse(value.replace(/^\uFEFF/, ''))
    } catch {
      return false
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
watch(() => props.modelValue, (next, previous) => {
  // 只延续当前组件发出且父级已接纳的局部编辑；撤销、重载和替换仍丢弃未提交原文。
  const fromLocalEdit = localBodyUpdate !== undefined && toRaw(next) === localBodyUpdate
  localBodyUpdate = undefined
  if (!fromLocalEdit || !Array.isArray(previous)) {
    jsonDrafts.value = {}
    return
  }
  if (!Object.keys(jsonDrafts.value).length) return
  const previousSteps = new Map(previous.map((node: BodyNode) => [node.nodeId, node]))
  const retained: Record<string, JsonDraft> = {}
  for (const node of nodes.value) {
    const before = previousSteps.get(node.nodeId)
    if (before?.nodeType !== node.nodeType) continue
    for (const field of fields(node)) {
      const key = `${node.nodeId}:${field.name}`
      const draft = jsonDrafts.value[key]
      if (draft && isJsonField(field) && !field.options?.length
        && Object.is(toRaw(before.config[field.name]), toRaw(node.config[field.name]))) {
        retained[key] = draft
      }
    }
  }
  jsonDrafts.value = retained
})
function applyValues(values: Record<string, unknown>, nodeId: string) {
  const index = nodes.value.findIndex(node => node.nodeId === nodeId)
  if (index >= 0) update(index, { config: { ...nodes.value[index]!.config, ...values } })
}
function value(node: BodyNode, field: WorkflowNodeConfigSchema) { return node.config[field.name] ?? '' }
function change(index: number, field: WorkflowNodeConfigSchema, event: Event) {
  const input = event.target as HTMLInputElement
  let result: unknown = input.value
  const node = nodes.value[index]!
  const key = `${node.nodeId}:${field.name}`
  if (field.type === 'NUMBER' || field.type === 'INTEGER') result = input.value === '' ? undefined : Number(input.value)
  if (field.type === 'BOOLEAN') result = input.checked
  if (isJsonField(field)) {
    const text = input.value
    try {
      result = text.trim() ? JSON.parse(text) : undefined
    } catch {
      jsonDrafts.value[key] = { text, error: 'invalidJson' }
      return
    }
    // 图像工作流可继续使用包含 JSON 对象的旧文本格式；留空和 null 仍用既有必填规则。
    const allowObjectText = node.nodeType === 'IMAGE_GENERATION' && field.name === 'workflow'
    if (result != null) {
      if (field.type === 'OBJECT' && !isJsonObject(result, allowObjectText)) {
        jsonDrafts.value[key] = { text, error: 'expectedJsonObject' }
        return
      }
      if (field.type === 'ARRAY' && !Array.isArray(result)) {
        jsonDrafts.value[key] = { text, error: 'expectedJsonArray' }
        return
      }
    }
  }
  delete jsonDrafts.value[key]
  update(index, { config: { ...node.config, [field.name]: result } })
}
function display(value: unknown) { return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '') }
function displayDraft(node: BodyNode, field: WorkflowNodeConfigSchema) {
  return jsonDrafts.value[`${node.nodeId}:${field.name}`]?.text ?? display(value(node, field))
}
function draftErrorMessage(node: BodyNode, field: WorkflowNodeConfigSchema) {
  const error = jsonDrafts.value[`${node.nodeId}:${field.name}`]?.error
  return error ? t(`workflow.inspector.loopEditor.${error}`) : ''
}
</script>

<template>
  <section data-test="loop-body-editor" class="space-y-3 rounded-xl border border-primary/30 p-3">
    <div><h3 class="text-sm font-semibold">{{ t('workflow.inspector.loopEditor.title', { count: nodes.length, max: 100 }) }}</h3><p class="mt-1 text-xs text-text-secondary">{{ t('workflow.inspector.loopEditor.hint') }}</p></div>
    <p v-if="!nodes.length" class="text-xs text-text-muted">{{ t('workflow.inspector.loopEditor.empty') }}</p>
    <article v-for="(node, index) in nodes" :key="node.nodeId" class="space-y-2 rounded-lg border border-app-border bg-app-muted p-3" :data-body-id="node.nodeId">
      <div class="flex items-center gap-2"><span class="text-xs">{{ index + 1 }} · {{ node.nodeType }}</span><input :aria-label="t('workflow.inspector.loopEditor.stepName')" class="min-w-0 flex-1 rounded px-2 py-1 text-sm" :value="node.displayName" @input="update(index, { displayName: ($event.target as HTMLInputElement).value })" /></div>
      <div class="flex gap-2 text-xs"><button type="button" :aria-label="t('workflow.inspector.loopEditor.moveUp')" :disabled="index === 0" @click="move(index, -1)">{{ t('workflow.inspector.loopEditor.moveUp') }}</button><button type="button" :aria-label="t('workflow.inspector.loopEditor.moveDown')" :disabled="index === nodes.length - 1" @click="move(index, 1)">{{ t('workflow.inspector.loopEditor.moveDown') }}</button><button type="button" :aria-label="t('workflow.inspector.loopEditor.deleteStep')" @click="emitBodyUpdate(nodes.filter((_, i) => i !== index))">{{ t('workflow.inspector.loopEditor.deleteStep') }}</button></div>
      <NodeConnectionSelector v-if="node.nodeType === 'IMAGE_GENERATION' || node.nodeType === 'UPSCALE'" :node-id="node.nodeId" :node-type="node.nodeType" :config="node.config" @apply="applyValues" @update-config="(key, value) => applyValues({ [key]: value }, node.nodeId)" />
      <StructuredMappingEditor v-if="node.nodeType === 'TEMPLATE_TRANSFORM' && node.config.transformMode === 'structured'" :node-id="node.nodeId" :config="node.config" @apply="applyValues" />
      <label v-for="field in fields(node)" :key="field.name" class="block text-xs"><span>{{ field.name }}{{ field.required ? ' *' : '' }}</span>
        <select v-if="field.options?.length" class="mt-1 w-full rounded border p-2" :value="value(node, field)" @change="change(index, field, $event)"><option v-for="option in field.options" :key="String(option)" :value="option">{{ option }}</option></select>
        <input v-else-if="field.type === 'BOOLEAN'" type="checkbox" :checked="Boolean(value(node, field))" @change="change(index, field, $event)" />
        <textarea v-else-if="isJsonField(field)" class="mt-1 w-full rounded border p-2 font-mono" :value="displayDraft(node, field)" @change="change(index, field, $event)" />
        <input v-else class="mt-1 w-full rounded border p-2" :type="field.type === 'NUMBER' || field.type === 'INTEGER' ? 'number' : 'text'" :value="value(node, field)" @input="change(index, field, $event)" />
        <span v-if="jsonDrafts[`${node.nodeId}:${field.name}`]" class="text-status-error" role="alert">{{ draftErrorMessage(node, field) }}</span>
      </label>
    </article>
    <div class="flex gap-2"><select v-model="selectedType" :aria-label="t('workflow.inspector.loopEditor.nodeType')" class="min-w-0 flex-1 rounded border p-2 text-xs"><option v-for="item in available" :key="item.type ?? item.nodeType" :value="item.type ?? item.nodeType">{{ item.displayName ?? item.type }}</option></select><button type="button" data-test="add-body-node" class="rounded bg-primary px-3 py-2 text-xs text-white" :disabled="nodes.length >= 100 || !available.length" @click="add">{{ t('workflow.inspector.loopEditor.addStep') }}</button></div>
  </section>
</template>
