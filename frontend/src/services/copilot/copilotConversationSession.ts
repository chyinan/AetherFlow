// pattern: Imperative Shell
import { tokenManager } from '@/api/client/tokenManager'

type ConversationScope = {
  workflowId?: string
  projectId?: number | null
  workflowName?: string
}

/** 仅保存会话选择，不保存聊天内容或鉴权凭据。 */
export function conversationSessionKey(scope: Readonly<ConversationScope> | undefined): string {
  const user = tokenManager.readSession()?.user
  const owner = user?.userId ?? user?.id ?? user?.username ?? 'anonymous'
  return `af_copilot_active:${JSON.stringify([owner, scope?.projectId ?? null, scope?.workflowId ?? null,
    scope?.workflowId === 'new' ? scope.workflowName ?? '' : ''])}`
}

export function readConversationSelection(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeConversationSelection(key: string, selection: string): void {
  try {
    window.sessionStorage.setItem(key, selection)
  } catch {
    // 浏览器禁用存储时，当前面板仍可正常开启新对话。
  }
}
