// pattern: Imperative Shell
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  createNodeConnection, getNodeConnections, updateNodeConnection,
  type NodeConnection, type NodeConnectionPayload,
} from '@/api/modules/nodeConnections'

type SaveOutcome =
  | { status: 'saved'; connection: NodeConnection; edited: boolean; applied: boolean }
  | { status: 'failed'; name: string; cause: unknown }

interface LocalConnection {
  connection: NodeConnection
  revision: number
}

export const useNodeConnectionStore = defineStore('nodeConnections', () => {
  // 目录和写请求属于当前 Pinia 会话，不能随节点检查器或向导卸载而丢失。
  // 全量目录与局部保存结果分开保存：目录没读完时不能宣称就绪，
  // 也不能因为一次创建就把已有连接挤出选项。
  const catalogConnections = shallowRef<NodeConnection[]>([])
  const localConnections = shallowRef<Record<string, LocalConnection>>({})
  const connections = computed(() => mergeConnections(
    catalogConnections.value,
    Object.values(localConnections.value).map((item) => item.connection),
  ))
  const ready = ref(false)
  const loading = ref(false)
  const loadError = shallowRef<unknown>(null)
  const pendingSave = ref<NodeConnectionPayload | null>(null)
  const saveOutcome = ref<SaveOutcome | null>(null)
  let listSequence = 0
  let localRevision = 0

  function mergeConnections(catalog: NodeConnection[], local: NodeConnection[]) {
    const merged = new Map<string, NodeConnection>()
    catalog.forEach((item) => merged.set(item.id, item))
    // 局部保存结果更新鲜：同一个连接以本地结果为准。
    local.forEach((item) => merged.set(item.id, item))
    return [...merged.values()]
  }

  async function loadConnections() {
    const sequence = ++listSequence
    ready.value = false
    loading.value = true
    loadError.value = null
    try {
      const result = await getNodeConnections()
      if (sequence !== listSequence) return false
      catalogConnections.value = result.connections
      ready.value = true
      return true
    } catch (cause) {
      if (sequence === listSequence) loadError.value = cause
      return false
    } finally {
      if (sequence === listSequence) loading.value = false
    }
  }

  async function saveConnection(payload: NodeConnectionPayload, id: string | null) {
    // 关闭、切节点和重挂载都不能释放尚未结束的写请求，避免重复 POST。
    if (pendingSave.value) return null
    const request = { ...payload }
    pendingSave.value = request
    saveOutcome.value = null
    try {
      const connection = id ? await updateNodeConnection(id, request) : await createNodeConnection(request)
      // 局部保存结果单独记录：目录尚未完整时也保留本次结果。
      localRevision += 1
      localConnections.value = {
        ...localConnections.value,
        [connection.id]: { connection, revision: localRevision },
      }
      // 保存成功后界面立即可用；目录是否完整由 ready 反映，读取失败仍保留错误。
      loading.value = false
      saveOutcome.value = { status: 'saved', connection, edited: Boolean(id), applied: false }
      return connection
    } catch (cause) {
      saveOutcome.value = { status: 'failed', name: request.name, cause }
      throw cause
    } finally {
      pendingSave.value = null
    }
  }

  function markApplied(id: string) {
    if (saveOutcome.value?.status === 'saved' && saveOutcome.value.connection.id === id) saveOutcome.value.applied = true
  }

  return { connections, ready, loading, loadError, pendingSave, saveOutcome, loadConnections, saveConnection, markApplied }
})
