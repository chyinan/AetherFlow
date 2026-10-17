// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const forbiddenAction = () => vi.fn(() => { throw new Error('展示测试不得执行业务操作') })
  return {
    difyStore: {
      datasets: [] as unknown[],
      selectedDataset: undefined as unknown,
      selectedDatasetDocuments: [],
      retrievalResults: [],
      loadSurface: vi.fn(async () => undefined),
      selectDataset: vi.fn(async () => undefined),
      runRetrievalTest: forbiddenAction(),
      createDatasetFromWizard: forbiddenAction(),
      importFileToSelectedDataset: forbiddenAction(),
      deleteDataset: forbiddenAction(),
      deleteDocument: forbiddenAction(),
    },
    fileStore: {
      files: [] as unknown[],
      uploading: false,
      uploadProgress: 0,
      loadFiles: vi.fn(async () => undefined),
      upload: forbiddenAction(),
    },
    knowledgeContentFromFile: forbiddenAction(),
  }
})

// 整模块替身避免加载真实业务存储；所有元数据都属于同一个合成用户。
vi.mock('@/stores/difyStore', () => ({
  useDifyStore: () => mocks.difyStore,
  knowledgeContentFromFile: mocks.knowledgeContentFromFile,
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => mocks.fileStore }))

import { i18n } from '@/i18n'
import KnowledgePage from './KnowledgePage.vue'

let page: VueWrapper | undefined
const text = (key: string) => i18n.global.t(key)

function dataset(id: string, name: string) {
  return {
    id, name, description: '展示夹具', status: 'ready',
    documentCount: 0, chunkCount: 0, hitRate: 0, tags: [],
    embeddingModel: '展示模型', retrievalMode: '展示模式', owner: 'synthetic-user',
  }
}

async function render() {
  page = mount(KnowledgePage, { global: { plugins: [i18n] } })
  await flushPromises()
  return page
}

function buttonWithText(label: string) {
  const button = page!.findAll('button').find((item) => item.text().includes(label))
  expect(button, `缺少按钮：${label}`).toBeDefined()
  return button!
}

async function openSegmentation() {
  // 仅提供就绪文件的内存元数据以显示第2步，不选择、上传、读取或导入文件。
  mocks.fileStore.files = [{
    id: 'presentation-file', name: '展示素材.md', mime: 'text/markdown',
    type: 'document', source: 'input', status: 'ready', size: '1 KB', updatedAt: '',
  }]
  await render()
  await page!.get('[data-action="create-knowledge"]').trigger('click')
  await page!.get('[data-action="next-source"]').trigger('click')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.difyStore.datasets = [dataset('presentation-a', '产品手册'), dataset('presentation-b', '使用指南')]
  mocks.difyStore.selectedDataset = mocks.difyStore.datasets[0]
  mocks.fileStore.files = []
  i18n.global.locale.value = 'zh-CN'
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('展示测试禁止真实网络请求') }))
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('展示测试禁止真实网络请求') })
})

