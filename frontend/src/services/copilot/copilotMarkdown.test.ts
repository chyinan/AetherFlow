// @vitest-environment jsdom
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


describe('Copilot literal filenames and commands', () => {
  function content(markdown: string) {
    const element = document.createElement('div')
    element.innerHTML = renderCopilotMarkdown(markdown)
    return element
  }

  it('preserves inline command text instead of interpreting its Markdown punctuation', () => {
    const command = 'ffmpeg -i input_file_h264.mp4 -metadata title="**ready** _raw_"'
    const rendered = content('Run `'+command+'` then **check the result**.')
    expect(rendered.querySelector('code')?.textContent).toBe(command)
    expect(rendered.querySelector('code')?.children).toHaveLength(0)
    expect(rendered.querySelector('strong')?.textContent).toBe('check the result')
  })

  it('preserves a literal link destination including underscores and query values', () => {
    const url = 'https://example.com/video/recording_2026_11.mp4?model=sd_xl_base&download=1'
    const rendered = content('[Recording]('+url+')')
    expect(rendered.querySelector('a')?.getAttribute('href')).toBe(url)
    expect(rendered.querySelector('a')?.textContent).toBe('Recording')
  })

  it('keeps ordinary intraword underscores while supporting deliberate emphasis', () => {
    const rendered = content('Use input_file_h264.mp4 and sd_xl_base. _emphasis_ and __strong__.')
    expect(rendered.textContent).toBe('Use input_file_h264.mp4 and sd_xl_base. emphasis and strong.')
    expect(rendered.querySelector('em')?.textContent).toBe('emphasis')
    expect(rendered.querySelector('strong')?.textContent).toBe('strong')
  })

  it('retains formatting in link labels and outside protected code spans', () => {
    const url = 'https://example.com/video/recording_2026_11.mp4'
    const rendered = content('[**Original** `recording_2026_11.mp4`]('+url+') and **`output_file.mp4`**.')
    const link = rendered.querySelector('a')!
    expect(link.getAttribute('href')).toBe(url)
    expect(link.querySelector('strong')?.textContent).toBe('Original')
    expect(link.querySelector('code')?.textContent).toBe('recording_2026_11.mp4')
    expect(rendered.querySelector('p > strong > code')?.textContent).toBe('output_file.mp4')
  })

  it('leaves fenced commands and literal entity text unchanged', () => {
    const command = '  ffmpeg -i input_file_h264.mp4\n    echo "__ready__"'
    const rendered = content('```sh\n'+command+'\n```\n\n`&#0;0&#0;`')
    expect(rendered.querySelector('pre code')?.textContent).toBe(command)
    expect(rendered.querySelector('p code')?.textContent).toBe('&#0;0&#0;')
  })
})
