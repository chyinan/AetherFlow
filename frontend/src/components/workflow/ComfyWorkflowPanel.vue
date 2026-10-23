<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { comfyBindingError, comfyParameters, describeComfyGraph, isRecord } from '@/utils/comfyWorkflow'
const props = defineProps<{ nodeId: string; config: Record<string, unknown> }>()
const emit = defineEmits<{
  update: [key: string, value: unknown]
  'replace-workflow': [values: Record<string, unknown>, nodeId: string]
}>()
const { t } = useI18n({ useScope: 'local', messages: {
  'zh-CN': { title: 'ComfyUI 原图与执行图', wrap: '导入创建 4 个 AF 外层节点，封装原图的 {nodes} 个节点、{links} 条连线。', api: 'API 执行图：{nodes} 个节点。默认保持原参数与插件节点。', ui: '原图已保留。请在原有 ComfyUI 中导出 API 格式 JSON，再载入执行图。当前界面 JSON 只能查看和保存，不能运行。', invalid: '执行图格式无效，请重新导出 API 格式 JSON。', plugins: '插件、模型和原生前端尚未验证。依赖插件前端的编辑仍在原有 ComfyUI 完成。', unresolved: '原始正向提示词尚未解析：插件文本链或多分支需要原生 ComfyUI 求值；没有用负向文本代替。', list: '查看内部节点与输入', source: '查看完整原图 JSON', load: '载入 API 执行图', preserve: '载入后保留原图，清空旧参数绑定；不会运行工作流。', bindings: '指定参数覆盖', hint: '默认不覆盖。明确添加目标后，才使用下方对应的 AF 参数或提示词变量；其他节点及输入保持原样。', target: '执行图输入', parameter: 'AF 参数', add: '添加覆盖', remove: '移除', empty: '未设置覆盖，按原图参数执行。', error: '无法读取文件，请选择有效的 API JSON。', linked: '覆盖链接输入会替换原有上游引用。', format: '原图格式：{format}' },
  en: { title: 'ComfyUI source and execution graph', wrap: 'Import creates 4 AF wrapper nodes around {nodes} original nodes and {links} links.', api: 'API execution graph: {nodes} nodes. Original parameters and plugin nodes are retained by default.', ui: 'Source retained. Export API JSON from your existing ComfyUI and load it here. UI JSON can be viewed and saved, but cannot run.', invalid: 'Invalid execution graph. Export API JSON again.', plugins: 'Plugins, models and native frontend are unverified. Edit frontend-dependent plugins in your existing ComfyUI.', unresolved: 'Original positive prompt unresolved: plugin chains or multiple branches require native evaluation. Negative text was not substituted.', list: 'Internal nodes and inputs', source: 'Complete source JSON', load: 'Load API execution graph', preserve: 'Retains source and clears old bindings. Does not run the graph.', bindings: 'Explicit parameter overrides', hint: 'No overrides by default. Add a target to use the corresponding AF parameter or prompt variable below. Other inputs remain unchanged.', target: 'Execution input', parameter: 'AF parameter', add: 'Add override', remove: 'Remove', empty: 'No overrides; run with original parameters.', error: 'Cannot read file. Select valid API JSON.', linked: 'Overriding a linked input replaces its upstream reference.', format: 'Source format: {format}' },
  ja: { title: 'ComfyUI 原図と実行グラフ', wrap: '4 個の AF ノードが原図の {nodes} ノードと {links} 接続を包みます。', api: 'API 実行グラフ：{nodes} ノード。元のパラメータを保持します。', ui: '原図は保持されます。既存の ComfyUI で API JSON を出力し、ここに読み込んでください。UI JSON は表示と保存のみ可能です。', invalid: '実行形式が無効です。API JSON を再出力してください。', plugins: 'プラグイン、モデル、専用フロントエンドは未検証です。専用 UI の編集は既存の ComfyUI で行います。', unresolved: '元の正向プロンプトは未解析です。プラグインと複数分岐は元の環境で評価します。負向テキストで代用しません。', list: '内部ノードと入力', source: '原図 JSON 全体', load: 'API 実行グラフを読み込む', preserve: '原図を保持し、以前のバインドを解除します。実行しません。', bindings: '明示的なパラメータ上書き', hint: '既定では上書きしません。対象を追加した入力のみ AF の値を使用します。', target: '実行入力', parameter: 'AF パラメータ', add: '上書きを追加', remove: '削除', empty: '上書きなし。原図の値を使用します。', error: '有効な API JSON を選択してください。', linked: '接続入力の上書きは元の参照を置換します。', format: '原図形式：{format}' },
} })
const execution = computed(() => describeComfyGraph(props.config.workflowJson ?? props.config.workflow))
const source = computed(() => describeComfyGraph(props.config.workflow ?? props.config.workflowJson))
const metadata = computed(() => isRecord(props.config.comfyImport) ? props.config.comfyImport : {})
const bindings = computed(() => Array.isArray(props.config.workflowBindings) ? props.config.workflowBindings : [])
const bindingError = computed(() => comfyBindingError(props.config.workflowBindings, execution.value.graph))
const target = ref(''), parameter = ref<string>('prompt'), error = ref('')
const input = ref<HTMLInputElement | null>(null)
const targets = computed(() => execution.value.nodes.flatMap((node) => Object.keys(node.inputs).map((name) => ({ key: JSON.stringify([node.id, name]), label: `${node.id} · ${node.type} · ${name}` }))))
let alive = true, sequence = 0
onBeforeUnmount(() => { alive = false; sequence++ })
async function loadApi(event: Event) {
  const element = event.target as HTMLInputElement, file = element.files?.[0]
  if (!file) return
  const current = ++sequence, nodeId = props.nodeId, previousGraph = props.config.workflowJson
  error.value = ''
  try {
    const parsed: unknown = JSON.parse(await file.text())
    if (!alive || current !== sequence || nodeId !== props.nodeId || previousGraph !== props.config.workflowJson) return
    if (describeComfyGraph(parsed).format !== 'API') { error.value = t('invalid'); return }
    const values: Record<string, unknown> = {
      workflowJson: parsed,
      workflowBindings: [],
    }
    if (!props.config.workflow) values.workflow = props.config.workflowJson
    emit('replace-workflow', values, nodeId)
    target.value = ''
  } catch { if (alive && current === sequence && nodeId === props.nodeId) error.value = t('error') }
  finally { if (alive && current === sequence) element.value = '' }
}
function addBinding() {
  if (!target.value) return
  const [nodeId, inputName] = JSON.parse(target.value) as [string, string]
  const next = [...bindings.value, { nodeId, inputName, parameter: parameter.value }]
  const message = comfyBindingError(next, execution.value.graph)
  if (message) { error.value = message; return }
  error.value = ''; emit('update', 'workflowBindings', next)
}
</script>

