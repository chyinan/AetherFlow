export interface WorkspaceSettings {
  name: string
  slug: string
  region: string
  environment: 'dev' | 'staging' | 'prod'
  defaultTimeoutMin: number
  retentionDays: number
}

export interface WorkspaceMember {
  id: string
  name: string
  email: string
  role: 'Owner' | 'Admin' | 'Operator' | 'Viewer'
  status: 'active' | 'invited'
  lastSeen: string
}

export interface EnvironmentVariable {
  key: string
  scope: 'Gateway' | 'Realtime' | 'AI Runtime' | 'Storage'
  valuePreview: string
  status: 'configured' | 'missing' | 'rotating'
  updatedAt: string
}

export interface IntegrationSetting {
  id: string
  name: string
  description: string
  status: 'connected' | 'degraded' | 'disabled'
  endpoint: string
}

export interface TelegramIntegration {
  enabled: boolean
  botTokenConfigured: boolean
  botTokenPreview: string
  chatId: string
  lastTestStatus: string
}

export interface SettingsModelProvider {
  id: string
  providerKey: string
  providerType: string
  name: string
  maintainer: string
  region: 'global' | 'domestic'
  status: 'installed' | 'available'
  description: string
  defaultModel: string
  baseUrl: string
  enabled: boolean
  configured: boolean
  apiKeyConfigured: boolean
  apiKeyPreview: string
  installCount: string
  tags: string[]
}

export interface DataSourceProvider {
  id: string
  name: string
  maintainer: string
  description: string
  installCount: string
  status: 'connected' | 'available'
  tags: string[]
}

export interface ApiExtensionSetting {
  id: string
  name: string
  description: string
  endpoint: string
  status: 'connected' | 'configured' | 'disabled'
  scope: 'Gateway' | 'Realtime' | 'AI Runtime' | 'Webhook'
}

export interface BillingSnapshot {
  plan: string
  aiCredits: number
  monthlyBudget: string
  currentSpend: string
  renewalAt: string
  seats: string
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
}
