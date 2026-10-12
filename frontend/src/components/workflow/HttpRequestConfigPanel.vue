<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [key: string, value: unknown] }>()
const text = (key: string, fallback = '') => String(props.config[key] ?? fallback)
function update(key: string, event: Event) {
  emit('update', key, (event.target as HTMLInputElement).value)
}
const bodyError = computed(() => {
  const body = text('bodyJson').trim()
  const variable = text('bodyVariable').trim()
  if (body && variable) return '固定 JSON 和请求体变量只能选择一个'
  if ((body || variable) && ['GET', 'HEAD'].includes(text('method', 'GET'))) return 'GET/HEAD 不支持请求体，请清空或更换方法'
  if (body) {
    try { JSON.parse(body) } catch { return '请输入有效 JSON；无效内容不能保存或运行' }
  }
  return ''
})
</script>

<template>
  <section class="space-y-5 p-5" data-testid="http-request-config">
    <p class="text-sm leading-6 text-text-secondary">同步 JSON 请求，共用 URL 抓取的网络与大小限制；不跟随重定向或自动轮询，不提供凭据存储</p>
    <label class="block text-sm font-semibold">
      HTTP 方法
      <select data-config-field="method" class="mt-2 w-full rounded-lg border border-app-border p-3" :value="text('method', 'GET')" @change="update('method', $event)">
        <option v-for="method in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']" :key="method">{{ method }}</option>
      </select>
    </label>
    <label v-for="field in [
      { key: 'url', label: '固定 URL（优先使用）', fallback: '' },
      { key: 'urlVariable', label: 'URL 变量', fallback: 'requestUrl' },
    ]" :key="field.key" class="block text-sm font-semibold">
      {{ field.label }}
      <input :data-config-field="field.key" class="mt-2 w-full rounded-lg border border-app-border p-3" :value="text(field.key, field.fallback)" @input="update(field.key, $event)" />
    </label>
    <label class="block text-sm font-semibold">
      JSON 请求体（对象、数组或标量）
      <textarea data-config-field="bodyJson" class="mt-2 min-h-28 w-full rounded-lg border border-app-border p-3 font-mono" :value="text('bodyJson')" spellcheck="false" @input="update('bodyJson', $event)" />
    </label>
    <label class="block text-sm font-semibold">
      请求体变量（与固定 JSON 互斥，字符串变量会序列化为 JSON 字符串）
      <input data-config-field="bodyVariable" class="mt-2 w-full rounded-lg border border-app-border p-3" :value="text('bodyVariable')" @input="update('bodyVariable', $event)" />
    </label>
    <p v-if="bodyError" role="alert" class="text-sm text-status-error">{{ bodyError }}</p>
    <label class="block text-sm font-semibold">
      错误策略
      <select data-config-field="errorStrategy" class="mt-2 w-full rounded-lg border border-app-border p-3" :value="text('errorStrategy', 'FAIL')" @change="update('errorStrategy', $event)">
        <option value="FAIL">终止工作流（默认）</option>
        <option value="BRANCH">success / error 分支</option>
      </select>
    </label>
    <p v-if="text('errorStrategy') === 'BRANCH'" class="text-sm text-text-secondary">请分别连接标记为 success 和 error 的出边。首次连接为 success，第二次为 error；切换策略前已有的出边请删除后重新连接。非 2xx、非 JSON 响应或网络失败走 error；配置错误始终终止</p>
    <label class="block text-sm font-semibold">
      输出变量
      <input data-config-field="outputVariable" class="mt-2 w-full rounded-lg border border-app-border p-3" :value="text('outputVariable', 'httpResponse')" @input="update('outputVariable', $event)" />
    </label>
    <p class="text-xs leading-5 text-text-muted">响应对象包含 statusCode、body（解析后的 JSON）、bodyText、ok 和 error。HEAD / 空响应的 body 为 null，网络失败状态码为 0。写入类请求应自行设置业务幂等键，工作流重试可能重复调用</p>
  </section>
</template>
