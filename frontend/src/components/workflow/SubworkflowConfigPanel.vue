<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { listDefinitions, listDefinitionVersions, type WorkflowDefinitionEntity, type WorkflowVersionSummary } from '@/api/modules/workflow'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [name: string, value: unknown] }>()
const definitions = ref<WorkflowDefinitionEntity[]>([])
const versions = ref<WorkflowVersionSummary[]>([])
const error = ref('')
const loadingVersions = ref(false)
const mappingErrors = ref<Record<string, string>>({})
const drafts = ref<Record<string, string>>({})
let active = true
let generation = 0
let request: AbortController | null = null
const definitionId = computed(() => Number(props.config.definitionId) || 0)
const selectedVersion = computed(() => Number(props.config.definitionVersion) || 0)
const fields = [
  { name: 'inputMappings', label: '输入映射', hint: '子输入变量名 → 父变量路径，例如 {"text":"request.text"}' },
  { name: 'outputMappings', label: '输出映射', hint: '父输出变量名 → 子变量路径，例如 {"answer":"result.items[0].text"}' },
]

onMounted(async () => {
  try {
    const data = await listDefinitions()
    if (active) definitions.value = data
  } catch {
    if (active) error.value = '无法读取工作流列表，请稍后重新打开节点'
  }
})
onBeforeUnmount(() => { active = false; generation++; request?.abort() })
watch(definitionId, async (id) => {
  const token = ++generation
  request?.abort()
  request = new AbortController()
  versions.value = []
  loadingVersions.value = false
  if (!id) return
  loadingVersions.value = true
  try {
    const data = await listDefinitionVersions(id, request.signal)
    if (token !== generation || !active) return
    versions.value = data
    error.value = data.length ? '' : '该工作流还没有可调用的不可变版本'
  } catch {
    if (token === generation && active) error.value = '无法读取版本；已选择的版本号保持不变'
  } finally {
    if (token === generation && active) loadingVersions.value = false
  }
}, { immediate: true })

function selectDefinition(event: Event) {
  const id = Number((event.target as HTMLSelectElement).value)
  if (id === definitionId.value) return
  emit('update', 'definitionVersion', 0)
  emit('update', 'definitionId', id)
}
function selectVersion(event: Event) {
  emit('update', 'definitionVersion', Number((event.target as HTMLSelectElement).value))
}
function mappingText(name: string) {
  return drafts.value[name] ?? JSON.stringify(props.config[name] ?? {}, null, 2)
}
function updateMapping(name: string, event: Event) {
  const text = (event.target as HTMLTextAreaElement).value
  drafts.value[name] = text
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object'
      || Object.entries(parsed).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || !value.trim())) {
      throw new Error('请输入 JSON 对象，键为变量名，值为非空源变量路径')
    }
    delete mappingErrors.value[name]
    emit('update', name, parsed)
  } catch (cause) {
    mappingErrors.value[name] = cause instanceof Error ? cause.message : 'JSON 格式不正确'
  }
}
</script>

<template>
  <section class="space-y-5 p-5" aria-label="子工作流配置">
    <p class="rounded-lg border border-app-border p-3 text-sm text-text-secondary">运行时使用所选版本的不可变快照。后续编辑子工作流不会改变此调用；只传递下方显式映射的变量。</p>
    <label class="block text-sm font-semibold">工作流
      <select data-config-field="definitionId" class="mt-2 w-full rounded-lg border border-app-border p-2" :value="definitionId" @change="selectDefinition">
        <option :value="0">请选择工作流</option>
        <option v-if="definitionId && !definitions.some(item => item.id === definitionId)" :value="definitionId">已固定的定义 #{{ definitionId }}</option>
        <option v-for="item in definitions" :key="item.id" :value="item.id">{{ item.name }} (#{{ item.id }})</option>
      </select>
    </label>
    <label class="block text-sm font-semibold">固定版本
      <select data-config-field="definitionVersion" class="mt-2 w-full rounded-lg border border-app-border p-2" :disabled="!definitionId || loadingVersions" :value="selectedVersion" @change="selectVersion">
        <option :value="0">请选择固定版本</option>
        <option v-if="selectedVersion && !versions.some(item => item.version === selectedVersion)" :value="selectedVersion">v{{ selectedVersion }}（待验证）</option>
        <option v-for="item in versions" :key="item.version" :value="item.version">v{{ item.version }} · {{ item.createdAt ?? '' }}</option>
      </select>
    </label>
    <p v-if="error" role="alert" class="text-sm text-status-error">{{ error }}</p>
    <label v-for="field in fields" :key="field.name" class="block text-sm font-semibold">{{ field.label }}
      <textarea :data-config-field="field.name" class="mt-2 min-h-28 w-full rounded-lg border border-app-border p-2 font-mono text-xs" :value="mappingText(field.name)" @input="updateMapping(field.name, $event)" />
      <span class="mt-1 block text-xs font-normal text-text-secondary">{{ field.hint }}</span>
      <span v-if="mappingErrors[field.name]" role="alert" class="mt-1 block text-xs text-status-error">{{ mappingErrors[field.name] }}；暂未保存此输入</span>
    </label>
  </section>
</template>
