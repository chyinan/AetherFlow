<script setup lang="ts">
// pattern: Imperative Shell
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  probeNodeConnection, probeSavedNodeConnection,
  type ImageCatalog, type ImageConnectionNodeType, type ImageConnectionProvider, type NodeConnection, type NodeConnectionProbe,
} from '@/api/modules/nodeConnections'
import { toApiError } from '@/api/client/apiError'
import { useNodeConnectionStore } from '@/stores/nodeConnectionStore'
import { nodeConnectionMessages } from './nodeConnectionMessages'
import { describeComfyGraph } from '@/utils/comfyWorkflow'
import { buildNodeConnectionChecklist, connectionCatalogOptions, isKnownConnectionCatalog, type ConnectionChecklistIssue } from './nodeConnectionChecklist'

const props = defineProps<{ nodeId: string; nodeType: ImageConnectionNodeType; config: Record<string, unknown> }>()
const emit = defineEmits<{
  apply: [connection: { connectionId: string | undefined; provider: ImageConnectionProvider }, nodeId: string]
  updateConfig: [key: string, value: unknown]
  saved: []
  locateConfig: [field: string, nodeId: string]
}>()
const { t } = useI18n({ useScope: 'local', messages: nodeConnectionMessages })
const connectionStore = useNodeConnectionStore()
const { connections, loading, ready, loadError, pendingSave, saveOutcome } = storeToRefs(connectionStore)
const listError = computed(() => loadError.value ? errorMessage(loadError.value) : '')
const selectedProbe = ref<NodeConnectionProbe | null>(null)
const selectedError = ref('')
const probing = ref(false)
const open = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', provider: 'COMFYUI' as ImageConnectionProvider, baseUrl: '' })
const formProbe = ref<NodeConnectionProbe | null>(null)
const formError = ref('')
type ValidationTarget = { field: 'name'; requireName: boolean } | { field: 'url' }
const validationTarget = shallowRef<ValidationTarget | null>(null)
const validationKey = computed(() => {
  const target = validationTarget.value
  if (target?.field === 'name') return validateName(target.requireName)
  if (target?.field === 'url') return validateUrl()
  return null
})
const validationMessage = computed(() => validationKey.value ? t(validationKey.value) : '')
const testing = ref(false)
const saving = computed(() => Boolean(pendingSave.value))
const nameInput = ref<HTMLInputElement | null>(null)
const urlInput = ref<HTMLInputElement | null>(null)
const selectorRoot = ref<HTMLElement | null>(null)
const refreshButton = ref<HTMLButtonElement | null>(null)
const cancelProbeButton = ref<HTMLButtonElement | null>(null)
const selectedCancelled = ref(false)
let selectedSequence = 0
let waitingForCatalog = false
let formSequence = 0
let alive = true
let opener: HTMLElement | null = null

function normalizeProvider(value: unknown): ImageConnectionProvider {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return props.nodeType === 'UPSCALE' ? 'COMFYUI' : 'STABLE_DIFFUSION_WEBUI'
  return normalized === 'COMFYUI' ? 'COMFYUI' : 'STABLE_DIFFUSION_WEBUI'
}
const provider = computed(() => normalizeProvider(props.config.provider))
const importedComfyApi = computed(() => describeComfyGraph(props.config.workflowJson ?? props.config.workflow).format === 'API')
const importedComfyApiNodeTypes = computed(() => {
  if (!importedComfyApi.value) return []
  const graph = describeComfyGraph(props.config.workflowJson ?? props.config.workflow)
  return [...new Set(graph.nodes.map(node => node.type))].sort()
})
const importedApi = computed(() => provider.value === 'COMFYUI' && importedComfyApi.value)
const importedGenerationApi = computed(() => props.nodeType === 'IMAGE_GENERATION' && importedApi.value)
const workflowNodeTypes = computed(() => importedApi.value ? [...new Set(describeComfyGraph(props.config.workflowJson ?? props.config.workflow).nodes.map(node => node.type))].sort() : [])
const connectionId = computed(() => String(props.config.connectionId ?? '').trim())
const effectiveId = computed(() => connectionId.value || (provider.value === 'COMFYUI' ? 'deployment-comfyui' : 'deployment-sd'))
const selectedConnection = computed(() => connections.value.find((connection) => connection.id === effectiveId.value))
const missingConnection = computed(() => ready.value && Boolean(connectionId.value) && !selectedConnection.value)
const confirmedConnectionProvider = computed(() => ready.value && connectionId.value ? selectedConnection.value?.provider : undefined)
const providerMismatch = computed(() => Boolean(confirmedConnectionProvider.value && confirmedConnectionProvider.value !== provider.value))
const modelCatalogProbe = computed(() => providerMismatch.value ? null : selectedProbe.value)
const selectedKey = computed(() => JSON.stringify([props.nodeId, props.nodeType, effectiveId.value, provider.value, props.config.checkpoint, props.config.mode, workflowNodeTypes.value]))
const modelFields = computed<Array<{ key: string; catalog: ImageCatalog }>>(() => props.nodeType === 'UPSCALE'
  ? (importedApi.value ? [] : [{ key: 'upscaler', catalog: 'upscalers' }])
  : [{ key: 'checkpoint', catalog: 'checkpoints' }, { key: 'vae', catalog: 'vaes' }, { key: 'sampler', catalog: 'samplers' }, { key: 'scheduler', catalog: 'schedulers' }])
