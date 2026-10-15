export type ProductCapabilities = {
  managePlatform: boolean
  personalWorkspace: boolean
}

// 此处只组织客户端体验；所有授权仍由后端按登录身份校验。
// SettingsMember 的成员记录标签以及前端显示别名均不能授予账号权限。
export function productCapabilities(user: unknown): ProductCapabilities {
  const rawRoles = user && typeof user === 'object' ? (user as Record<string, unknown>).rawRoles : undefined
  const roles = Array.isArray(rawRoles) ? rawRoles.filter((role): role is string => typeof role === 'string') : []
  return {
    managePlatform: roles.some((role) => ['ADMIN', 'OWNER'].includes(role.trim().toUpperCase())),
    personalWorkspace: roles.some((role) => ['USER', 'ADMIN', 'OWNER'].includes(role.trim().toUpperCase())),
  }
}

export function defaultProductPath(isAdmin: boolean) {
  return isAdmin ? '/admin' : '/home'
}
