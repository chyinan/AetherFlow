<script setup lang="ts">
// pattern: Imperative Shell
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createNodeConnection, getNodeConnections, probeNodeConnection, probeSavedNodeConnection, updateNodeConnection,
  type ImageCatalog, type ImageConnectionNodeType, type ImageConnectionProvider, type NodeConnection, type NodeConnectionProbe,
} from '@/api/modules/nodeConnections'
import { toApiError } from '@/api/client/apiError'
import { nodeConnectionMessages } from './nodeConnectionMessages'
import { buildNodeConnectionChecklist, connectionCatalogOptions, isKnownConnectionCatalog, type ConnectionChecklistIssue } from './nodeConnectionChecklist'

const props = defineProps<{ nodeId: string; nodeType: ImageConnectionNodeType; config: Record<string, unknown> }>()
const emit = defineEmits<{
  apply: [connection: { connectionId: string | undefined; provider: ImageConnectionProvider }, nodeId: string]
  updateConfig: [key: string, value: unknown]
  saved: []
  locateConfig: [field: string, nodeId: string]
}>()
const { t } = useI18n({ useScope: 'local', messages: nodeConnectionMessages })
const connections = ref<NodeConnection[]>([])
const loading = ref(false)
const listError = ref('')
const ready = ref(false)
const selectedProbe = ref<NodeConnectionProbe | null>(null)
const selectedError = ref('')
const probing = ref(false)
const open = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', provider: 'COMFYUI' as ImageConnectionProvider, baseUrl: '' })
const formProbe = ref<NodeConnectionProbe | null>(null)
const formError = ref('')
const testing = ref(false)
const saving = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
const selectorRoot = ref<HTMLElement | null>(null)
const selectedCancelled = ref(false)
let listSequence = 0
let selectedSequence = 0
let formSequence = 0
let alive = true
let opener: HTMLElement | null = null

function normalizeProvider(value: unknown): ImageConnectionProvider {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return props.nodeType === 'UPSCALE' ? 'COMFYUI' : 'STABLE_DIFFUSION_WEBUI'
  return normalized === 'COMFYUI' ? 'COMFYUI' : 'STABLE_DIFFUSION_WEBUI'
}
const provider = computed(() => normalizeProvider(props.config.provider))
const connectionId = computed(() => String(props.config.connectionId ?? '').trim())
const effectiveId = computed(() => connectionId.value || (provider.value === 'COMFYUI' ? 'deployment-comfyui' : 'deployment-sd'))
const selectedConnection = computed(() => connections.value.find((connection) => connection.id === effectiveId.value))
const missingConnection = computed(() => ready.value && Boolean(connectionId.value) && !selectedConnection.value)
const selectedKey = computed(() => JSON.stringify([props.nodeId, props.nodeType, effectiveId.value, provider.value, props.config.checkpoint, props.config.mode]))
const modelFields = computed<Array<{ key: string; catalog: ImageCatalog }>>(() => props.nodeType === 'UPSCALE'
  ? [{ key: 'upscaler', catalog: 'upscalers' }]
  : [{ key: 'checkpoint', catalog: 'checkpoints' }, { key: 'vae', catalog: 'vaes' }, { key: 'sampler', catalog: 'samplers' }, { key: 'scheduler', catalog: 'schedulers' }])
const checkpointRequired = computed(() => props.nodeType === 'IMAGE_GENERATION' && Boolean(connectionId.value)
  && provider.value === 'COMFYUI' && !String(props.config.checkpoint ?? '').trim())
const loras = computed(() => Array.isArray(props.config.lora) ? props.config.lora : [])
const invalidLora = computed(() => props.config.lora != null && !Array.isArray(props.config.lora))
const externalChecklistFields = new Set(['mode', 'workflow', 'workflowJson'])
const probeCatalogs: ImageCatalog[] = ['checkpoints', 'vaes', 'loras', 'samplers', 'schedulers', 'upscalers']
const checklist = computed(() => buildNodeConnectionChecklist({ provider: provider.value, nodeType: props.nodeType, config: props.config, probe: selectedProbe.value, connectionProvider: selectedConnection.value?.provider }))
const formChecklist = computed(() => buildNodeConnectionChecklist({
  provider: form.provider, nodeType: props.nodeType, config: { ...props.config, connectionId: editingId.value || 'new-connection' }, probe: formProbe.value,
}))

