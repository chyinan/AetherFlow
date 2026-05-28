export interface CopilotMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