const checkpointRequired = computed(() => props.nodeType === 'IMAGE_GENERATION' && Boolean(connectionId.value)
  && provider.value === 'COMFYUI' && !importedApi.value && !String(props.config.checkpoint ?? '').trim())
const loras = computed(() => Array.isArray(props.config.lora) ? props.config.lora : [])
const invalidLora = computed(() => props.config.lora != null && !Array.isArray(props.config.lora))
const externalChecklistFields = new Set(['mode', 'workflow', 'workflowJson'])
const probeCatalogs: ImageCatalog[] = ['checkpoints', 'vaes', 'loras', 'samplers', 'schedulers', 'upscalers']
const checklist = computed(() => buildNodeConnectionChecklist({ provider: provider.value, nodeType: props.nodeType, config: props.config, probe: selectedProbe.value, connectionProvider: confirmedConnectionProvider.value }))
const formChecklist = computed(() => buildNodeConnectionChecklist({
  provider: form.provider, nodeType: props.nodeType, config: { ...props.config, connectionId: editingId.value || 'new-connection' }, probe: formProbe.value,
}))

function errorMessage(cause: unknown) {
  return toApiError(cause, 'ai').message || t('failed')
}
const saveFeedback = computed(() => {
  if (pendingSave.value) return t('savePending', { name: pendingSave.value.name })
  const outcome = saveOutcome.value
  if (!outcome) return ''
  if (outcome.status === 'failed') return t('saveFailed', { name: outcome.name, error: errorMessage(outcome.cause) })
  if (outcome.applied) return ''
  return t(outcome.edited ? 'updatedWithoutApply' : 'savedWithoutApply', { name: outcome.connection.name })
})
function knownCatalog(catalog: ImageCatalog, result = modelCatalogProbe.value) {
  return isKnownConnectionCatalog(result, catalog)
}
function options(catalog: ImageCatalog, result = modelCatalogProbe.value) {
  return connectionCatalogOptions(result, catalog)
}
function fieldId(field: string, index?: number) { return `node-connection-${props.nodeId}-${field}${index === undefined ? '' : `-${index}`}` }
function issueLabel(issue: ConnectionChecklistIssue) {
  return `${t(issue.field === 'connectionId' ? 'connection' : issue.field)}${issue.loraIndex === undefined ? '' : ` ${issue.loraIndex + 1}`}`
}
function issueMessage(issue: ConnectionChecklistIssue) {
  return t(`checklistReason.${issue.reason}`, { field: issueLabel(issue), value: issue.value ?? '' })
}
function issueTarget(issue: ConnectionChecklistIssue) {
  return !connectionId.value && issue.field !== 'connectionId' && !externalChecklistFields.has(issue.field) ? 'connectionId' : issue.field
}
function locateIssue(issue: ConnectionChecklistIssue) {
  if (!checklist.value.includes(issue)) return
  const field = issueTarget(issue)
  if (externalChecklistFields.has(field)) { emit('locateConfig', field, props.nodeId); return }
  const id = fieldId(field, field === 'lora' ? issue.loraIndex : undefined)
  const target = Array.from(selectorRoot.value?.querySelectorAll<HTMLElement>('[id]') ?? []).find((item) => item.id === id)
  target?.scrollIntoView?.({ block: 'nearest' })
  target?.focus()
}
function applySuggestion(issue: ConnectionChecklistIssue) {
  // 点击时再校验当前清单，拒绝重测、切换节点或改配置前遗留的按钮。
  if (!alive || open.value || probing.value || !connectionId.value || !checklist.value.includes(issue) || !issue.suggestion) return
  locateIssue(issue)
  if (issue.field === 'lora' && issue.loraIndex !== undefined) updateLora(issue.loraIndex, 'name', issue.suggestion)
  else emit('updateConfig', issue.field, issue.suggestion)
}
function syncConnectionProvider(issue: ConnectionChecklistIssue) {
  const connection = selectedConnection.value
  if (!alive || open.value || probing.value || !connectionId.value || !connection
    || issue.reason !== 'providerMismatch' || !checklist.value.includes(issue)) return
  locateIssue(issue)
  emit('apply', { connectionId: connection.id, provider: connection.provider }, props.nodeId)
}
function finishSelectedProbe() {
  const anchor = document.activeElement === cancelProbeButton.value ? selectorRoot.value : null
  const sequence = selectedSequence
  // 先把焦点留在面板内，取消按钮卸载后再聚焦已启用的重测按钮。
  anchor?.focus({ preventScroll: true })
  probing.value = false
  if (!anchor) return
  void nextTick(() => {
    const retry = refreshButton.value
    if (alive && !open.value && sequence === selectedSequence && document.activeElement === anchor && retry && !retry.disabled) {
      retry.focus({ preventScroll: true })
    }
  })
}
function cancelSelectedProbe() {
  waitingForCatalog = false
  selectedSequence += 1
  selectedProbe.value = null
  selectedError.value = ''
  selectedCancelled.value = true
  finishSelectedProbe()
}
function currentValue(key: string) { return String(props.config[key] ?? '') }
function unsupported(key: string, catalog: ImageCatalog) {
  return Boolean(currentValue(key)) && !options(catalog).includes(currentValue(key))
}
function loraName(item: unknown) {
  return typeof item === 'object' && item !== null && 'name' in item ? String(item.name ?? '') : String(item ?? '')
}
function loraWeight(item: unknown) {
  return typeof item === 'object' && item !== null && 'weight' in item ? item.weight : 1
}
function updateLora(index: number, field: 'name' | 'weight', value: string) {
  const next = loras.value.map((item, itemIndex) => itemIndex === index
    ? { ...(typeof item === 'object' && item !== null ? item : { name: loraName(item) }), [field]: field === 'weight' ? (value === '' ? '' : Number(value)) : value }
    : item)
  emit('updateConfig', 'lora', next)
}
function addLora() {
  emit('updateConfig', 'lora', [...loras.value, { name: '', weight: 1 }])
}
function invalidateForm() {
  formSequence += 1
  formProbe.value = null
  formError.value = ''
  testing.value = false
}
function close(restoreFocus = true) {
  // 只在关闭当前弹窗时归还焦点；保存中打开按钮禁用时回到连接面板。
  const returnTo = restoreFocus && open.value ? (saving.value ? selectorRoot.value : opener) : null
  opener = null
  open.value = false
  invalidateForm()
  validationTarget.value = null
  editingId.value = null
  form.name = ''
  form.baseUrl = ''
  form.provider = provider.value
  returnTo?.focus()
}
async function showWizard(connection?: NodeConnection) {
  if (!alive || saving.value) return
  close(false)
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  editingId.value = connection?.id ?? null
  form.name = connection?.name ?? ''
  form.provider = connection?.provider ?? provider.value
  form.baseUrl = connection?.baseUrl ?? ''
  open.value = true
  await nextTick()
  if (open.value) nameInput.value?.focus()
}
function validateName(requireName: boolean) {
  if (requireName && !form.name.trim()) return 'requiredName'
  if (form.name.trim().length > 80) return 'nameTooLong'
  return null
}
function validateUrl() {
  try {
    const url = new URL(form.baseUrl.trim())
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return 'invalidUrl'
  } catch { return 'invalidUrl' }
  return null
}
function validateForm(requireName: boolean) {
  const target: ValidationTarget | null = validateName(requireName) ? { field: 'name', requireName }
    : validateUrl() ? { field: 'url' } : null
  validationTarget.value = target
  if (!target) return true
  const previousFocus = document.activeElement
  // 先更新错误描述，再定位字段；关闭或另有焦点操作时不抢焦点。
  void nextTick(() => {
    if (!open.value || target !== validationTarget.value || previousFocus !== document.activeElement) return
    const field = target.field === 'name' ? nameInput.value : urlInput.value
    field?.focus()
  })
  return false
}
async function testForm() {
  // 测试按钮在请求期间保留焦点；拦截键盘或指针的重复激活。
  if (!alive || !open.value || testing.value || saving.value) return
  invalidateForm()
  if (!validateForm(false)) return
  const sequence = formSequence
  const nodeId = props.nodeId
  testing.value = true
  try {
    const graphTypes = form.provider === 'COMFYUI' ? importedComfyApiNodeTypes.value : []
    const result = await probeNodeConnection({ provider: form.provider, baseUrl: form.baseUrl.trim(), ...(graphTypes.length ? { workflowNodeTypes: graphTypes } : { nodeType: props.nodeType }) })
    if (alive && open.value && sequence === formSequence && nodeId === props.nodeId) formProbe.value = result
  } catch (cause) {
    if (alive && open.value && sequence === formSequence && nodeId === props.nodeId) formError.value = errorMessage(cause)
  } finally {
    if (alive && sequence === formSequence) testing.value = false
  }
}
async function save() {
  if (!alive || !open.value || saving.value || testing.value || formProbe.value?.status !== 'usable') return
  formError.value = ''
  if (!validateForm(true)) return
  const sequence = formSequence
  const nodeId = props.nodeId
  const payload = { name: form.name.trim(), provider: form.provider, baseUrl: form.baseUrl.trim(), ...(form.provider === 'COMFYUI' && importedComfyApiNodeTypes.value.length ? { workflowNodeTypes: importedComfyApiNodeTypes.value } : {}) }
  const id = editingId.value
  try {
    const connection = await connectionStore.saveConnection(payload, id)
    // 目录保存已完成；仅仍有效的原向导可以把连接应用到它发起时的节点。
    if (!connection || !alive || !open.value || sequence !== formSequence || nodeId !== props.nodeId) return
    emit('apply', { connectionId: connection.id, provider: connection.provider }, nodeId)
    connectionStore.markApplied(connection.id)
    close()
  } catch (cause) {
    if (alive && open.value && sequence === formSequence && nodeId === props.nodeId) formError.value = errorMessage(cause)
  }
}
async function refreshSelected() {
  const sequence = ++selectedSequence
  const key = selectedKey.value
  selectedProbe.value = null
  selectedError.value = ''
  selectedCancelled.value = false
  probing.value = false
  waitingForCatalog = !ready.value || missingConnection.value
  if (waitingForCatalog) return
  probing.value = true
  try {
    // 节点可能仍保留共享连接更新前的 Provider；不要用旧配置探测另一种服务的图或模型。
    const checkpoint = props.nodeType === 'IMAGE_GENERATION' && !importedApi.value && !providerMismatch.value
      ? String(props.config.checkpoint ?? '').trim() : ''
    const result = workflowNodeTypes.value.length && !providerMismatch.value
      ? await probeSavedNodeConnection(effectiveId.value, undefined, undefined, workflowNodeTypes.value)
      : await probeSavedNodeConnection(effectiveId.value, props.nodeType, checkpoint || undefined)
    if (alive && sequence === selectedSequence && key === selectedKey.value) selectedProbe.value = result
  } catch (cause) {
    if (alive && sequence === selectedSequence && key === selectedKey.value) selectedError.value = errorMessage(cause)
  } finally {
    if (alive && sequence === selectedSequence) finishSelectedProbe()
  }
}
function loadConnections(shared = false) {
  waitingForCatalog = true
  selectedSequence += 1
  selectedProbe.value = null
  selectedError.value = ''
  selectedCancelled.value = false
  probing.value = false
  if (shared) void connectionStore.loadSharedConnections()
  else void connectionStore.loadConnections()
  // 挂载恰好赶上共享读取发布时，已有目录可直接用，不必等待下一次就绪变化。
  if (ready.value) void refreshSelected()
}
function chooseConnection(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  close()
  if (!id) { emit('apply', { connectionId: undefined, provider: provider.value }, props.nodeId); return }
  const connection = connections.value.find((item) => item.id === id)
  if (connection) {
    emit('apply', { connectionId: connection.id, provider: connection.provider }, props.nodeId)
    connectionStore.markApplied(connection.id)
  }
}
function chooseDefaultProvider(event: Event) {
  close()
  emit('apply', { connectionId: undefined, provider: normalizeProvider((event.target as HTMLSelectElement).value) }, props.nodeId)
}
function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    // 先让输入法取消候选；组合结束后，仍按住的同一个 Escape 不应丢弃草稿。
    if (event.isComposing || event.keyCode === 229 || event.repeat) return
    event.preventDefault()
    close()
    return
  }
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
    // 不触发背后画布的撤销或重做，保留输入框的原生默认行为。
    event.stopPropagation()
    return
  }
  if (event.key !== 'Tab') return
  const targets = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
  const first = targets[0]
  const last = targets[targets.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
// 字段改正后不在后续输入中重新弹出，除非用户再次触发本地校验。
watch(validationKey, (key) => { if (!key) validationTarget.value = null }, { flush: 'sync' })
watch(() => [form.provider, form.baseUrl], () => { if (open.value) invalidateForm() }, { flush: 'sync' })
// 目录就绪属于共享读取，不属于最后发起读取的面板；仅补齐仍在等待的诊断。
watch(ready, (loaded) => { if (loaded && waitingForCatalog) void refreshSelected() })
watch(() => [props.nodeId, props.nodeType], () => { close(false); loadConnections(true) }, { immediate: true, flush: 'sync' })
watch(selectedKey, () => { close(false); void refreshSelected() }, { flush: 'sync' })
watch(saveOutcome, (outcome) => {
  if (outcome?.status !== 'saved') return
  emit('saved')
  // 同 ID 编辑也要刷新当前探测；保存期间换到该连接的节点同样需要新目录。
  if (outcome.connection.id === effectiveId.value) void refreshSelected()
})
onBeforeUnmount(() => { alive = false; selectedSequence += 1; close(false) })
</script>

<template>
  <section ref="selectorRoot" :aria-label="t('connection')" tabindex="-1" class="space-y-4 rounded-xl border border-app-border bg-app-bg2 p-4" data-testid="node-connection">
    <label class="block text-sm font-semibold text-text-primary">
      {{ t('connection') }}
      <select :id="fieldId('connectionId')" data-config-field="connectionId" data-testid="connection-select" class="mt-2 w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm" :value="connectionId" :disabled="loading" @change="chooseConnection">
        <option value="">{{ t('defaultConnection') }}</option>
        <option v-if="connectionId && !selectedConnection" :value="connectionId">{{ connectionId }}</option>
        <option v-for="connection in connections" :key="connection.id" :value="connection.id">{{ connection.name }}{{ connection.readOnly ? ` · ${t('readonly')}` : '' }}</option>
      </select>
    </label>
    <label v-if="!connectionId" class="block text-xs text-text-secondary">
      {{ t('defaultProvider') }}
      <select :id="fieldId('provider')" data-config-field="provider" data-testid="default-provider" class="mt-1 w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm" :value="provider" @change="chooseDefaultProvider">
        <option value="COMFYUI">ComfyUI</option><option value="STABLE_DIFFUSION_WEBUI">Stable Diffusion WebUI</option>
      </select>
    </label>
    <p class="text-xs leading-5 text-text-muted">{{ t('deploymentHint') }}</p>
    <p v-if="selectedConnection" class="break-all text-xs text-text-secondary">{{ selectedConnection.provider }} · {{ selectedConnection.baseUrl }}</p>
    <div class="flex flex-wrap gap-2">
      <button data-testid="add-connection" type="button" class="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="saving" @click="showWizard()">{{ t('add') }}</button>
      <button v-if="selectedConnection && !selectedConnection.readOnly" data-testid="edit-connection" type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 text-xs disabled:opacity-50" :disabled="saving" @click="showWizard(selectedConnection)">{{ t('edit') }}</button>
      <button ref="refreshButton" data-testid="refresh-connection" type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 text-xs disabled:opacity-50" :disabled="probing || loading" @click="loadConnections()">{{ probing ? t('testing') : t('refresh') }}</button>
      <button v-if="probing" ref="cancelProbeButton" data-testid="cancel-current-test" type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 text-xs" @click="cancelSelectedProbe">{{ t('cancelTest') }}</button>
    </div>
    <p v-if="loading" role="status" class="text-xs text-text-muted">{{ t('loading') }}</p>
    <p v-if="saveFeedback" data-testid="connection-save-status" :role="saveOutcome?.status === 'failed' ? 'alert' : 'status'" class="text-xs leading-5" :class="saveOutcome?.status === 'failed' ? 'text-status-error' : 'text-text-secondary'">{{ saveFeedback }}</p>
    <p v-if="selectedCancelled" role="status" class="text-xs text-text-muted">{{ t('testCancelled') }}</p>
    <p v-if="listError" role="alert" class="text-xs text-status-error">{{ listError }}</p>
    <p v-if="missingConnection" data-testid="missing-connection" role="alert" class="text-xs leading-5 text-status-error">{{ t('missingConnection') }}</p>
    <p v-if="selectedError" role="alert" class="text-xs text-status-error">{{ t('requestFailed') }}: {{ selectedError }}</p>
    <!-- 与新增／编辑向导一致：先挂载状态区，只播报结果标题和说明。 -->
    <div
      :data-testid="selectedProbe ? 'selected-status' : undefined"
      :class="selectedProbe ? ['space-y-1 text-xs leading-5', selectedProbe.status === 'usable' ? 'text-status-success' : 'text-status-warning'] : 'sr-only'"
    >
      <div role="status" aria-atomic="true" class="space-y-1" data-testid="selected-probe-announcement">
        <template v-if="selectedProbe">
          <p class="font-semibold">{{ t(`status.${selectedProbe.status}`) }}</p>
          <p>{{ selectedProbe.message }}</p>
        </template>
      </div>
      <template v-if="selectedProbe">
        <p class="text-text-muted">{{ t('backend') }}</p>
        <p v-for="warning in selectedProbe.warnings" :key="warning" class="text-status-warning">{{ warning }}</p>
      </template>
    </div>
    <section v-if="selectedProbe || providerMismatch" data-testid="connection-checklist" class="space-y-3 rounded-lg border border-app-border bg-white p-3" :aria-labelledby="fieldId('checklist-title')">
      <h3 :id="fieldId('checklist-title')" class="text-sm font-semibold text-text-primary">{{ t('checklistTitle') }}</h3>
      <p class="text-xs leading-5 text-text-muted">{{ t('checklistScope') }}</p>
      <p v-if="!checklist.length" data-testid="checklist-clear" role="status" class="text-xs text-status-success">{{ t('checklistClear') }}</p>
      <ul v-else class="space-y-3" aria-live="polite">
        <li v-for="issue in checklist" :key="issue.id" :data-testid="`checklist-${issue.id}`" class="space-y-2 text-xs leading-5">
          <p class="break-words text-status-warning">{{ issueMessage(issue) }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" :data-testid="`locate-${issue.id}`" class="rounded border border-app-border px-2 py-1 text-text-primary" :aria-controls="externalChecklistFields.has(issue.field) ? undefined : fieldId(issueTarget(issue), issueTarget(issue) === 'lora' ? issue.loraIndex : undefined)" @click="locateIssue(issue)">{{ issueTarget(issue) !== issue.field ? t('chooseConnectionFirst') : t('locateField', { field: issueLabel(issue) }) }}</button>
            <button v-if="issue.reason === 'providerMismatch'" type="button" data-testid="sync-connection-provider" class="rounded border border-primary px-2 py-1 text-primary disabled:opacity-50" :disabled="probing || open" @click="syncConnectionProvider(issue)">{{ t('syncProvider') }}</button>
            <button v-if="issue.suggestion && connectionId" type="button" :data-testid="`apply-${issue.id}`" class="break-all rounded border border-primary px-2 py-1 text-primary disabled:opacity-50" :disabled="probing || open" @click="applySuggestion(issue)">{{ t('applyDiscovered', { value: issue.suggestion }) }}</button>
          </div>
        </li>
      </ul>
    </section>
    <p v-if="checkpointRequired && !providerMismatch" data-testid="checkpoint-required" role="alert" class="text-xs text-status-warning">{{ t('checkpointRequired') }}</p>
    <fieldset :disabled="providerMismatch" class="min-w-0 space-y-3 border-t border-app-border pt-3">
      <legend class="sr-only">{{ t('choices') }}</legend>
      <p class="text-sm font-semibold text-text-primary" aria-hidden="true">{{ t('choices') }}</p>
      <p v-if="!connectionId" data-testid="legacy-model-hint" class="text-xs leading-5 text-text-muted">{{ t('selectConnectionForModels') }}</p>
      <p v-if="importedGenerationApi" data-testid="imported-api-model-hint" data-config-field="lora" tabindex="-1" class="text-xs leading-5 text-text-muted">{{ t('importedApiModelHint') }}</p>
      <label v-for="field in modelFields" :key="field.key" class="block text-xs font-medium text-text-primary">
        {{ t(field.key) }}
        <select :id="fieldId(field.key)" :data-config-field="field.key" :data-testid="`model-${field.key}`" class="mt-1 w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm" :disabled="!connectionId" :value="currentValue(field.key)" @change="emit('updateConfig', field.key, ($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('emptyOption') }}</option>
          <option v-if="unsupported(field.key, field.catalog)" :value="currentValue(field.key)">{{ currentValue(field.key) }} (?)</option>
          <option v-for="option in options(field.catalog)" :key="option" :value="option">{{ option }}</option>
        </select>
        <span v-if="!providerMismatch && unsupported(field.key, field.catalog)" class="mt-1 block font-normal leading-5 text-status-warning" :data-testid="`unsupported-${field.key}`">{{ t('retained', { value: currentValue(field.key) }) }}</span>
        <template v-if="!providerMismatch">
          <span v-if="!knownCatalog(field.catalog)" class="mt-1 block font-normal text-text-muted">{{ selectedProbe ? t('unknownCatalog') : t('notTested') }}</span>
          <span v-else-if="!options(field.catalog).length" class="mt-1 block font-normal text-text-muted">{{ t('emptyCatalog') }}</span>
        </template>
      </label>
      <div v-if="nodeType === 'IMAGE_GENERATION' && !importedGenerationApi" :id="fieldId('lora')" data-config-field="lora" tabindex="-1" class="space-y-2 text-xs">
        <p class="font-medium text-text-primary">{{ t('lora') }}</p>
        <p v-if="invalidLora" role="alert" class="break-all text-status-warning">{{ t('retained', { value: JSON.stringify(config.lora) }) }}</p>
        <div v-for="(item, index) in loras" :key="index" class="space-y-2 rounded-lg border border-app-border bg-white p-2">
          <select :id="fieldId('lora', index)" :data-config-field="`lora.${index}.name`" :aria-label="`${t('lora')} ${index + 1}`" class="w-full rounded border border-app-border p-2" :disabled="!connectionId" :value="loraName(item)" @change="updateLora(index, 'name', ($event.target as HTMLSelectElement).value)">
            <option value="">{{ t('emptyOption') }}</option>
            <option v-if="loraName(item) && !options('loras').includes(loraName(item))" :value="loraName(item)">{{ loraName(item) }} (?)</option>
            <option v-for="option in options('loras')" :key="option" :value="option">{{ option }}</option>
          </select>
          <div class="flex items-center gap-2">
            <label class="flex min-w-0 items-center gap-2">{{ t('weight') }}<input :data-config-field="`lora.${index}.weight`" type="number" step="0.05" class="w-20 rounded border border-app-border p-1" :disabled="!connectionId" :value="String(loraWeight(item))" @input="updateLora(index, 'weight', ($event.target as HTMLInputElement).value)" /></label>
            <button type="button" class="ml-auto text-status-error disabled:opacity-50" :disabled="!connectionId" @click="emit('updateConfig', 'lora', loras.filter((_, itemIndex) => itemIndex !== index))">{{ t('remove') }}</button>
          </div>
          <p v-if="!providerMismatch && loraName(item) && !options('loras').includes(loraName(item))" class="text-status-warning">{{ t('retained', { value: loraName(item) }) }}</p>
        </div>
        <template v-if="!providerMismatch">
          <p v-if="!knownCatalog('loras')" class="text-text-muted">{{ selectedProbe ? t('unknownCatalog') : t('notTested') }}</p>
          <p v-else-if="!options('loras').length" class="text-text-muted">{{ t('emptyCatalog') }}</p>
        </template>
        <button type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 disabled:opacity-50" :disabled="invalidLora || !connectionId" @click="addLora">{{ t('addLora') }}</button>
      </div>
    </fieldset>
    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-[150] grid place-items-center overflow-y-auto bg-slate-950/55 p-4" @click.self="close()">
        <section role="dialog" aria-modal="true" :aria-labelledby="`connection-title-${nodeId}`" class="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-app-border bg-white p-5 shadow-panel" data-testid="connection-dialog" @keydown="handleDialogKeydown">
          <div class="flex items-center justify-between gap-3"><h2 :id="`connection-title-${nodeId}`" class="text-base font-semibold">{{ editingId ? t('editTitle') : t('addTitle') }}</h2><button type="button" :aria-label="t('close')" class="rounded p-2 text-text-muted" @click="close()">×</button></div>
          <p class="text-sm leading-6 text-text-secondary">{{ t('addressHint') }}</p>
          <p v-if="editingId" class="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-status-warning">{{ t('editShared') }}</p>
          <label class="block text-sm font-medium">{{ t('name') }}<input ref="nameInput" v-model="form.name" data-testid="connection-name" :aria-invalid="validationTarget?.field === 'name' || undefined" :aria-describedby="validationTarget?.field === 'name' ? fieldId('wizard-error') : undefined" class="mt-1 w-full rounded-lg border border-app-border px-3 py-2" :disabled="saving" maxlength="80" /></label>
          <p v-if="validationTarget?.field === 'name'" :id="fieldId('wizard-error')" data-testid="form-error" role="alert" class="text-sm text-status-error">{{ validationMessage }}</p>
          <label class="block text-sm font-medium">{{ t('provider') }}<select v-model="form.provider" data-testid="connection-provider" class="mt-1 w-full rounded-lg border border-app-border px-3 py-2" :disabled="saving"><option value="COMFYUI">ComfyUI</option><option value="STABLE_DIFFUSION_WEBUI">Stable Diffusion WebUI</option></select></label>
          <label class="block text-sm font-medium">{{ t('url') }}<input ref="urlInput" v-model="form.baseUrl" data-testid="connection-url" :aria-invalid="validationTarget?.field === 'url' || undefined" :aria-describedby="validationTarget?.field === 'url' ? fieldId('wizard-error') : undefined" type="url" placeholder="http://service-host:8188" class="mt-1 w-full rounded-lg border border-app-border px-3 py-2" :disabled="saving" autocomplete="off" spellcheck="false" /></label>
          <p v-if="validationTarget?.field === 'url'" :id="fieldId('wizard-error')" data-testid="form-error" role="alert" class="text-sm text-status-error">{{ validationMessage }}</p>
          <p class="text-xs leading-5 text-text-muted">{{ t('noCredentials') }}</p><p class="text-xs leading-5 text-text-muted">{{ t('scope') }}</p>
          <p v-if="saving" role="status" class="text-xs leading-5 text-text-secondary">{{ t('savePending', { name: pendingSave?.name }) }}</p>
          <p v-if="formError" data-testid="form-error" role="alert" class="text-sm text-status-error">{{ formError }}</p>
          <!-- 状态区先挂载，只播报结果标题和说明；详细目录和清单仍可按需查看。 -->
          <div :data-testid="formProbe ? 'form-status' : undefined" :class="formProbe ? 'space-y-2 rounded-lg bg-app-bg2 p-3 text-xs leading-5' : 'sr-only'">
            <div role="status" aria-atomic="true" class="space-y-2">
              <template v-if="formProbe">
                <p class="font-semibold" :class="formProbe.status === 'usable' ? 'text-status-success' : 'text-status-warning'">{{ t(`status.${formProbe.status}`) }}</p>
                <p>{{ formProbe.message }}</p>
              </template>
            </div>
            <template v-if="formProbe">
              <p class="text-text-muted">{{ t('backend') }}</p>
              <p v-for="warning in formProbe.warnings" :key="warning" class="text-status-warning">{{ warning }}</p>
              <div data-testid="form-checklist" class="space-y-1 border-t border-app-border pt-2">
                <p class="font-semibold">{{ t('checklistTitle') }}</p>
                <p v-for="issue in formChecklist" :key="issue.id" class="text-status-warning">{{ issueMessage(issue) }}</p>
                <p v-if="!formChecklist.length">{{ t('checklistClear') }}</p>
                <p class="text-text-muted">{{ t('formChecklistHint') }}</p>
              </div>
              <p class="font-semibold">{{ t('discovered') }}</p>
              <p v-for="catalog in probeCatalogs" :key="catalog" class="break-words">{{ t(({ checkpoints: 'checkpoint', vaes: 'vae', loras: 'lora', samplers: 'sampler', schedulers: 'scheduler', upscalers: 'upscaler' })[catalog]) }}: {{ !knownCatalog(catalog, formProbe) ? t('unknownCatalog') : options(catalog, formProbe).join(', ') || t('emptyCatalog') }}</p>
            </template>
          </div>
          <p v-if="formProbe?.status !== 'usable'" class="text-xs text-text-muted">{{ t('testRequired') }}</p>
          <div class="flex flex-wrap justify-end gap-2 border-t border-app-border pt-4">
            <button data-testid="cancel-connection" type="button" class="rounded-lg border border-app-border px-3 py-2 text-sm" @click="close()">{{ saving ? t('closeWhileSaving') : t('cancel') }}</button>
            <button data-testid="test-connection" type="button" class="rounded-lg border border-primary px-3 py-2 text-sm text-primary disabled:opacity-50 aria-disabled:opacity-50" :disabled="saving" :aria-disabled="testing ? 'true' : undefined" @click="testForm">{{ testing ? t('testing') : t('test') }}</button>
            <button data-testid="save-connection" type="button" class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="saving || testing || formProbe?.status !== 'usable'" @click="save">{{ saving ? t('saving') : t('save') }}</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
