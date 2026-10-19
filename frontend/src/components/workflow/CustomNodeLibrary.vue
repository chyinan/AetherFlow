<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { customDefinitionKey, defaultCustomDefinition, exportCustomDefinitions, importCustomDefinitions, mergeCustomDefinitions, parseCustomDefinition, type CustomDefinition } from '@/utils/customNodes'
import CustomFieldSchemaEditor from './CustomFieldSchemaEditor.vue'
const store = useWorkflowStore()
const visible = ref(false), panel = ref<HTMLElement | null>(null), selected = ref('')
const draft = ref(defaultCustomDefinition()), headers = ref('{}'), body = ref('{"text":"{{inputs.text}}"}'), transfer = ref(''), message = ref(''), error = ref('')
let returnFocus: HTMLElement | null = null
let bodyOverflow = ''
const definitions = computed(() => store.customDefinitions)
onMounted(() => store.reloadCustomDefinitions())
onBeforeUnmount(() => { if (visible.value) { document.body.style.overflow = bodyOverflow; returnFocus?.focus() } })
function open() { returnFocus = document.activeElement as HTMLElement; bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; visible.value = true; reset('API'); nextTick(() => panel.value?.focus()) }
function close() { visible.value = false; document.body.style.overflow = bodyOverflow; error.value = ''; transfer.value = ''; nextTick(() => returnFocus?.focus()) }
function reset(kind: CustomDefinition['kind']) { draft.value = defaultCustomDefinition(kind); selected.value = ''; headers.value = '{}'; body.value = kind === 'API' ? '{"text":"{{inputs.text}}"}' : ''; error.value = ''; message.value = '' }
function load() {
  const definition = definitions.value.find(item => customDefinitionKey(item) === selected.value)
  if (!definition) return
  draft.value = JSON.parse(JSON.stringify(definition)); headers.value = JSON.stringify(definition.request?.headers ?? {}, null, 2)
  body.value = definition.request && Object.hasOwn(definition.request, 'body') ? JSON.stringify(definition.request.body, null, 2) : ''; error.value = ''; message.value = ''
}
function save() {
  try {
    const source = JSON.parse(JSON.stringify(draft.value)) as CustomDefinition
    if (source.kind === 'API') { source.request!.headers = JSON.parse(headers.value); if (body.value.trim()) source.request!.body = JSON.parse(body.value); else delete source.request!.body }
    const definition = parseCustomDefinition(source)
    store.saveCustomDefinitions(mergeCustomDefinitions(definitions.value, [definition]))
    selected.value = customDefinitionKey(definition); message.value = '已保存到本机模板库，可从节点列表添加。修改同一模板请提升版本。'; error.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); message.value = '' }
}
function importNodes(replaceCorrupted = false) {
  try { store.saveCustomDefinitions(mergeCustomDefinitions(definitions.value, importCustomDefinitions(transfer.value)), replaceCorrupted); error.value = ''; message.value = '导入成功，已有工作流保持原快照。' }
  catch (e) { error.value = e instanceof Error ? e.message : String(e); message.value = '' }
}
function remove() { try { store.saveCustomDefinitions(definitions.value.filter(item => customDefinitionKey(item) !== selected.value)); reset('API'); message.value = '已从本机库移除；已有工作流不受影响。' } catch (e) { error.value = e instanceof Error ? e.message : String(e) } }
function readOriginal() { try { transfer.value = localStorage.getItem('aetherflow.custom-nodes.v1') ?? '' } catch (e) { error.value = e instanceof Error ? e.message : String(e) } }
function download() {
  const data = exportCustomDefinitions(definitions.value), url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'aetherflow-custom-nodes.json'; link.click(); URL.revokeObjectURL(url); transfer.value = data
}
async function importFile(event: Event) {
  try { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; if (file.size > 1024 * 1024) throw new Error('导入文件不能超过 1 MiB'); transfer.value = await file.text(); importNodes() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { (event.target as HTMLInputElement).value = '' }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  if (event.key === 'Tab') {
    const elements = [...(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? [])].filter(element => {
      const closed = element.closest('details:not([open])')
      return !element.hidden && (!closed || element.tagName === 'SUMMARY' && element.parentElement === closed)
    })
    const first = elements[0], last = elements[elements.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.value)) { event.preventDefault(); first?.focus() }
  }
}
</script>
<template>
  <button type="button" class="mt-3 w-full rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary" @click.stop="open">自定义节点 · API / 代码</button>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-3" @click.self="close" @keydown="keydown" @click.stop>
      <section ref="panel" role="dialog" aria-modal="true" aria-label="自定义节点模板库" tabindex="-1" class="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-panel outline-none">
        <header class="flex items-center justify-between border-b p-4"><div><h2 class="text-lg font-semibold">自定义节点模板库</h2><p class="text-xs text-text-muted">本机浏览器保存 · JSON 导入导出 · 工作流使用固定版本快照</p></div><button type="button" class="rounded border px-3 py-2" @click="close">取消 / 关闭</button></header>
        <div class="space-y-4 overflow-y-auto p-4">
          <p v-if="store.customLibraryError" role="alert" class="text-sm text-status-error">{{ store.customLibraryError }}</p>
          <div v-if="store.customLibraryError" class="flex flex-wrap gap-2 text-xs"><button type="button" class="rounded border p-2" @click="readOriginal">读取原数据到导出区</button><button type="button" class="rounded border p-2" @click="importNodes(true)">恢复：用已校验的导入包替换损坏库</button></div>
          <div class="flex flex-wrap gap-2"><button type="button" class="rounded border px-3 py-2" @click="reset('API')">新建 API 模板</button><button type="button" class="rounded border px-3 py-2" @click="reset('CODE')">新建代码模板</button></div>
          <label class="block text-sm">编辑已有版本（变更内容需提升版本号）<select v-model="selected" class="mt-1 w-full rounded border p-2" @change="load"><option value="">新模板</option><option v-for="definition in definitions" :key="customDefinitionKey(definition)" :value="customDefinitionKey(definition)">{{ definition.name }} · {{ customDefinitionKey(definition) }}</option></select></label>
          <div class="grid gap-3 sm:grid-cols-3"><label v-for="field in [{ key: 'id', label: '模板 ID' }, { key: 'version', label: '版本' }, { key: 'name', label: '名称' }]" :key="field.key" class="text-sm">{{ field.label }}<input v-model="(draft as unknown as Record<string, string>)[field.key]" class="mt-1 w-full rounded border p-2" /></label></div>
          <label class="block text-sm">说明<input v-model="draft.description" class="mt-1 w-full rounded border p-2" /></label>
          <p class="text-xs text-text-secondary">类型：{{ draft.kind }}。模板、默认值和代码会随工作流与导出包保存，请勿放入密钥。</p>
          <div class="grid gap-3 md:grid-cols-2"><CustomFieldSchemaEditor v-model="draft.inputs" label="输入" /><CustomFieldSchemaEditor v-model="draft.fields" label="表单" /></div>
          <CustomFieldSchemaEditor v-model="draft.outputs" output label="输出" />
          <section v-if="draft.kind === 'API' && draft.request" class="space-y-3 rounded border p-3">
            <h3 class="font-semibold">HTTP 调用规则</h3><p class="text-xs">占位符：&#123;&#123;inputs.字段&#125;&#125; / &#123;&#123;config.字段&#125;&#125;。完整 JSON 值占位符保留类型，URL 占位符自动编码。沿用服务端现有 URL、超时和大小限制；失败终止，不自动重放。</p>
            <label class="block text-sm">方法<select v-model="draft.request.method" class="ml-2 rounded border p-2"><option v-for="method in ['GET','POST','PUT','PATCH','DELETE','HEAD']" :key="method">{{ method }}</option></select></label>
            <label class="block text-sm">URL<input v-model="draft.request.url" class="mt-1 w-full rounded border p-2 font-mono" /></label>
            <label class="block text-sm">请求头（JSON 对象）<textarea v-model="headers" class="mt-1 w-full rounded border p-2 font-mono" /></label>
            <label class="block text-sm">JSON 请求体（留空为无请求体）<textarea v-model="body" class="mt-1 min-h-24 w-full rounded border p-2 font-mono" /></label>
          </section>
          <section v-else class="space-y-3 rounded border p-3"><h3 class="font-semibold">Python 代码扩展</h3><p class="text-xs">定义 main(payload)，从 payload["inputs"] 和 payload["config"] 读取值，返回 JSON。仅交给已确认隔离的独立运行时执行，受现有语法、超时和资源限制；不支持安装依赖或请求宿主权限。</p><label class="block text-sm">代码<textarea v-model="draft.code" spellcheck="false" class="mt-1 min-h-48 w-full rounded border p-2 font-mono" /></label></section>
          <div class="flex flex-wrap gap-3"><button type="button" class="rounded bg-primary px-4 py-2 text-white" @click="save">保存模板</button><button v-if="selected" type="button" class="rounded border px-3 py-2 text-status-error" @click="remove">从本机库移除</button></div>
          <p v-if="error" role="alert" class="text-sm text-status-error">{{ error }}</p><p v-if="message" role="status" class="text-sm text-status-success">{{ message }}</p>
          <details class="space-y-3 rounded border p-3"><summary class="cursor-pointer font-semibold">导入 / 导出模板</summary><div class="mt-3 flex flex-wrap items-center gap-3"><button type="button" class="rounded border px-3 py-2" @click="transfer = exportCustomDefinitions(definitions)">生成导出 JSON</button><button type="button" class="rounded border px-3 py-2" @click="download">下载模板包</button><label class="text-sm">导入 JSON 文件<input type="file" accept="application/json,.json" @change="importFile" /></label></div><label class="block text-sm">模板包 JSON<textarea v-model="transfer" class="mt-1 min-h-32 w-full rounded border p-2 font-mono text-xs" /></label><button type="button" class="rounded border px-3 py-2" @click="importNodes()">校验并导入 JSON</button></details>
        </div>
      </section>
    </div>
  </Teleport>
</template>
