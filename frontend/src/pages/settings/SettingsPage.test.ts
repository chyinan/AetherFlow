import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('模型供应商配置入口', () => {
  it('不会在打开配置对话框前伪造已安装状态', () => {
    const source = readFileSync(fileURLToPath(new URL('./SettingsPage.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain('settingsStore.installModelProvider(providerId)')
    expect(source).toContain('openProviderConfig(provider)')
  })

  it('does not expose non-persistent catalog mutation controls', () => {
    const source = readFileSync(fileURLToPath(new URL('./SettingsPage.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain('function connectDataSource')
    expect(source).not.toContain('function configureApiExtension')
    expect(source).not.toContain('@click="connectDataSource')
    expect(source).not.toContain('@click="configureApiExtension')
  })

  it('keeps partial settings failures recoverable without a page refresh', () => {
    const source = readFileSync(fileURLToPath(new URL('./SettingsPage.vue', import.meta.url)), 'utf8')

    expect(source).toContain('data-action="retry-settings"')
    expect(source).toContain('settingsStore.loadSettings()')
  })
})
