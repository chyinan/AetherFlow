<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { listDefinitions, listDefinitionVersions, type WorkflowDefinitionEntity, type WorkflowVersionSummary } from '@/api/modules/workflow'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [name: string, value: unknown]; patch: [values: Record<string, unknown>] }>()
const definitions = ref<WorkflowDefinitionEntity[]>([])
const versions = ref<WorkflowVersionSummary[]>([])
const definitionsError = ref('')
const versionsError = ref('')
const loadingDefinitions = ref(false)
const loadingVersions = ref(false)
const mappingErrors = ref<Record<string, string>>({})
const drafts = ref<Record<string, string>>({})
const pendingMappings = new Map<string, string>()
let active = true
let generation = 0
let request: AbortController | null = null
const definitionId = computed(() => Number(props.config.definitionId) || 0)
const selectedVersion = computed(() => Number(props.config.definitionVersion) || 0)
const fields = [
  { name: 'inputMappings', label: '输入映射', hint: '子输入变量名 → 父变量路径，例如 {"text":"request.text"}' },
  { name: 'outputMappings', label: '输出映射', hint: '父输出变量名 → 子变量路径，例如 {"answer":"result.items[0].text"}' },
]

for (const { name } of fields) {
  watch(() => JSON.stringify(props.config[name] ?? {}), (value) => {
    const isOwnUpdate = pendingMappings.get(name) === value
    pendingMappings.delete(name)
    // 自身保存回传保留输入格式与选区；撤销、重做等外部变更仅清除对应映射草稿。
    if (isOwnUpdate) return
    delete drafts.value[name]
    delete mappingErrors.value[name]
  })
}

async function loadDefinitions() {
  if (loadingDefinitions.value) return
  loadingDefinitions.value = true
  definitionsError.value = ''
  try {
    const data = await listDefinitions()
    if (active) definitions.value = data
  } catch {
    if (active) definitionsError.value = '无法读取工作流列表，请重试或稍后重新打开节点'
  } finally {
    if (active) loadingDefinitions.value = false
  }
}
onMounted(loadDefinitions)
onBeforeUnmount(() => { active = false; generation++; request?.abort() })
async function loadVersions(id: number) {
  const token = ++generation
  request?.abort()
  request = new AbortController()
  versions.value = []
  versionsError.value = ''
  loadingVersions.value = false
  if (!id) return
  loadingVersions.value = true
  try {
    const data = await listDefinitionVersions(id, request.signal)
    if (token !== generation || !active) return
    versions.value = data
    versionsError.value = data.length ? '' : '该工作流还没有可调用的不可变版本'
  } catch {
    if (token === generation && active) versionsError.value = '无法读取版本；已选择的版本号保持不变'
  } finally {
    if (token === generation && active) loadingVersions.value = false
  }
}
watch(definitionId, loadVersions, { immediate: true })

function selectDefinition(event: Event) {
  const id = Number((event.target as HTMLSelectElement).value)
  if (id === definitionId.value) return
  // 定义与版本属于同一个用户动作，只生成一条可完整恢复的历史记录。
  emit('patch', { definitionId: id, definitionVersion: 0 })
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
    pendingMappings.set(name, JSON.stringify(parsed))
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
      <select data-config-field="definitionId" class="mt-2 w-full rounded-lg border border-app-border p-2" :disabled="loadingDefinitions" :value="definitionId" @change="selectDefinition">
        <option :value="0">请选择工作流</option>
        <option v-if="definitionId && !definitions.some(item => item.id === definitionId)" :value="definitionId">已固定的定义 #{{ definitionId }}</option>
        <option v-for="item in definitions" :key="item.id" :value="item.id">{{ item.name }} (#{{ item.id }})</option>
      </select>
    </label>
    <p v-if="loadingDefinitions" role="status" class="text-sm text-text-secondary">正在读取工作流列表…</p>
    <div v-if="definitionsError" class="text-sm text-status-error">
      <p role="alert">{{ definitionsError }}</p>
      <button type="button" data-action="retry-definitions" :disabled="loadingDefinitions" @click="loadDefinitions">重试工作流列表</button>
    </div>
    <label class="block text-sm font-semibold">固定版本
      <select data-config-field="definitionVersion" class="mt-2 w-full rounded-lg border border-app-border p-2" :disabled="!definitionId || loadingVersions" :value="selectedVersion" @change="selectVersion">
        <option :value="0">请选择固定版本</option>
        <option v-if="selectedVersion && !versions.some(item => item.version === selectedVersion)" :value="selectedVersion">v{{ selectedVersion }}（待验证）</option>
        <option v-for="item in versions" :key="item.version" :value="item.version">v{{ item.version }} · {{ item.createdAt ?? '' }}</option>
      </select>
    </label>
    <p v-if="loadingVersions" role="status" class="text-sm text-text-secondary">正在读取版本…</p>
    <div v-if="versionsError" class="text-sm text-status-error">
      <p role="alert">{{ versionsError }}</p>
      <button type="button" data-action="retry-versions" :disabled="!definitionId || loadingVersions" @click="loadVersions(definitionId)">重试版本列表</button>
    </div>
    <label v-for="field in fields" :key="field.name" class="block text-sm font-semibold">{{ field.label }}
      <textarea :data-config-field="field.name" class="mt-2 min-h-28 w-full rounded-lg border border-app-border p-2 font-mono text-xs" :value="mappingText(field.name)" @input="updateMapping(field.name, $event)" />
      <span class="mt-1 block text-xs font-normal text-text-secondary">{{ field.hint }}</span>
      <span v-if="mappingErrors[field.name]" role="alert" class="mt-1 block text-xs text-status-error">{{ mappingErrors[field.name] }}；暂未保存此输入</span>
    </label>
  </section>
</template>
