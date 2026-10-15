// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { router } from './index'
function identity(role: 'USER' | 'ADMIN' | 'OWNER') {
  const auth = useAuthStore()
  auth.user = { id: 'synthetic-user', name: 'Synthetic User', workspace: 'Synthetic', role: role === 'USER' ? 'operator' : 'owner', roles: [role === 'USER' ? 'operator' : 'owner'], rawRoles: [role] }
  vi.spyOn(auth, 'ensureFreshSession').mockResolvedValue(true)
  return auth
}
describe('角色落点与深链接', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it.each(['ADMIN', 'OWNER'] as const)('%s 默认管理概览并可回个人工作台', async (role) => {
    identity(role); await router.push('/entry'); expect(router.currentRoute.value.path).toBe('/admin')
    await router.push('/home'); expect(router.currentRoute.value.path).toBe('/home')
  })
  it('USER 登录和重访登录页均进入个人工作台', async () => {
    identity('USER'); await router.push('/entry'); expect(router.currentRoute.value.path).toBe('/home')
    await router.push('/login'); expect(router.currentRoute.value.path).toBe('/home')
  })
  it.each(['/admin', '/monitor'])('USER 直接访问 %s 有明确安全落点', async (path) => {
    identity('USER'); await router.push(path)
    expect(router.currentRoute.value.path).toBe('/home'); expect(router.currentRoute.value.query.notice).toBe('admin-required')
  })
  it('个人深链接保留具体路径与查询', async () => {
    identity('USER'); await router.push('/runs/synthetic-run?status=FAILED')
    expect(router.currentRoute.value.fullPath).toBe('/runs/synthetic-run?status=FAILED')
  })
  it('未登录先登录并保留管理目标', async () => {
    const auth = identity('USER'); vi.mocked(auth.ensureFreshSession).mockResolvedValue(false)
    await router.push('/admin'); expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/admin')
  })
  it('降权后不沿用owner显示别名', async () => {
    const auth = identity('ADMIN'); await router.push('/admin'); auth.user!.rawRoles = ['USER']
    await router.push('/monitor'); expect(router.currentRoute.value.path).toBe('/home')
  })
})
