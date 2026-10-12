<script setup lang="ts">
// pattern: Imperative Shell
import { computed, ref, watch } from 'vue'
import { defaultMapping, transformStructured, validateMapping, whisperPromptExample, type MappingSpec, type MappingValue } from '@/utils/structuredMapping'

const props = defineProps<{ nodeId: string; config: Record<string, unknown> }>()
const emit = defineEmits<{ apply: [values: Record<string, unknown>, nodeId: string] }>()
const draft = ref(defaultMapping())
const outputVariable = ref('mappedValue')
const sample = ref('{}')
const preview = ref('')
const previewError = ref('')
const applied = ref(false)
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
const inputClass = 'mt-1 w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-text-primary'
function editable(value: MappingValue): MappingValue { return { ...value, value: value.type === 'literal' ? JSON.stringify(value.value) : value.value } }
function load() {
  const base = defaultMapping()
  const stored = props.config.mapping && typeof props.config.mapping === 'object' && !Array.isArray(props.config.mapping)
    ? props.config.mapping as Partial<MappingSpec> : {}
  const merged = { ...base, ...cloneJson(stored) }
  draft.value = { ...merged, fields: (Array.isArray(merged.fields) ? merged.fields : base.fields).map((field) => ({ ...field, ...editable(field) })),
    value: editable(merged.value ?? base.value), filter: { ...base.filter, ...merged.filter, value: JSON.stringify(merged.filter?.value ?? '') } }
  outputVariable.value = String(props.config.outputVariable ?? 'mappedValue')
  applied.value = false; preview.value = ''; previewError.value = ''
}
watch(() => [props.nodeId, props.config.mapping, props.config.outputVariable], load, { immediate: true, deep: true })
watch([draft, outputVariable, sample], () => { preview.value = ''; previewError.value = ''; applied.value = false }, { deep: true })
function decoded(value: MappingValue): MappingValue {
  return { ...value, value: value.type === 'literal' ? JSON.parse(String(value.value)) : value.value }
}
function specification(): MappingSpec {
  const spec = cloneJson(draft.value)
  if (spec.operation === 'object' || spec.operation === 'map') {
    if (spec.operation === 'map' && spec.shape === 'value') spec.value = decoded(spec.value)
    else spec.fields = spec.fields.map((field) => ({ ...field, ...decoded(field) }))
  }
  if (spec.operation !== 'map' && spec.operation !== 'filter') spec.filter.enabled = false
  if (spec.filter.enabled && !['empty', 'notEmpty'].includes(spec.filter.operator)) spec.filter.value = JSON.parse(String(spec.filter.value))
  else spec.filter.value = ''
  // 未使用的草稿不进入持久配置，避免常量输入的文本形式污染契约。
  if (!(spec.operation === 'map' && spec.shape === 'value')) spec.value = { type: 'path', value: '$' }
  if (spec.operation === 'select' || spec.operation === 'filter' || (spec.operation === 'map' && spec.shape === 'value')) spec.fields = []
  validateMapping(spec)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(outputVariable.value.trim())) throw new Error('输出变量名只能使用字母、数字和下划线，且不能以数字开头')
  return spec
}
const configurationError = computed(() => { try { specification(); return '' } catch (error) { return error instanceof SyntaxError ? '固定值或筛选比较值必须是合法 JSON（文字需加双引号）' : (error as Error).message } })
function previewMapping() {
  previewError.value = ''; preview.value = ''
  try {
    if (sample.value.length > 1000000) throw new Error('预览输入最多 100 万字符')
    const input: unknown = JSON.parse(sample.value)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('预览输入必须是工作流变量 JSON 对象')
    preview.value = JSON.stringify(transformStructured(input as Record<string, unknown>, specification()), null, 2)
  } catch (error) { previewError.value = (error as Error).message }
}
function apply() {
  if (configurationError.value) return
  emit('apply', { transformMode: 'structured', mapping: specification(), outputVariable: outputVariable.value.trim() }, props.nodeId)
  applied.value = true
}
function useWhisperExample() {
  const example = whisperPromptExample()
  draft.value = { ...example.mapping, filter: { ...example.mapping.filter, value: JSON.stringify(example.mapping.filter.value) } }
  outputVariable.value = example.outputVariable
  sample.value = JSON.stringify(example.input, null, 2)
}
function setType(value: MappingValue) { value.value = value.type === 'literal' ? 'null' : value.type === 'template' ? '{{ text }}' : 'text' }
</script>

