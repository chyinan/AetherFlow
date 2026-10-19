// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { flushPromises, mount } from '@vue/test-utils'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import loadConfig from 'tailwindcss/loadConfig'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  projectStore: {
    projects: [] as Array<Record<string, unknown>>,
    workflowSummaries: [] as Array<Record<string, unknown>>,
    deletingWorkflowIds: {} as Record<string, boolean>,
    workflowDeleteErrors: {} as Record<string, boolean>,
    currentProjectId: '',
    loading: false,
    loadError: null as string | null,
    loadProjects: vi.fn(),
    projectWorkflows: vi.fn(() => []),
    projectMetrics: vi.fn(() => null),
    selectProject: vi.fn(),
    createProject: vi.fn(),
    renameProjectWorkflow: vi.fn(),
    deleteProjectWorkflow: vi.fn(),
    linkWorkflowToProject: vi.fn(),
  },
  runStore: { loadRuns: vi.fn() },
  fileStore: { loadFiles: vi.fn(), files: [] },
  difyStore: { loadSurface: vi.fn() },
  router: { push: vi.fn() },
}))

vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => mocks.projectStore }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => mocks.runStore }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => mocks.fileStore }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => mocks.difyStore }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }))

import { i18n } from '@/i18n'
import ProjectsPage from './ProjectsPage.vue'

function project() {
  return {
    id: 'project-1',
    name: '媒体项目',
    description: '项目描述',
    health: 'idle',
    environment: 'dev',
    scenario: 'media',
    owner: 'operator',
    slaTarget: '99%',
    workflowCount: 0,
    activeRunCount: 0,
    fileCount: 0,
    queueDepth: 0,
    knowledgeCount: 0,
    lastRunStatus: 'idle',
    workflows: [],
  }
}

describe('ProjectsPage empty states', () => {
  beforeEach(() => {
    mocks.projectStore.projects = []
    mocks.projectStore.workflowSummaries = []
    mocks.projectStore.currentProjectId = ''
    mocks.projectStore.loading = false
    mocks.projectStore.loadError = null
    mocks.projectStore.loadProjects.mockReset().mockResolvedValue(undefined)
    mocks.runStore.loadRuns.mockReset().mockResolvedValue(undefined)
    mocks.fileStore.loadFiles.mockReset().mockResolvedValue(undefined)
    mocks.difyStore.loadSurface.mockReset().mockResolvedValue(undefined)
    mocks.projectStore.projectWorkflows.mockReset().mockReturnValue([])
  })

  it('explains that no project exists and offers project creation', async () => {
    const wrapper = mount(ProjectsPage, {
      global: {
        plugins: [i18n],
        stubs: { StatusBadge: true },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-state="no-projects"]').text()).toContain('尚未创建项目')
    expect(wrapper.find('[data-action="create-project"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('explains that a project has no workflow and offers workflow creation', async () => {
    mocks.projectStore.projects = [project()]

    const wrapper = mount(ProjectsPage, {
      global: {
        plugins: [i18n],
        stubs: { StatusBadge: true },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-state="no-workflows"]').text()).toContain('尚未创建工作流')
    expect(wrapper.find('[data-action="create-first-workflow"]').exists()).toBe(true)
    wrapper.unmount()
  })

  describe('空状态主题对比度', () => {
    type Color = [number, number, number, number]
    let themeCss: string

    beforeAll(async () => {
      // 直接读取源码，避免 Vitest 将 CSS 导入替换为空样式。
      const mainCss = readFileSync('src/styles/main.css', 'utf8')
      const projectsSource = readFileSync('src/pages/projects/ProjectsPage.vue', 'utf8')
      const tailwindConfig = loadConfig(resolve('tailwind.config.ts'))
      const compiled = await postcss([tailwindcss({
        ...tailwindConfig,
        content: [{ raw: projectsSource, extension: 'vue' }],
      })]).process('@tailwind utilities;', { from: undefined })
      // 使用真实工具类和暗色覆盖；去除无需加载的外部 Vue Flow 样式。
      themeCss = `${compiled.css}\n${mainCss.replace(/^@import[^\n]*\n/gm, '')}`
    })

    function readColor(element: Element, property: string): Color {
      const style = getComputedStyle(element)
      // JSDOM 保留 rgb() 中的 Tailwind 透明度变量，按实际变量值或回退值解析。
      const resolved = style.getPropertyValue(property).replace(
        /var\((--[\w-]+)(?:,\s*([^)]+))?\)/g,
        (_match, name: string, fallback: string | undefined) => (
          style.getPropertyValue(name).trim() || fallback?.trim() || '1'
        ),
      )
      const channels = resolved.match(/[\d.]+/g)?.map(Number) ?? []
      if (!resolved.startsWith('rgb') || channels.length < 3) {
        throw new Error(`无法解析计算颜色 ${property}: ${resolved}`)
      }
      return [channels[0], channels[1], channels[2], channels[3] ?? 1]
    }

    function composite(foreground: Color, background: Color): Color {
      const alpha = foreground[3]
      return [
        foreground[0] * alpha + background[0] * (1 - alpha),
        foreground[1] * alpha + background[1] * (1 - alpha),
        foreground[2] * alpha + background[2] * (1 - alpha),
        1,
      ]
    }

    function luminance(color: Color): number {
      const linear = color.slice(0, 3).map(value => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
    }

    function contrastRatio(first: Color, second: Color): number {
      const values = [luminance(first), luminance(second)]
      return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)
    }

    it.each(['light', 'dark'] as const)('%s 主题下提示条保持对应明暗并可读', async theme => {
      const originalTheme = document.documentElement.getAttribute('data-theme')
      document.documentElement.dataset.theme = theme
      const themeStyles = document.createElement('style')
      themeStyles.textContent = themeCss
      document.head.append(themeStyles)
      mocks.projectStore.projects = [project()]
      const wrapper = mount(ProjectsPage, {
        attachTo: document.body,
        global: { plugins: [i18n], stubs: { StatusBadge: true, RouterLink: true } },
      })

      try {
        await flushPromises()
        expect(document.documentElement.dataset.theme).toBe(theme)
        const banner = wrapper.get('[data-state="no-workflows"]')
        const pageBackground = readColor(wrapper.get('main').element, 'background-color')
        const background = composite(readColor(banner.element, 'background-color'), pageBackground)
        const paragraphs = banner.findAll('p')
        expect(paragraphs).toHaveLength(2)
        for (const paragraph of paragraphs) {
          const foreground = composite(readColor(paragraph.element, 'color'), background)
          expect(contrastRatio(foreground, background), `${theme}: ${paragraph.text()}`).toBeGreaterThanOrEqual(4.5)
        }
        if (theme === 'dark') {
          expect(luminance(background)).toBeLessThan(0.1)
        } else {
          expect(luminance(background)).toBeGreaterThan(0.8)
        }
        expect(banner.get('[data-action="create-first-workflow"]').isVisible()).toBe(true)
      } finally {
        wrapper.unmount()
        themeStyles.remove()
        if (originalTheme === null) {
          document.documentElement.removeAttribute('data-theme')
        } else {
          document.documentElement.setAttribute('data-theme', originalTheme)
        }
      }
    })
  })
})