function errorMessage(cause: unknown) {
  return toApiError(cause, 'ai').message || t('failed')
}
function knownCatalog(catalog: ImageCatalog, result = selectedProbe.value) {
  return isKnownConnectionCatalog(result, catalog)
}
function options(catalog: ImageCatalog, result = selectedProbe.value) {
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
function cancelSelectedProbe() {
  selectedSequence += 1
  probing.value = false
  selectedProbe.value = null
  selectedError.value = ''
  selectedCancelled.value = true
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
  saving.value = false
}
function close(restoreFocus = true) {
  open.value = false
  invalidateForm()
  editingId.value = null
  form.name = ''
  form.baseUrl = ''
  form.provider = provider.value
  if (restoreFocus) opener?.focus()
}
async function showWizard(connection?: NodeConnection) {
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
function validateForm(requireName: boolean) {
  if (requireName && !form.name.trim()) return t('requiredName')
  if (form.name.trim().length > 80) return t('nameTooLong')
  try {
    const url = new URL(form.baseUrl.trim())
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return t('invalidUrl')
  } catch { return t('invalidUrl') }
  return ''
}
async function testForm() {
  const error = validateForm(false)
  invalidateForm()
  if (error) { formError.value = error; return }
  const sequence = formSequence
  const nodeId = props.nodeId
  testing.value = true
  try {
    const result = await probeNodeConnection({ provider: form.provider, baseUrl: form.baseUrl.trim(), nodeType: props.nodeType })
    if (alive && open.value && sequence === formSequence && nodeId === props.nodeId) formProbe.value = result
  } catch (cause) {
    if (alive && open.value && sequence === formSequence && nodeId === props.nodeId) formError.value = errorMessage(cause)
  } finally {
    if (alive && sequence === formSequence) testing.value = false
  }
}
async function save() {
  if (saving.value || testing.value || formProbe.value?.status !== 'usable') return
  const error = validateForm(true)
  if (error) { formError.value = error; return }
  const sequence = formSequence
  const nodeId = props.nodeId
  const payload = { name: form.name.trim(), provider: form.provider, baseUrl: form.baseUrl.trim() }
  const id = editingId.value
  saving.value = true
  formError.value = ''
  try {
    const connection = id ? await updateNodeConnection(id, payload) : await createNodeConnection(payload)
    // 显式保存可以完成，但关闭、切换节点或离开页面后不能将结果应用到新节点。
    if (!alive || !open.value || sequence !== formSequence || nodeId !== props.nodeId) return
    // 保存确认的新记录不能被打开面板时尚未返回的旧目录覆盖。
    listSequence += 1
    ready.value = true
    loading.value = false
    listError.value = ''
    connections.value = [...connections.value.filter((item) => item.id !== connection.id), connection]
    emit('apply', { connectionId: connection.id, provider: connection.provider }, props.nodeId)
    emit('saved')
    close()
    // 同 ID 编辑地址或服务目录时，也必须清除旧探测，不能只依赖节点配置变化。
    if (connection.id === effectiveId.value) void refreshSelected()
  } catch (cause) {
    if (alive && open.value && sequence === formSequence && nodeId === props.nodeId) formError.value = errorMessage(cause)
  } finally {
    if (alive && sequence === formSequence) saving.value = false
  }
}
async function refreshSelected() {
  const sequence = ++selectedSequence
  const key = selectedKey.value
  selectedProbe.value = null
  selectedError.value = ''
  selectedCancelled.value = false
  probing.value = false
  if (!ready.value || missingConnection.value) return
  probing.value = true
  try {
    const checkpoint = props.nodeType === 'IMAGE_GENERATION' ? String(props.config.checkpoint ?? '').trim() : ''
    const result = await probeSavedNodeConnection(effectiveId.value, props.nodeType, checkpoint || undefined)
    if (alive && sequence === selectedSequence && key === selectedKey.value) selectedProbe.value = result
  } catch (cause) {
    if (alive && sequence === selectedSequence && key === selectedKey.value) selectedError.value = errorMessage(cause)
  } finally {
    if (alive && sequence === selectedSequence) probing.value = false
  }
}
async function loadConnections() {
  const sequence = ++listSequence
  ready.value = false
  loading.value = true
  listError.value = ''
  selectedSequence += 1
  selectedProbe.value = null
  selectedError.value = ''
  selectedCancelled.value = false
  probing.value = false
  try {
    const result = await getNodeConnections()
    if (!alive || sequence !== listSequence) return
    connections.value = result.connections
    ready.value = true
    void refreshSelected()
  } catch (cause) {
    if (alive && sequence === listSequence) listError.value = errorMessage(cause)
  } finally {
    if (alive && sequence === listSequence) loading.value = false
  }
}
function chooseConnection(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  close()
  if (!id) { emit('apply', { connectionId: undefined, provider: provider.value }, props.nodeId); return }
  const connection = connections.value.find((item) => item.id === id)
  if (connection) emit('apply', { connectionId: connection.id, provider: connection.provider }, props.nodeId)
}
function chooseDefaultProvider(event: Event) {
  close()
  emit('apply', { connectionId: undefined, provider: normalizeProvider((event.target as HTMLSelectElement).value) }, props.nodeId)
}
function trapFocus(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
  if (event.key !== 'Tab') return
  const targets = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
  const first = targets[0]
  const last = targets[targets.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
watch(() => [form.provider, form.baseUrl], () => { if (open.value) invalidateForm() }, { flush: 'sync' })
watch(() => [props.nodeId, props.nodeType], () => { close(false); void loadConnections() }, { immediate: true, flush: 'sync' })
watch(selectedKey, () => { close(false); void refreshSelected() }, { flush: 'sync' })
onBeforeUnmount(() => { alive = false; listSequence += 1; selectedSequence += 1; close(false) })
</script>

<template>
  <section ref="selectorRoot" class="space-y-4 rounded-xl border border-app-border bg-app-bg2 p-4" data-testid="node-connection">
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
      <button data-testid="add-connection" type="button" class="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white" @click="showWizard()">{{ t('add') }}</button>
      <button v-if="selectedConnection && !selectedConnection.readOnly" data-testid="edit-connection" type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 text-xs" @click="showWizard(selectedConnection)">{{ t('edit') }}</button>
      <button data-testid="refresh-connection" type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 text-xs disabled:opacity-50" :disabled="probing || loading || missingConnection" @click="ready ? refreshSelected() : loadConnections()">{{ probing ? t('testing') : t('refresh') }}</button>
      <button v-if="probing" data-testid="cancel-current-test" type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 text-xs" @click="cancelSelectedProbe">{{ t('cancelTest') }}</button>
    </div>
    <p v-if="loading" role="status" class="text-xs text-text-muted">{{ t('loading') }}</p>
    <p v-if="selectedCancelled" role="status" class="text-xs text-text-muted">{{ t('testCancelled') }}</p>
    <p v-if="listError" role="alert" class="text-xs text-status-error">{{ listError }}</p>
    <p v-if="missingConnection" data-testid="missing-connection" role="alert" class="text-xs leading-5 text-status-error">{{ t('missingConnection') }}</p>
    <p v-if="selectedError" role="alert" class="text-xs text-status-error">{{ t('requestFailed') }}: {{ selectedError }}</p>
    <div v-if="selectedProbe" data-testid="selected-status" class="space-y-1 text-xs leading-5" :class="selectedProbe.status === 'usable' ? 'text-status-success' : 'text-status-warning'">
      <p class="font-semibold">{{ t(`status.${selectedProbe.status}`) }}</p><p>{{ selectedProbe.message }}</p>
      <p class="text-text-muted">{{ t('backend') }}</p>
      <p v-for="warning in selectedProbe.warnings" :key="warning" class="text-status-warning">{{ warning }}</p>
    </div>
    <section v-if="selectedProbe" data-testid="connection-checklist" class="space-y-3 rounded-lg border border-app-border bg-white p-3" :aria-labelledby="fieldId('checklist-title')">
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
    <p v-if="checkpointRequired" data-testid="checkpoint-required" role="alert" class="text-xs text-status-warning">{{ t('checkpointRequired') }}</p>
    <div class="space-y-3 border-t border-app-border pt-3">
      <p class="text-sm font-semibold text-text-primary">{{ t('choices') }}</p>
      <p v-if="!connectionId" data-testid="legacy-model-hint" class="text-xs leading-5 text-text-muted">{{ t('selectConnectionForModels') }}</p>
      <label v-for="field in modelFields" :key="field.key" class="block text-xs font-medium text-text-primary">
        {{ t(field.key) }}
        <select :id="fieldId(field.key)" :data-config-field="field.key" :data-testid="`model-${field.key}`" class="mt-1 w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm" :disabled="!connectionId" :value="currentValue(field.key)" @change="emit('updateConfig', field.key, ($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('emptyOption') }}</option>
          <option v-if="unsupported(field.key, field.catalog)" :value="currentValue(field.key)">{{ currentValue(field.key) }} (?)</option>
          <option v-for="option in options(field.catalog)" :key="option" :value="option">{{ option }}</option>
        </select>
        <span v-if="unsupported(field.key, field.catalog)" class="mt-1 block font-normal leading-5 text-status-warning" :data-testid="`unsupported-${field.key}`">{{ t('retained', { value: currentValue(field.key) }) }}</span>
        <span v-if="!knownCatalog(field.catalog)" class="mt-1 block font-normal text-text-muted">{{ selectedProbe ? t('unknownCatalog') : t('notTested') }}</span>
        <span v-else-if="!options(field.catalog).length" class="mt-1 block font-normal text-text-muted">{{ t('emptyCatalog') }}</span>
      </label>
      <div v-if="nodeType === 'IMAGE_GENERATION'" :id="fieldId('lora')" data-config-field="lora" tabindex="-1" class="space-y-2 text-xs">
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
          <p v-if="loraName(item) && !options('loras').includes(loraName(item))" class="text-status-warning">{{ t('retained', { value: loraName(item) }) }}</p>
        </div>
        <p v-if="!knownCatalog('loras')" class="text-text-muted">{{ selectedProbe ? t('unknownCatalog') : t('notTested') }}</p>
        <p v-else-if="!options('loras').length" class="text-text-muted">{{ t('emptyCatalog') }}</p>
        <button type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 disabled:opacity-50" :disabled="invalidLora || !connectionId" @click="addLora">{{ t('addLora') }}</button>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-950/55 p-4" @click.self="close()">
        <section role="dialog" aria-modal="true" :aria-labelledby="`connection-title-${nodeId}`" class="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-app-border bg-white p-5 shadow-panel" data-testid="connection-dialog" @keydown="trapFocus">
          <div class="flex items-center justify-between gap-3"><h2 :id="`connection-title-${nodeId}`" class="text-base font-semibold">{{ editingId ? t('editTitle') : t('addTitle') }}</h2><button type="button" :aria-label="t('close')" class="rounded p-2 text-text-muted" @click="close()">×</button></div>
          <p class="text-sm leading-6 text-text-secondary">{{ t('addressHint') }}</p>
          <p v-if="editingId" class="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-status-warning">{{ t('editShared') }}</p>
          <label class="block text-sm font-medium">{{ t('name') }}<input ref="nameInput" v-model="form.name" data-testid="connection-name" class="mt-1 w-full rounded-lg border border-app-border px-3 py-2" :disabled="saving" maxlength="80" /></label>
          <label class="block text-sm font-medium">{{ t('provider') }}<select v-model="form.provider" data-testid="connection-provider" class="mt-1 w-full rounded-lg border border-app-border px-3 py-2" :disabled="saving"><option value="COMFYUI">ComfyUI</option><option value="STABLE_DIFFUSION_WEBUI">Stable Diffusion WebUI</option></select></label>
          <label class="block text-sm font-medium">{{ t('url') }}<input v-model="form.baseUrl" data-testid="connection-url" type="url" placeholder="http://service-host:8188" class="mt-1 w-full rounded-lg border border-app-border px-3 py-2" :disabled="saving" autocomplete="off" spellcheck="false" /></label>
          <p class="text-xs leading-5 text-text-muted">{{ t('noCredentials') }}</p><p class="text-xs leading-5 text-text-muted">{{ t('scope') }}</p>
          <p v-if="formError" data-testid="form-error" role="alert" class="text-sm text-status-error">{{ formError }}</p>
          <div v-if="formProbe" data-testid="form-status" class="space-y-2 rounded-lg bg-app-bg2 p-3 text-xs leading-5">
            <p class="font-semibold" :class="formProbe.status === 'usable' ? 'text-status-success' : 'text-status-warning'">{{ t(`status.${formProbe.status}`) }}</p><p>{{ formProbe.message }}</p><p class="text-text-muted">{{ t('backend') }}</p>
            <p v-for="warning in formProbe.warnings" :key="warning" class="text-status-warning">{{ warning }}</p>
            <div data-testid="form-checklist" class="space-y-1 border-t border-app-border pt-2">
              <p class="font-semibold">{{ t('checklistTitle') }}</p>
              <p v-for="issue in formChecklist" :key="issue.id" class="text-status-warning">{{ issueMessage(issue) }}</p>
              <p v-if="!formChecklist.length">{{ t('checklistClear') }}</p>
              <p class="text-text-muted">{{ t('formChecklistHint') }}</p>
            </div>
            <p class="font-semibold">{{ t('discovered') }}</p>
            <p v-for="catalog in probeCatalogs" :key="catalog" class="break-words">{{ t(({ checkpoints: 'checkpoint', vaes: 'vae', loras: 'lora', samplers: 'sampler', schedulers: 'scheduler', upscalers: 'upscaler' })[catalog]) }}: {{ !knownCatalog(catalog, formProbe) ? t('unknownCatalog') : options(catalog, formProbe).join(', ') || t('emptyCatalog') }}</p>
          </div>
          <p v-if="formProbe?.status !== 'usable'" class="text-xs text-text-muted">{{ t('testRequired') }}</p>
          <div class="flex flex-wrap justify-end gap-2 border-t border-app-border pt-4">
            <button data-testid="cancel-connection" type="button" class="rounded-lg border border-app-border px-3 py-2 text-sm" @click="close()">{{ t('cancel') }}</button>
            <button data-testid="test-connection" type="button" class="rounded-lg border border-primary px-3 py-2 text-sm text-primary disabled:opacity-50" :disabled="testing || saving" @click="testForm">{{ testing ? t('testing') : t('test') }}</button>
            <button data-testid="save-connection" type="button" class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="saving || testing || formProbe?.status !== 'usable'" @click="save">{{ saving ? t('saving') : t('save') }}</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
