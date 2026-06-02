import { apiClient } from '@/api/client/apiClient'
import type { AuthSession, AuthSessionUserSnapshot } from '@/api/client/tokenManager'

const DEFAULT_WORKSPACE = 'AetherFlow Lab'

export type FrontendRole = 'owner' | 'operator'

export interface AuthTokenResponse {
  userId: number
  username: string
  roles: string[]
  tokenType: string
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
}

export interface AuthUserResponse {
  userId: number
  username: string
  roles: string[]
}

export interface AuthStatusResponse {
  onlineUserCount: number
  tokenCount: number
  loginFailureCount: number
}

export interface AuthLoginRequest {
  username: string
  password: string
}

export interface AuthRegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthRefreshRequest {
  refreshToken: string
}

export interface AuthLogoutRequest {
  accessToken: string
  refreshToken: string
}

export interface AuthSessionUser extends AuthSessionUserSnapshot {
  id: string
  userId: number
  name: string
  username: string
  role: FrontendRole
  roles: FrontendRole[]
  rawRoles: string[]
  workspace: string
}

export interface AuthSessionResult extends AuthSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  refreshExpiresAt: number
  tokenType: string
  user: AuthSessionUser
}

function toFrontendRole(role: string): FrontendRole | null {
  const normalized = role.trim().toUpperCase().replace(/^ROLE_/, '')

  if (normalized === 'ADMIN' || normalized === 'OWNER') {
    return 'owner'
  }

  if (normalized === 'USER') {
    return 'operator'
  }

  return null
}

export function mapBackendRoles(roles: string[]): FrontendRole[] {
  const mappedRoles = roles.map(toFrontendRole).filter((role): role is FrontendRole => Boolean(role))
  return [...new Set(mappedRoles)]
}

function toPrimaryRole(roles: FrontendRole[]): FrontendRole {
  return roles.includes('owner') ? 'owner' : 'operator'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readRequiredString(value: Record<string, unknown>, field: string) {
  const fieldValue = value[field]
  if (typeof fieldValue !== 'string' || !fieldValue.trim()) {
    throw new Error(`Invalid auth token response: ${field} is required`)
  }

  return fieldValue
}

function readTokenType(value: Record<string, unknown>) {
  const tokenType = value.tokenType
  return typeof tokenType === 'string' && tokenType.trim() ? tokenType : 'Bearer'
}

function readRequiredPositiveNumber(value: Record<string, unknown>, field: string) {
  const fieldValue = value[field]
  if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue) || fieldValue <= 0) {
    throw new Error(`Invalid auth token response: ${field} must be a positive number`)
  }

  return fieldValue
}

function readRequiredRoles(value: Record<string, unknown>) {
  const roles = value.roles
  if (!Array.isArray(roles) || roles.some((role) => typeof role !== 'string')) {
    throw new Error('Invalid auth token response: roles must be a string array')
  }

  return roles
}

function validateAuthTokenResponse(response: unknown): AuthTokenResponse {
  if (!isRecord(response)) {
    throw new Error('Invalid auth token response: expected object')
  }

  return {
    accessToken: readRequiredString(response, 'accessToken'),
    refreshToken: readRequiredString(response, 'refreshToken'),
    tokenType: readTokenType(response),
    expiresIn: readRequiredPositiveNumber(response, 'expiresIn'),
    refreshExpiresIn: readRequiredPositiveNumber(response, 'refreshExpiresIn'),
    userId: readRequiredPositiveNumber(response, 'userId'),
    username: readRequiredString(response, 'username'),
    roles: readRequiredRoles(response),
  }
}

export function mapAuthUser(response: AuthUserResponse): AuthSessionUser {
  const rawRoles = Array.isArray(response.roles) ? response.roles : []
  const roles = mapBackendRoles(rawRoles)
  const username = response.username || 'aether.operator'

  return {
    id: String(response.userId),
    userId: response.userId,
    name: username,
    username,
    role: toPrimaryRole(roles),
    roles,
    rawRoles,
    workspace: DEFAULT_WORKSPACE,
  }
}

function expiresAtFromSeconds(seconds: number) {
  return Date.now() + seconds * 1000
}

function mapTokenResponse(rawResponse: unknown): AuthSessionResult {
  const response = validateAuthTokenResponse(rawResponse)
  const user = mapAuthUser(response)

  if (user.roles.length === 0) {
    throw new Error('Invalid auth token response: no recognized roles')
  }

  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: expiresAtFromSeconds(response.expiresIn),
    refreshExpiresAt: expiresAtFromSeconds(response.refreshExpiresIn),
    tokenType: response.tokenType,
    user,
  }
}

export async function login(payload: AuthLoginRequest): Promise<AuthSessionResult> {
  const response = await apiClient.post<unknown>('/auth/login', payload, { source: 'auth' })
  return mapTokenResponse(response)
}

export async function register(payload: AuthRegisterRequest): Promise<AuthSessionResult> {
  const response = await apiClient.post<unknown>('/auth/register', payload, { source: 'auth' })
  return mapTokenResponse(response)
}

export async function refresh(payload: AuthRefreshRequest): Promise<AuthSessionResult> {
  const response = await apiClient.post<unknown>('/auth/refresh', payload, {
    source: 'auth',
  })
  return mapTokenResponse(response)
}

export function logout(payload: AuthLogoutRequest): Promise<void> {
  return apiClient.post<void>('/auth/logout', payload, { source: 'auth' })
}

export async function me(): Promise<AuthSessionUser> {
  const response = await apiClient.get<AuthUserResponse>('/auth/me', { source: 'auth' })
  return mapAuthUser(response)
}

export function status(): Promise<AuthStatusResponse> {
  return apiClient.get<AuthStatusResponse>('/auth/status', { source: 'auth' })
}
