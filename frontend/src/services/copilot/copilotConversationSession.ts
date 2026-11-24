// pattern: Imperative Shell
import { tokenManager } from '@/api/client/tokenManager'

// 首轮已发送但尚未收到持久化后的会话 ID，禁止猜测最近会话。
export const UNCONFIRMED_CONVERSATION = 'pending'

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

/**
 * 草稿保存后 workflowId 会从 'new' 变成真实 ID，作用域键随之变化。
 * 只有同一项目、同一名称的「草稿 → 已保存」这一种迁移才应该沿用原会话。
 */
export function shouldCarryDraftSelection(
  previous: Readonly<ConversationScope> | undefined,
  next: Readonly<ConversationScope> | undefined,
): boolean {
  if (!previous || !next) return false
  const previousId = previous.workflowId ?? 'new'
  const nextId = next.workflowId ?? 'new'
  return previousId === 'new'
    && nextId !== 'new'
    && (previous.workflowName ?? '') === (next.workflowName ?? '')
    && (previous.projectId ?? null) === (next.projectId ?? null)
}

export function writeConversationSelection(key: string, selection: string): void {
  try {
    window.sessionStorage.setItem(key, selection)
  } catch {
    // 浏览器禁用存储时，当前面板仍可正常开启新对话。
  }
}