afterEach(() => {
  page?.unmount()
  page = undefined
  expect(mocks.difyStore.runRetrievalTest).not.toHaveBeenCalled()
  expect(mocks.difyStore.createDatasetFromWizard).not.toHaveBeenCalled()
  expect(mocks.difyStore.importFileToSelectedDataset).not.toHaveBeenCalled()
  expect(mocks.difyStore.deleteDataset).not.toHaveBeenCalled()
  expect(mocks.difyStore.deleteDocument).not.toHaveBeenCalled()
  expect(mocks.fileStore.upload).not.toHaveBeenCalled()
  expect(mocks.knowledgeContentFromFile).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('知识库页面展示层级', () => {
  it('列表保留单一创建入口、全宽内容和可发现的轻量提示', async () => {
    await render()
    const list = page!.get('main > section')
    expect(list.classes()).not.toContain('lg:grid-cols-[312px_minmax(0,1fr)]')
    expect(list.find('aside').exists()).toBe(false)
    expect(page!.findAll('button').filter((button) => button.text() === text('knowledge.flow.createKnowledge'))).toHaveLength(1)
    const tip = list.get('details')
    expect(tip.attributes('open')).toBeUndefined()
    expect(tip.get('summary').text()).toBe(text('knowledge.flow.didYouKnow'))
    expect(tip.text()).toContain(text('knowledge.flow.knowledgeTip'))
    expect(list.findAll('[data-action="open-dataset"]')).toHaveLength(2)
  })

  it('列表搜索保留匹配、空结果和清空恢复', async () => {
    await render()
    const search = page!.get(`input[aria-label="${text('knowledge.flow.searchKnowledge')}"]`)
    await search.setValue('产品')
    expect(page!.findAll('[data-action="open-dataset"]')).toHaveLength(1)
    expect(page!.get('[data-action="open-dataset"]').text()).toContain('产品手册')
    await search.setValue('无匹配的内容')
    expect(page!.findAll('[data-action="open-dataset"]')).toHaveLength(0)
    expect(page!.get('main').text()).toContain(text('common.noResult'))
    await search.setValue('')
    expect(page!.findAll('[data-action="open-dataset"]')).toHaveLength(2)
  })

  it('创建入口保留三步导航和既有导入控件', async () => {
    await render()
    await page!.get('[data-action="create-knowledge"]').trigger('click')
    for (const key of ['selectDataSource', 'segmentAndClean', 'processAndFinish']) {
      expect(page!.get('main').text()).toContain(text(`knowledge.flow.${key}`))
    }
    expect(page!.find('input[type="file"]').exists()).toBe(true)
    expect(page!.get('select').element.closest('label')?.textContent).toContain(text('knowledge.importFromFiles'))
    expect(page!.get('[data-action="next-source"]').text()).toBe(text('knowledge.flow.nextStep'))
    expect(buttonWithText(text('knowledge.flow.chooseFile')).exists()).toBe(true)
  })

  it('分片和索引选项通过按下状态表达当前选择', async () => {
    await openSegmentation()
    const general = buttonWithText(text('knowledge.flow.generalMode'))
    const parentChild = buttonWithText(text('knowledge.flow.parentChildMode'))
    expect(general.attributes('aria-pressed')).toBe('true')
    expect(parentChild.attributes('aria-pressed')).toBe('false')
    await parentChild.trigger('click')
    expect(general.attributes('aria-pressed')).toBe('false')
    expect(parentChild.attributes('aria-pressed')).toBe('true')

    const quality = buttonWithText(text('knowledge.flow.highQuality'))
    const economy = buttonWithText(text('knowledge.flow.economy'))
    expect(quality.attributes('aria-pressed')).toBe('false')
    expect(economy.attributes('aria-pressed')).toBe('true')
    await quality.trigger('click')
    expect(quality.attributes('aria-pressed')).toBe('true')
    expect(economy.attributes('aria-pressed')).toBe('false')
  })

  it('Top K数字框和滑块有永久关联标签', async () => {
    await openSegmentation()
    const number = page!.get('input[type="number"][max="50"]')
    const slider = page!.get('input[type="range"]')
    const label = page!.get('label[for="knowledge-top-k"]')
    expect(label.text()).toBe('Top K')
    expect(number.attributes('id')).toBe('knowledge-top-k')
    expect(slider.attributes('aria-labelledby')).toBe(label.attributes('id'))
    expect(label.attributes('id')).toBeTruthy()
    for (const control of [number, slider]) {
      expect(control.attributes('min')).toBe('1')
      expect(control.attributes('max')).toBe('50')
    }
    await number.setValue('7')
    expect((slider.element as HTMLInputElement).value).toBe('7')
  })

  it('文档检索输入有永久关联标签并保留相关入口', async () => {
    await render()
    await page!.get('[data-action="open-dataset"]').trigger('click')
    await flushPromises()
    const form = page!.get('form[data-action="retrieval-test"]')
    const query = form.get('input')
    const label = page!.get('label[for="knowledge-retrieval-query"]')
    expect(label.text()).toBe(text('knowledge.retrievalTest'))
    expect(query.attributes('id')).toBe('knowledge-retrieval-query')
    expect(form.get('button[type="submit"]').text()).toBe(text('common.search'))
    expect(buttonWithText(text('knowledge.flow.addFile')).exists()).toBe(true)
    expect(buttonWithText(text('knowledge.importSelected')).exists()).toBe(true)
  })
})
