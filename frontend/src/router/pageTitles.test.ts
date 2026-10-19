// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { router } from './index'

const originalLocale = i18n.global.locale.value
const originalTitle = document.title

const localizedTitles = [
  {
    locale: 'zh-CN',
    titles: {
      '/home': '我的工作台',
      '/admin': '管理概览',
      '/projects': '项目',
      '/settings': '设置',
      '/': '公开首页',
    },
  },
  {
    locale: 'en-US',
    titles: {
      '/home': 'My workbench',
      '/admin': 'Admin overview',
      '/projects': 'Projects',
      '/settings': 'Settings',
      '/': 'Public Home',
    },
  },
  {
    locale: 'ja-JP',
    titles: {
      '/home': 'マイワークベンチ',
      '/admin': '管理の概要',
      '/projects': 'プロジェクト',
      '/settings': '設定',
      '/': '公開ホーム',
    },
  },
] as const

describe.each(localizedTitles)('$locale 页面标题', ({ locale, titles }) => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = {
      id: 'title-test-user',
      name: '标题测试用户',
      workspace: '标题测试工作区',
      role: 'owner',
      roles: ['owner'],
      rawRoles: ['ADMIN'],
    }
    vi.spyOn(auth, 'ensureFreshSession').mockResolvedValue(true)
    i18n.global.locale.value = locale
    document.title = '待导航'
  })

  afterEach(() => {
    i18n.global.locale.value = originalLocale
    document.title = originalTitle
    vi.restoreAllMocks()
  })

  it.each(Object.entries(titles))('导航至 %s 后显示翻译标题和产品名', async (path, title) => {
    await router.push(path)

    expect(router.currentRoute.value.path).toBe(path)
    expect(document.title).toBe(`${title} · AetherFlow`)
  })
})
