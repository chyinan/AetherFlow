<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { runApi } from '@/services/api/runApi'
import { runReturnLocation } from '@/utils/runNavigation'
import { workflowRunBelongsToWorkflow } from '@/utils/workflowRunState'
import type { WorkflowGraphNode } from '@/types/workflow'
import { continuityMessages } from './continuityMessages'

const props = defineProps<{
  workflowId: string; definitionId: number | null; version: number | null; nodes: WorkflowGraphNode[]
  nodeId?: string; sourceRunId?: string; returnLocation?: string
}>()
const emit = defineEmits<{ locate: [nodeId: string] }>()
const { t } = useI18n({ useScope: 'local', messages: continuityMessages })
const loading = ref(false)
const verified = ref(false)
const failed = ref(false)
const errorDetails = ref('')
let requestId = 0
let active = true
const exists = computed(() => props.nodes.some((node) => node.id === props.nodeId))
const scoped = computed(() => Boolean(props.nodeId?.includes('/')))
const canLocate = computed(() => verified.value && exists.value && !scoped.value)
const back = computed(() => props.sourceRunId ? runReturnLocation(props.sourceRunId, props.returnLocation) : undefined)

async function loadSource() {
  const current = ++requestId
  verified.value = false
  errorDetails.value = ''
  failed.value = false
  loading.value = false
  const { sourceRunId, nodeId, workflowId, definitionId } = props
  if (!sourceRunId || !nodeId || !workflowId) { failed.value = true; return }
  loading.value = true
  const ownsRequest = () => active && current === requestId
  try {
    // 独立读取来源运行，不能接管编辑器当前运行或订阅。
    const run = await runApi.getRun(sourceRunId)
    if (!ownsRequest()) return
    const sourceNode = run.nodeStates.find((node) => node.nodeId === nodeId && node.status === 'failed')
    if (run.id !== sourceRunId || !workflowRunBelongsToWorkflow(run, workflowId, definitionId) || !sourceNode) {
      failed.value = true
      return
    }
    verified.value = true
    if (canLocate.value) emit('locate', nodeId)
    const logs = await runApi.getLogs(sourceRunId).catch(() => [])
    if (!ownsRequest()) return
    const message = logs.filter((log) => log.nodeId === nodeId && log.level === 'error').at(-1)?.message
    // 详情仅在当前页面呈现，不写入查询参数、剪贴板或外部消息。
    errorDetails.value = message?.slice(0, 800) ?? ''
  } catch {
    if (ownsRequest()) failed.value = true
  } finally {
    if (ownsRequest()) loading.value = false
  }
}

watch(() => [props.workflowId, props.definitionId, props.sourceRunId, props.nodeId], () => { void loadSource() }, { immediate: true })
onBeforeUnmount(() => { active = false; requestId += 1 })
</script>

<template>
  <section data-testid="run-node-recovery" class="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm [overflow-wrap:anywhere]" :aria-busy="loading">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-semibold">{{ t('sourceTitle') }}</h2>
      <div class="flex flex-wrap gap-3">
        <button v-if="canLocate" type="button" data-action="locate-source-node" class="text-primary underline" @click="emit('locate', nodeId!)">{{ t('sourceLocate') }}</button>
        <RouterLink v-if="back" :to="back" data-action="return-source-run" class="text-primary underline">{{ t('sourceBack') }}</RouterLink>
      </div>
    </div>
    <p v-if="loading" role="status" class="mt-2">{{ t('sourceLoading') }}</p>
    <p v-if="failed" role="alert" class="mt-2">{{ t('sourceUnavailable') }}</p>
    <template v-if="verified">
      <p class="mt-2" data-testid="source-version-warning">{{ version !== null ? t('sourceVersion', { version }) : t('sourceVersionUnknown') }}</p>
      <p v-if="scoped" role="alert" class="mt-2">{{ t('sourceScoped') }}</p>
      <p v-else-if="!exists" role="alert" class="mt-2">{{ t('sourceMissing') }}</p>
      <p class="mt-2 font-medium">{{ t('sourceFailure') }} <span class="font-mono">{{ nodeId }}</span></p>
      <p v-if="!loading" class="mt-1 whitespace-pre-wrap">{{ errorDetails || t('sourceNoDetails') }}</p>
    </template>
    <button v-if="failed && !loading" type="button" class="mt-2 text-primary underline" @click="loadSource">{{ t('sourceRetry') }}</button>
  </section>
</template>
