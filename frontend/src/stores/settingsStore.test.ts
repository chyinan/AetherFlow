import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { settingsApi } from '@/services/api/settingsApi'
import { useAuthStore } from '@/stores/authStore'
import type { WorkspaceMember, WorkspaceSettings } from '@/types/settings'
import { SettingsAccessError, SettingsSessionChangedError, useSettingsStore } from './settingsStore'

const workspace: WorkspaceSettings = { name: '测试工作区', slug: 'fixture', region: 'local', environment: 'dev', defaultTimeoutMin: 45, retentionDays: 30 }
const member: WorkspaceMember = { id: 'record-1', name: '成员记录', email: 'fixture@example.test', role: 'Viewer', status: 'invited', lastSeen: 'pending' }
function setSession(admin = false, id = 'fixture-user') {
  const auth = useAuthStore()
  auth.token = 'synthetic-token'
  auth.user = { id, name: id, username: id, role: 'operator', roles: ['operator'], rawRoles: admin ? ['ADMIN'] : ['USER'], workspace: 'fixture' }
  return auth
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function mockReads() {
  return {
    workspace: vi.spyOn(settingsApi, 'getWorkspace').mockResolvedValue(workspace),
    providers: vi.spyOn(settingsApi, 'listModelProviders').mockResolvedValue([]),
    data: vi.spyOn(settingsApi, 'listDataSources').mockResolvedValue([]),
    api: vi.spyOn(settingsApi, 'listApiExtensions').mockResolvedValue([]),
    env: vi.spyOn(settingsApi, 'listEnvironmentVariables').mockResolvedValue([]),
    members: vi.spyOn(settingsApi, 'listMembers').mockResolvedValue([member]),
    billing: vi.spyOn(settingsApi, 'getBillingSnapshot').mockResolvedValue({ plan: 'fixture', aiCredits: 0, monthlyBudget: '-', currentSpend: '-', renewalAt: '-', seats: '-' }),
    integrations: vi.spyOn(settingsApi, 'listIntegrations').mockResolvedValue([]),
    telegram: vi.spyOn(settingsApi, 'getTelegramIntegration').mockResolvedValue({ enabled: true, botTokenConfigured: true, botTokenPreview: 'masked', chatId: 'synthetic-chat', lastTestStatus: 'untested' }),
    audit: vi.spyOn(settingsApi, 'listAuditEvents').mockResolvedValue([]),
  }
}

beforeEach(() => { vi.restoreAllMocks(); setActivePinia(createPinia()) })
describe('设置存储的会话与权限边界', () => {
  it('管理员保存工作区，以服务端响应为准', async () => {
    setSession(true)
    const updated = { ...workspace, name: '已校验名称' }
    const update = vi.spyOn(settingsApi, 'updateWorkspace').mockResolvedValue(updated)
    const store = useSettingsStore()
    await store.saveWorkspace(workspace)
    expect(update).toHaveBeenCalledWith(workspace)
    expect(store.workspace).toEqual(updated)
  })

  it.each([{}, { includeAdmin: false }, { includeAdmin: true }])('普通用户不能通过加载参数访问管理员数据：%j', async (options) => {
    setSession(false)
    const reads = mockReads()
    const store = useSettingsStore()
    await store.loadSettings(options)
    expect(reads.workspace).toHaveBeenCalledOnce()
    expect(reads.data).toHaveBeenCalledOnce()
    expect(reads.api).toHaveBeenCalledOnce()
    ;[reads.providers, reads.env, reads.members, reads.billing, reads.integrations, reads.telegram, reads.audit].forEach((request) => expect(request).not.toHaveBeenCalled())
  })

  it('默认普通目录加载不为管理员额外读取共享配置', async () => {
    setSession(true)
    const reads = mockReads()
    await useSettingsStore().loadSettings()
    expect(reads.members).not.toHaveBeenCalled()
    expect(reads.providers).not.toHaveBeenCalled()
  })

  it('管理员显式加载管理配置', async () => {
    setSession(true)
    const reads = mockReads()
    await useSettingsStore().loadSettings({ includeAdmin: true })
    expect(reads.providers).toHaveBeenCalledWith({ includeConfig: true })
    expect(reads.env).toHaveBeenCalledOnce()
    expect(reads.members).toHaveBeenCalledOnce()
  })

  it('角色降级同步清空管理数据，延迟响应不能重新填入', async () => {
    const auth = setSession(true)
    const reads = mockReads()
    const pending = deferred<WorkspaceMember[]>()
    reads.members.mockReturnValue(pending.promise)
    const store = useSettingsStore()
    store.members = [member]
    const load = store.loadSettings({ includeAdmin: true })
    auth.user!.rawRoles = ['USER']
    expect(store.members).toEqual([])
    expect(store.telegramIntegration).toBeNull()
    expect(store.loading).toBe(false)
    pending.resolve([member])
    await load
    expect(store.members).toEqual([])
    expect(store.workspace).toBeNull()
  })

  it('管理员账号切换后旧请求与旧保存响应不能串入新账号', async () => {
    setSession(true, 'account-a')
    const reads = mockReads()
    const loadPending = deferred<WorkspaceSettings>()
    const savePending = deferred<WorkspaceSettings>()
    reads.workspace.mockReturnValueOnce(loadPending.promise)
    vi.spyOn(settingsApi, 'updateWorkspace').mockReturnValue(savePending.promise)
    const store = useSettingsStore()
    const load = store.loadSettings({ includeAdmin: true })
    const save = store.saveWorkspace(workspace)
    const saved = expect(save).rejects.toBeInstanceOf(SettingsSessionChangedError)
    setSession(true, 'account-b')
    await store.loadSettings({ includeAdmin: true })
    loadPending.resolve({ ...workspace, name: '旧账号秘密' })
    savePending.resolve({ ...workspace, name: '旧账号保存' })
    await Promise.all([load, saved])
    expect(store.workspace?.name).toBe(workspace.name)
  })

  it('较旧的同会话加载不能覆盖新加载，部分失败可重试且不会冒充新鲜数据', async () => {
    setSession(true)
    const reads = mockReads()
    const pending = deferred<WorkspaceSettings>()
    reads.workspace.mockReturnValueOnce(pending.promise)
    const store = useSettingsStore()
    const oldLoad = store.loadSettings({ includeAdmin: true })
    reads.members.mockRejectedValueOnce(new Error('fixture failure'))
    await store.loadSettings({ includeAdmin: true })
    expect(store.loadErrorCount).toBe(1)
    expect(store.members).toEqual([])
    pending.resolve({ ...workspace, name: '旧快照' })
    await oldLoad
    expect(store.workspace?.name).toBe(workspace.name)
    await store.loadSettings({ includeAdmin: true })
    expect(store.loadErrorCount).toBe(0)
    expect(store.members).toEqual([member])
  })

  it('所有管理动作在存储边界拒绝普通用户', async () => {
    setSession(false)
    const calls = [
      vi.spyOn(settingsApi, 'updateWorkspace'), vi.spyOn(settingsApi, 'createMember'), vi.spyOn(settingsApi, 'updateMember'),
      vi.spyOn(settingsApi, 'deleteMember'), vi.spyOn(settingsApi, 'updateModelProviderConfig'), vi.spyOn(settingsApi, 'updateTelegramIntegration'), vi.spyOn(settingsApi, 'testTelegramIntegration'),
    ]
    const store = useSettingsStore()
    const actions = [
      () => store.saveWorkspace(workspace), () => store.createWorkspaceMember(member), () => store.updateWorkspaceMember(member.id, { role: 'Admin' }),
      () => store.deleteWorkspaceMember(member.id), () => store.configureModelProvider({ providerKey: 'fixture', enabled: true, baseUrl: 'https://example.test', defaultModel: 'fixture' }),
      () => store.configureTelegramIntegration({ enabled: true, chatId: 'fixture' }), () => store.testTelegramIntegration(),
    ]
    for (const action of actions) await expect(action()).rejects.toBeInstanceOf(SettingsAccessError)
    calls.forEach((call) => expect(call).not.toHaveBeenCalled())
  })

  it('成员记录标签更新不会改写实际身份或伪造审计事件', async () => {
    const auth = setSession(true)
    vi.spyOn(settingsApi, 'updateMember').mockResolvedValue({ ...member, role: 'Owner' })
    const store = useSettingsStore()
    store.members = [member]
    await store.updateWorkspaceMember(member.id, { role: 'Owner' })
    expect(auth.user!.rawRoles).toEqual(['ADMIN'])
    expect(store.members[0]!.role).toBe('Owner')
    expect(store.auditEvents).toEqual([])
  })
})

describe('退出与角色来源', () => {
  it('没有有效会话时不加载任何设置接口', async () => {
    const reads = mockReads()
    const store = useSettingsStore()
    await store.loadSettings({ includeAdmin: true })
    Object.values(reads).forEach((read) => expect(read).not.toHaveBeenCalled())
  })

  it('前端owner别名与成员Owner标签不能代替服务端ADMIN/OWNER角色', async () => {
    const auth = setSession(false)
    auth.user!.role = 'owner'
    auth.user!.roles = ['owner']
    auth.user!.rawRoles = []
    const reads = mockReads()
    const store = useSettingsStore()
    store.members = [{ ...member, role: 'Owner' }]
    await store.loadSettings({ includeAdmin: true })
    expect(reads.members).not.toHaveBeenCalled()
    expect(reads.providers).not.toHaveBeenCalled()
    await expect(store.saveWorkspace(workspace)).rejects.toBeInstanceOf(SettingsAccessError)
  })
})
