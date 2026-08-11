import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('人工干预渠道契约', () => {
  it('不展示尚未实现的消息渠道', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain("['Slack', 'Teams', 'Discord']")
    expect(source).not.toContain("workflow.inspector.comingSoon")
    expect(source).not.toMatch(/<button[^>]*>\s*\{\{ t\('workflow\.inspector\.importFromTool'\) \}\}/)
    expect(source).not.toMatch(/<button[^>]*>\s*\{\{ t\('workflow\.inspector\.extractionUnset'\) \}\}/)
  })

  it('不展示执行器尚未实现的人工审批超时设置', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const humanPanel = source.slice(source.indexOf("selectedKind === 'human'"), source.indexOf("selectedKind === 'iteration'"))

    expect(humanPanel).not.toContain("numberConfig('timeoutValue'")
    expect(humanPanel).not.toContain('humanTimeoutUnits')
  })
})

describe('迭代与循环节点契约', () => {
  it('不展示运行器不会执行的嵌套节点配置', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain("t('workflow.inspector.parallelMode')")
    expect(source).not.toContain("t('workflow.inspector.maxParallelism')")
    expect(source).not.toContain("t('workflow.inspector.errorResponseMethod')")
    expect(source).not.toContain("t('workflow.inspector.flattenOutput')")
    expect(source).not.toContain("t('workflow.inspector.nestedBodyNodes')")
    expect(source).not.toContain('handleNestedBodyNodesInput')
  })

  it('向用户说明当前节点的执行边界', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).toContain("workflow.inspector.iterationSemantics")
  })
})

describe('节点配置与后端执行语义一致', () => {
  it('不展示输出节点当前不支持的响应模式和产物开关', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const outputPanel = source.slice(source.indexOf("selectedKind === 'output'"), source.indexOf("selectedKind === 'agent'"))

    expect(outputPanel).not.toContain("textConfig('responseMode'")
    expect(outputPanel).not.toContain("boolConfig('exposeArtifacts'")
  })

  it('为变量聚合节点展示 variables 和 outputVariable，而不是赋值器表单', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain("selectedKind === 'variable-assigner' || selectedKind === 'variable-aggregate'")
    expect(source).toContain("selectedKind === 'variable-aggregate'")
    expect(source).toContain("textConfig('variables'")
    expect(source).toContain("textConfig('outputVariable'")
  })

  it('不展示参数提取节点未被执行器读取的视觉和参数字段', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const panelStart = source.indexOf(`<section v-else-if="selectedKind === 'parameter-extractor'"`)
    const parameterPanel = source.slice(panelStart, source.indexOf('<section v-else-if="hasDynamicConfigPanel"', panelStart))

    expect(parameterPanel).not.toContain("boolConfig('vision'")
    expect(parameterPanel).not.toContain("textConfig('parameters'")
    expect(parameterPanel).toContain("textConfig('inputVariable'")
  })

  it('只展示 Agent 执行器实际产出的 plan 和 actionLog', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const agentPanel = source.slice(source.indexOf("selectedKind === 'agent'"), source.indexOf("selectedKind === 'question-classifier'"))

    expect(agentPanel).not.toContain('function-calling')
    expect(agentPanel).not.toContain('value="react"')
    expect(source).toContain("name: 'plan'")
    expect(source).toContain("name: 'actionLog'")
    expect(agentPanel).toContain("textConfig('taskVariable'")
    expect(agentPanel).toContain("textConfig('model'")
  })

  it('展示人工审批执行器实际产出的变量', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const humanPanel = source.slice(source.indexOf("selectedKind === 'human'"), source.indexOf("selectedKind === 'iteration'"))

    expect(humanPanel).not.toContain("name: '__action_id'")
    expect(source).toContain("name: 'approved'")
    expect(source).toContain("name: 'approval'")
  })

  it('允许从变量搜索结果直接填入分类器输入变量', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).toContain('classifierVariableSearch')
    expect(source).toContain('selectClassifierVariable')
  })

  it('LLM 面板使用实际的提示词和上下文变量字段', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const llmPanel = source.slice(source.indexOf("selectedKind === 'llm'"), source.indexOf("selectedKind === 'knowledge-retrieval'"))

    expect(llmPanel).toContain("textConfig('promptVariable'")
    expect(llmPanel).toContain("textConfig('contextVariable'")
    expect(llmPanel).toContain("handleTextInput('contextVariable'")
  })

  it('问题理解和翻译面板暴露可绑定的输入变量', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const understandPanel = source.slice(source.indexOf("selectedKind === 'question-understand'"), source.indexOf("selectedKind === 'question-classifier'"))
    const translatePanel = source.slice(source.indexOf("selectedKind === 'translate'"), source.indexOf("selectedKind === 'summary'"))

    expect(understandPanel).toContain("textConfig('inputVariable'")
    expect(translatePanel).toContain("textConfig('textVariable'")
  })

  it('清空数字输入时保留空值而不是写入零', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).toContain("value === '' ? '' : Number(value)")
  })

  it('使用后端实际字段编辑知识检索查询和知识库', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const retrievalPanel = source.slice(source.indexOf("selectedKind === 'knowledge-retrieval'"), source.indexOf("selectedKind === 'output'"))

    expect(retrievalPanel).toContain("textConfig('queryText'")
    expect(retrievalPanel).toContain("textConfig('queryVariable'")
    expect(retrievalPanel).toContain("textConfig('datasetId'")
    expect(retrievalPanel).not.toContain("textConfig('query',")
    expect(retrievalPanel).not.toContain("textConfig('dataset',")
  })

  it('使用 OCR 执行器实际读取的 fileIdVariable 字段', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')
    const extractorPanel = source.slice(source.indexOf("selectedKind === 'document-extractor'"), source.indexOf("selectedKind === 'variable-assigner'"))

    expect(extractorPanel).toContain("textConfig('fileIdVariable'")
    expect(extractorPanel).not.toContain("textConfig('file',")
  })
})

describe('复杂配置编辑体验', () => {
  it('使用 JSON 编辑器处理对象配置，避免把对象渲染成 [object Object]', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).toContain('structuredConfigDraft')
    expect(source).toContain('JSON.stringify(value, null, 2)')
    expect(source).toContain('handleStructuredConfigInput')
  })
})
