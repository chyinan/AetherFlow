import { describe, expect, it } from 'vitest'

import { renderCopilotMarkdown } from './copilotMarkdown'

describe('renderCopilotMarkdown', () => {
  it('renders common assistant markdown blocks', () => {
    const html = renderCopilotMarkdown('# 标题\n\n**重点**：`summary`\n\n- 第一步\n- 第二步')

    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>重点</strong>')
    expect(html).toContain('<code>summary</code>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>第二步</li>')
  })

  it('escapes raw HTML before rendering markdown', () => {
    const html = renderCopilotMarkdown('<script>alert(1)</script> **安全**')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('<strong>安全</strong>')
  })
})
