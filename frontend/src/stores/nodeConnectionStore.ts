// pattern: Imperative Shell
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  createNodeConnection, getNodeConnections, updateNodeConnection,
  type NodeConnection, type NodeConnectionPayload,
} from '@/api/modules/nodeConnections'

type SaveOutcome =
  | { status: 'saved'; connection: NodeConnection; edited: boolean; applied: boolean }
  | { status: 'failed'; name: string; cause: unknown }

export const useNodeConnectionStore = defineStore('nodeConnections', () => {
  // 目录和写请求属于当前 Pinia 会话，不能随节点检查器或向导卸载而丢失。
  const connections = ref<NodeConnection[]>([])
  const ready = ref(false)
  const loading = ref(false)
  const loadError = shallowRef<unknown>(null)
  const pendingSave = ref<NodeConnectionPayload | null>(null)
  const saveOutcome = ref<SaveOutcome | null>(null)
  let listSequence = 0

  async function loadConnections() {
    const sequence = ++listSequence
    ready.value = false
    loading.value = true
    loadError.value = null
    try {
      const result = await getNodeConnections()
      if (sequence !== listSequence) return false
      connections.value = result.connections
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
      // 已确认保存的目录结果独立于表单有效期，并使保存前发起的旧列表失效。
      listSequence += 1
      connections.value = [...connections.value.filter((item) => item.id !== connection.id), connection]
      ready.value = true
      loading.value = false
      loadError.value = null
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
