import type {
  AuditEvent,
  EnvironmentVariable,
  IntegrationSetting,
  WorkspaceMember,
  WorkspaceSettings,
} from '@/types/settings'

export const mockWorkspaceSettings: WorkspaceSettings = {
  name: 'AetherFlow Lab',
  slug: 'aetherflow-lab',
  region: 'cn-dev-01',
  environment: 'dev',
  defaultTimeoutMin: 45,
  retentionDays: 30,
}

export const mockWorkspaceMembers: WorkspaceMember[] = [
  {
    id: 'member-owner',
    name: '陈胤安',
    email: 'owner@aetherflow.mock',
    role: 'Owner',
    status: 'active',
    lastSeen: '2026-05-28 02:36',
  },
  {
    id: 'member-ops',
    name: 'Workflow Operator',
    email: 'ops@aetherflow.mock',
    role: 'Operator',
    status: 'active',
    lastSeen: '2026-05-28 01:52',
  },
  {
    id: 'member-viewer',
    name: 'Demo Reviewer',
    email: 'reviewer@aetherflow.mock',
    role: 'Viewer',
    status: 'invited',
    lastSeen: 'pending',
  },
]

export const mockEnvironmentVariables: EnvironmentVariable[] = [
  {
    key: 'GATEWAY_BASE_URL',
    scope: 'Gateway',
    valuePreview: 'http://localhost:8080',
    status: 'configured',
    updatedAt: '2026-05-28 02:12',
  },
  {
    key: 'REALTIME_DRIVER',
    scope: 'Realtime',
    valuePreview: 'mock-sse',
    status: 'configured',
    updatedAt: '2026-05-28 02:12',
  },
  {
    key: 'OPENAI_API_KEY',
    scope: 'AI Runtime',
    valuePreview: 'sk-••••••••mock',
    status: 'missing',
    updatedAt: 'not configured',
  },
  {
    key: 'MINIO_BUCKET',
    scope: 'Storage',
    valuePreview: 'aetherflow-dev',
    status: 'rotating',
    updatedAt: '2026-05-27 23:10',
  },
]

export const mockIntegrations: IntegrationSetting[] = [
  {
    id: 'integration-nacos',
    name: 'Nacos',
    description: 'Service discovery and shared config.',
    status: 'connected',
    endpoint: '192.168.101.68:8848',
  },
  {
    id: 'integration-redis',
    name: 'Redis',
    description: 'Run state cache and realtime cursor storage.',
    status: 'connected',
    endpoint: 'redis://localhost:6379',
  },
  {
    id: 'integration-rabbit',
    name: 'RabbitMQ',
    description: 'Task dispatch and notify events.',
    status: 'degraded',
    endpoint: 'amqp://localhost:5672',
  },
  {
    id: 'integration-minio',
    name: 'MinIO',
    description: 'Input files and workflow artifacts.',
    status: 'disabled',
    endpoint: 'http://localhost:9000',
  },
]

export const mockAuditEvents: AuditEvent[] = [
  {
    id: 'audit-1',
    time: '02:34:20',
    actor: 'aether.operator',
    action: 'updated model routing policy',
    target: 'Summary and translate',
  },
  {
    id: 'audit-2',
    time: '02:18:44',
    actor: 'Workflow Operator',
    action: 'started mock run',
    target: 'Media Digest Pipeline',
  },
  {
    id: 'audit-3',
    time: '01:55:12',
    actor: 'system',
    action: 'rotated mock realtime token',
    target: 'dev / mock',
  },
]
