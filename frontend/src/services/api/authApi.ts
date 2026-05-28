import type { ServiceStatus } from '@/types/api'

import { delay } from '../mock/timing'

export interface LoginPayload {
  username: string
  password: string
}

export interface AuthUser {
  id: string
  name: string
  role: 'owner' | 'operator'
  workspace: string
}

export interface LoginResult {
  token: string
  user: AuthUser
}

export const authApi = {
  login(payload: LoginPayload) {
    return delay<LoginResult>({
      token: `mock-token-${payload.username || 'demo'}`,
      user: {
        id: 'user-cyan',
        name: payload.username || 'aether.operator',
        role: 'owner',
        workspace: 'AetherFlow Lab',
      },
    })
  },
  logout() {
    return delay(true, 80)
  },
  getServiceStatuses() {
    return delay<ServiceStatus[]>([
      { name: 'Gateway', state: 'online', detail: 'mock gateway ready' },
      { name: 'Realtime', state: 'online', detail: 'mock stream connected' },
      { name: 'AI Runtime', state: 'degraded', detail: 'mock provider only' },
    ])
  },
}
