// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { nodeTemplates } from './workflowMock'

describe('CODE 节点默认示例契约', () => {
  it('新增 CODE 节点的默认示例只接受单个 payload 参数', () => {
    const template = nodeTemplates.find((item) => item.kind === 'code')!
    const code = String(template.config.code ?? '')

    expect(code).toContain('def main(payload)')
    expect(code).not.toContain('arg1')
    expect(code).not.toContain('arg2')
  })

  it('检查器的代码占位示例与 Python 运行时 main(payload) 契约一致', () => {
    const code = String(nodeTemplates.find((item) => item.kind === 'code')!.config.code ?? '')

    expect(code.split('\n').filter((line) => line.trim()).every((line) => !line.includes('arg'))).toBe(true)
  })
})