<template>
  <section data-testid="comfy-workflow-panel" class="mt-4 space-y-3 rounded-xl border border-app-border bg-app-bg2 p-4 text-sm">
    <h3 class="font-semibold text-text-primary">{{ t('title') }}</h3>
    <p>{{ t('wrap', { nodes: source.nodes.length, links: source.links }) }}</p>
    <p class="text-xs text-text-muted">{{ t('format', { format: source.format }) }}</p>
    <p v-if="execution.format !== 'API'" role="alert" class="text-status-warning">{{ t(execution.format === 'UI' ? 'ui' : 'invalid') }}</p>
    <p v-else>{{ t('api', { nodes: execution.nodes.length }) }}</p>
    <p class="text-xs leading-5 text-text-muted">{{ t('plugins') }}</p>
    <p v-if="metadata.positiveStatus === 'unresolved'" class="text-xs leading-5 text-status-warning">{{ t('unresolved') }}</p>
    <details><summary class="cursor-pointer text-primary">{{ t('list') }}</summary><ul class="mt-2 max-h-60 space-y-1 overflow-auto text-xs"><li v-for="(node, index) in source.nodes" :key="index"><code>{{ node.id }} · {{ node.type }}</code><span> · {{ Object.keys(node.inputs).join(', ') }}</span></li></ul></details>
    <details><summary class="cursor-pointer text-primary">{{ t('source') }}</summary><pre data-testid="comfy-source" class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{{ typeof source.raw === 'string' ? source.raw : JSON.stringify(source.graph, null, 2) }}</pre></details>
    <input ref="input" class="hidden" type="file" accept=".json,application/json" data-testid="comfy-api-file" @change="loadApi" />
    <button type="button" class="rounded-lg border border-app-border px-3 py-2 text-primary" @click="input?.click()">{{ t('load') }}</button>
    <p class="text-xs text-text-muted">{{ t('preserve') }}</p>
    <div v-if="execution.format === 'API'" class="space-y-2 border-t border-app-border pt-3">
      <h4 class="font-semibold">{{ t('bindings') }}</h4><p class="text-xs leading-5 text-text-muted">{{ t('hint') }} {{ t('linked') }}</p>
      <label class="block text-xs">{{ t('target') }}<select v-model="target" data-testid="comfy-target" class="mt-1 w-full rounded border border-app-border bg-app-bg px-2 py-2"><option value="">—</option><option v-for="item in targets" :key="item.key" :value="item.key">{{ item.label }}</option></select></label>
      <label class="block text-xs">{{ t('parameter') }}<select v-model="parameter" data-testid="comfy-parameter" class="mt-1 w-full rounded border border-app-border bg-app-bg px-2 py-2"><option v-for="name in comfyParameters" :key="name" :value="name">{{ name }}</option></select></label>
      <button type="button" data-testid="comfy-add-binding" :disabled="!target" class="rounded border border-app-border px-3 py-2 text-primary disabled:opacity-50" @click="addBinding">{{ t('add') }}</button>
      <p v-if="!bindings.length" class="text-xs text-text-muted">{{ t('empty') }}</p>
      <div v-for="(binding, index) in bindings" :key="index" class="flex items-center justify-between gap-2 text-xs"><code>{{ binding.nodeId }}.{{ binding.inputName }} ← {{ binding.parameter }}</code><button type="button" :aria-label="t('remove')" class="px-2 py-1 text-primary" @click="emit('update', 'workflowBindings', bindings.filter((_, i) => i !== index))">{{ t('remove') }}</button></div>
    </div>
    <p v-if="error || bindingError" role="alert" class="text-xs text-status-error">{{ error || bindingError }}</p>
  </section>
</template>
