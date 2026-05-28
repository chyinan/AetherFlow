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

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
}