<template>
  <div class="space-y-4" data-testid="structured-mapping-editor">
    <div class="rounded-xl border border-primary/20 bg-primary-soft/60 p-3 text-sm leading-6">
      <p class="font-semibold">无代码结构化映射</p>
      <p>按字段路径读取 JSON，构造对象或逐项映射、筛选数组。支持 segments[0].text；$ 表示当前输入，数组内 $index 表示原始下标。</p>
      <p>先预览，再应用映射并保存工作流。示例输入只保留在当前面板，不会上传或保存。</p>
      <button type="button" class="mt-2 rounded-lg border border-primary px-3 py-1 text-primary" data-testid="whisper-example" @click="useWhisperExample">载入 Whisper segments → prompt 列表示例</button>
    </div>
    <label class="block text-sm font-semibold">操作
      <select v-model="draft.operation" :class="inputClass" data-testid="mapping-operation">
        <option value="select">提取字段</option><option value="object">构造 JSON 对象</option><option value="map">数组 map</option><option value="filter">数组 filter</option>
      </select>
    </label>
    <label class="block text-sm font-semibold">输入字段路径
      <input v-model="draft.sourcePath" :class="inputClass" placeholder="segments 或 response.data.items" data-testid="mapping-source" />
    </label>
    <label class="block text-sm font-semibold">字段缺失时
      <select v-model="draft.missingPolicy" :class="inputClass"><option value="error">停止并报告缺失路径</option><option value="null">使用 null（模板中为空文本）</option></select>
    </label>
    <label v-if="draft.operation === 'map'" class="block text-sm font-semibold">每项输出
      <select v-model="draft.shape" :class="inputClass" data-testid="mapping-shape"><option value="object">JSON 对象</option><option value="value">单个值（如 prompt 字符串）</option></select>
    </label>
    <div v-if="draft.operation === 'object' || (draft.operation === 'map' && draft.shape === 'object')" class="space-y-3">
      <div v-for="(field, index) in draft.fields" :key="index" class="rounded-lg border border-app-border p-3" data-testid="mapping-field">
        <label class="block text-sm">目标字段路径<input v-model="field.target" :class="inputClass" placeholder="prompt 或 timing.start" :aria-label="`目标字段 ${index + 1}`" /></label>
        <label class="mt-2 block text-sm">取值方式<select v-model="field.type" :class="inputClass" :aria-label="`取值方式 ${index + 1}`" @change="setType(field)"><option value="path">字段路径</option><option value="template">文本模板</option><option value="literal">JSON 固定值</option></select></label>
        <label class="mt-2 block text-sm">{{ field.type === 'literal' ? 'JSON 值' : field.type === 'template' ? '模板' : '来源路径' }}<textarea :value="String(field.value ?? '')" @input="field.value = ($event.target as HTMLTextAreaElement).value" :class="inputClass" rows="2" :aria-label="`字段值 ${index + 1}`" /></label>
        <button type="button" class="mt-2 text-sm text-status-error" :aria-label="`删除字段 ${index + 1}`" @click="draft.fields.splice(index, 1)">删除字段</button>
      </div>
      <button type="button" class="rounded-lg border border-app-border px-3 py-2 text-sm" :disabled="draft.fields.length >= 100" data-testid="add-mapping-field" @click="draft.fields.push({ target: '', type: 'path', value: 'text' })">添加字段</button>
    </div>
    <div v-if="draft.operation === 'map' && draft.shape === 'value'" class="rounded-lg border border-app-border p-3">
      <label class="block text-sm">取值方式<select v-model="draft.value.type" :class="inputClass" data-testid="mapping-value-type" @change="setType(draft.value)"><option value="path">字段路径</option><option value="template">文本模板</option><option value="literal">JSON 固定值</option></select></label>
      <label class="mt-2 block text-sm">映射值<textarea :value="String(draft.value.value ?? '')" @input="draft.value.value = ($event.target as HTMLTextAreaElement).value" :class="inputClass" rows="3" data-testid="mapping-value" /></label>
    </div>
    <fieldset v-if="draft.operation === 'map' || draft.operation === 'filter'" class="space-y-2 rounded-lg border border-app-border p-3">
      <legend class="text-sm font-semibold">数组筛选（在 map 前执行）</legend>
      <label class="flex items-center gap-2 text-sm"><input v-model="draft.filter.enabled" type="checkbox" data-testid="mapping-filter-enabled" />启用筛选</label>
      <template v-if="draft.filter.enabled">
        <label class="block text-sm">筛选字段<input v-model="draft.filter.path" :class="inputClass" data-testid="mapping-filter-path" /></label>
        <label class="block text-sm">条件<select v-model="draft.filter.operator" :class="inputClass" data-testid="mapping-filter-operator"><option value="notEmpty">非空</option><option value="empty">为空或缺失</option><option value="equals">等于</option><option value="notEquals">不等于</option><option value="contains">文本包含</option><option value="gt">大于</option><option value="gte">大于等于</option><option value="lt">小于</option><option value="lte">小于等于</option></select></label>
        <label v-if="!['empty', 'notEmpty'].includes(draft.filter.operator)" class="block text-sm">比较值（JSON）<input v-model="draft.filter.value" :class="inputClass" placeholder='数字 3 或文本 "hello"' data-testid="mapping-filter-value" /></label>
      </template>
    </fieldset>
    <label class="block text-sm font-semibold">输出变量<input v-model="outputVariable" :class="inputClass" data-testid="mapping-output-variable" /></label>
    <p v-if="configurationError" role="alert" class="text-sm text-status-error" data-testid="mapping-config-error">{{ configurationError }}</p>
    <button type="button" class="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50" :disabled="Boolean(configurationError)" data-testid="apply-mapping" @click="apply">应用映射</button>
    <p v-if="applied" class="text-sm text-status-success">已应用到节点，请保存工作流</p>
    <details open class="space-y-3 border-t border-app-border pt-3">
      <summary class="cursor-pointer text-sm font-semibold">输入 / 输出预览</summary>
      <label class="block text-sm">示例工作流变量（JSON 对象）<textarea v-model="sample" :class="[inputClass, 'font-mono']" rows="7" spellcheck="false" data-testid="mapping-preview-input" /></label>
      <button type="button" class="rounded-lg border border-app-border px-3 py-2 text-sm" data-testid="preview-mapping" @click="previewMapping">预览输出</button>
      <p v-if="previewError" role="alert" class="text-sm text-status-error" data-testid="mapping-preview-error">{{ previewError }}</p>
      <pre v-if="preview" class="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-app-muted p-3 text-xs" data-testid="mapping-preview-output">{{ preview }}</pre>
      <p class="text-xs text-text-muted">本地预览不调用模型。每个数组最多 1000 项，最多 100 个映射字段；后端执行时会再次校验。</p>
    </details>
  </div>
</template>
