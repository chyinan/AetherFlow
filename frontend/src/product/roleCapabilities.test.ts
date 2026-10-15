import { describe, expect, it } from 'vitest'
import { defaultProductPath, productCapabilities } from './roleCapabilities'

describe('登录角色与产品能力', () => {
  it.each(['ADMIN', 'OWNER', ' admin '])('%s 可管理平台且保有个人工作台', (role) => {
    expect(productCapabilities({ rawRoles: [role] })).toEqual({ managePlatform: true, personalWorkspace: true })
  })
  it.each([undefined, [], ['USER'], ['Operator'], ['Viewer']])('非管理员不获得平台管理能力：%j', (rawRoles) => {
    expect(productCapabilities({ rawRoles }).managePlatform).toBe(false)
  })
  it('前端显示别名不能覆盖真实 USER 登录角色', () => {
    expect(productCapabilities({ rawRoles: ['USER'], ...{ role: 'owner', roles: ['owner'] } })).toEqual({ managePlatform: false, personalWorkspace: true })
  })
  it('登录默认进入对应的工作台', () => {
    expect(defaultProductPath(false)).toBe('/home')
    expect(defaultProductPath(true)).toBe('/admin')
  })
})
