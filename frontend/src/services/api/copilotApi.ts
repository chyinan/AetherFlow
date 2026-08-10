import { apiClient } from '@/api/client/apiClient'
import { runtimeEnv } from '@/config/runtimeEnv'
import type { CopilotMessage } from '@/types/copilot'
import { tokenManager } from '@/api/client/tokenManager'

export interface CopilotAskOptions {
  conversationId?: string
  workflowId?: string
  projectId?: string
  provider?: string
  model?: string
  context?: Record<string, unknown>
}

export interface CopilotStreamOptions extends CopilotAskOptions {
  onDelta?: (content: string) => void
}

export interface CopilotConversationSummary {
  id: string
  title: string
  workflowId?: string
  projectId?: string
  messageCount: number
  updatedAt: string
}

interface CopilotMessageResponse {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface CopilotChatResponse {
  id: string
  conversationId?: string
  role: 'assistant'
  content: string
  createdAt: string
}

type CopilotSseEvent = {
  event: string
  data: unknown
}

function numericConversationId(conversationId: string) {
  const normalized = conversationId.replace(/^conv-/, '')
  if (!/^\d+$/.test(normalized)) {
    throw new Error('invalid copilot conversation id')
  }
  return normalized
}

function requestPayload(prompt: string, options: CopilotAskOptions) {
  return {
    conversationId: options.conversationId,
    workflowId: options.workflowId,
    projectId: options.projectId,
    provider: options.provider,
    model: options.model,
    context: options.context,
    prompt,
  }
}

function readSseEvent(block: string): CopilotSseEvent | null {
  const lines = block.split(/\r?\n/)
  const event = lines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim() || 'message'
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n')
  if (!data) return null
  if (data === '[DONE]') return { event, data }
  try {
    return { event, data: JSON.parse(data) as unknown }
  } catch {
    throw new Error('invalid copilot stream event')
  }
}

function toAssistantMessage(response: CopilotChatResponse): CopilotMessage {
  return {
    id: response.id,
    conversationId: response.conversationId,
    role: 'assistant',
    content: response.content,
    createdAt: response.createdAt,
  }
}

export const copilotApi = {
  async ask(prompt: string, options: CopilotAskOptions = {}) {
    const response = await apiClient.post<CopilotChatResponse>('/copilot/chat', requestPayload(prompt, options), {
      source: 'ai',
      timeout: 65_000,
    })

    return toAssistantMessage(response)
  },
  async stream(prompt: string, options: CopilotStreamOptions = {}) {
    const token = tokenManager.getAccessToken()
    const response = await fetch(`${runtimeEnv.apiBase}/copilot/chat/stream`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(requestPayload(prompt, options)),
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error(`copilot stream request failed: ${response.status}`)
    }
    if (!response.body) {
      throw new Error('copilot stream response body is empty')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let completed: CopilotChatResponse | undefined

    const handleBlock = (block: string) => {
      const event = readSseEvent(block)
      if (!event || event.data === '[DONE]') return
      if (event.event === 'delta') {
        const content = typeof event.data === 'object' && event.data !== null && 'content' in event.data
          ? String((event.data as { content?: unknown }).content ?? '')
          : ''
        if (content) options.onDelta?.(content)
        return
      }
      if (event.event === 'error') {
        const message = typeof event.data === 'object' && event.data !== null && 'message' in event.data
          ? String((event.data as { message?: unknown }).message ?? 'copilot stream failed')
          : 'copilot stream failed'
        throw new Error(message)
      }
      if (event.event === 'complete' && typeof event.data === 'object' && event.data !== null) {
        completed = event.data as CopilotChatResponse
      }
    }

    while (true) {
      const result = await reader.read()
      buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      blocks.forEach(handleBlock)
      if (result.done) break
    }
    if (buffer.trim()) handleBlock(buffer)
    if (!completed) {
      throw new Error('copilot stream completed without an assistant message')
    }
    return toAssistantMessage(completed)
  },
  async listConversations() {
    return apiClient.get<Array<CopilotConversationSummary>>('/copilot/conversations', { source: 'ai' })
  },
  async listMessages(conversationId: string) {
    const response = await apiClient.get<Array<CopilotMessageResponse>>(
      `/copilot/conversations/${encodeURIComponent(numericConversationId(conversationId))}/messages`,
      { source: 'ai' },
    )
    return response.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    } satisfies CopilotMessage))
  },
}
