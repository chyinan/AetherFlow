import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const sidebar = readFileSync(join(root, 'src/components/layout/SidebarNav.vue'), 'utf8')
const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

const failures = []

if (/maxScale|magnificationRange|outwardShift|dockScale|dockItemStyle/.test(sidebar)) {
  failures.push('SidebarNav must not use dock magnification or outward-shift motion')
}

if (/pointermove="handleDockPointerMove"|pointerenter="handleDockPointerMove"/.test(sidebar)) {
  failures.push('SidebarNav must not animate items continuously from pointer position')
}

if (/scale\(|will-change-transform/.test(sidebar)) {
  failures.push('SidebarNav hover motion must avoid scale and will-change transform')
}

if (!/duration-120|duration-150/.test(sidebar)) {
  failures.push('SidebarNav should keep short, restrained transition duration')
}

if (!packageJson.includes('check:sidebar-motion')) {
  failures.push('package.json must expose check:sidebar-motion')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('sidebar motion is restrained and enterprise-friendly')
