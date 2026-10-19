import { CUSTOM_NODE_STORAGE_KEY, importCustomDefinitions } from './customNodes'

export const CUSTOM_NODE_WRITE_LOCK = `${CUSTOM_NODE_STORAGE_KEY}:write`

/** 所有新版窗口在同源 Web Lock 内执行修订比较和写入；不使用可竞争的本地锁替身。 */
export async function withCustomNodeWriteLock<T>(write: () => T, signal?: AbortSignal): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    throw new Error('当前浏览器无法取得跨窗口写入锁，已停止保存。请使用支持 Web Locks 的 HTTPS 或 localhost 页面；原数据保留。')
  }
  return navigator.locks.request(CUSTOM_NODE_WRITE_LOCK, { mode: 'exclusive', signal }, () => {
    if (signal?.aborted) throw new DOMException('模板保存已取消', 'AbortError')
    return write()
  })
}

export function readCustomNodeLibrary(raw: string | null) {
  if (raw === null) return { definitions: [], revision: 0 }
  const definitions = importCustomDefinitions(raw)
  const revision: unknown = (JSON.parse(raw) as Record<string, unknown>).libraryRevision ?? 0
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new Error('本机模板库修订无效，请备份原数据后恢复')
  return { definitions, revision }
}
