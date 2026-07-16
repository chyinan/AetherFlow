import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const settingsPage = readFileSync(resolve(frontendRoot, 'src/pages/settings/SettingsPage.vue'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'))

const fail = (message) => {
  console.error(`设置页数据接入状态胶囊检查失败：${message}`)
  process.exitCode = 1
}

if (packageJson.scripts?.['check:settings-data-access-badges'] !== 'node scripts/check-settings-data-access-badges.mjs') {
  fail('package.json 未暴露 check:settings-data-access-badges 命令。')
}

const cardsStart = settingsPage.indexOf('<section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">')
const cardsEnd = settingsPage.indexOf('<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">', cardsStart)

if (cardsStart < 0 || cardsEnd < 0) {
  fail('无法定位数据接入卡片区域。')
} else {
  const dataAccessCardsTemplate = settingsPage.slice(cardsStart, cardsEnd)
  const standaloneComingSoonBadge = /<span\s+[\s\S]*?v-if="card\.status === 'coming-soon'"[\s\S]*?settings\.comingSoon[\s\S]*?<\/span>/

  if (standaloneComingSoonBadge.test(dataAccessCardsTemplate)) {
    fail('“即将上线”卡片同时渲染了独立绝对定位胶囊和通用状态胶囊。')
  }

  if (!dataAccessCardsTemplate.includes(':class="statusBadgeClass(card.status)"')) {
    fail('数据接入卡片缺少统一的状态胶囊样式入口。')
  }

  if (!dataAccessCardsTemplate.includes('{{ statusLabel(card.status) }}')) {
    fail('数据接入卡片缺少统一的状态文本入口。')
  }
}

if (!process.exitCode) {
  console.log('设置页数据接入状态胶囊检查通过。')
}
