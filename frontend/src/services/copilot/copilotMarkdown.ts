// pattern: Functional Core

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineMarkdown(value: string) {
  // Code text and link destinations are literal, not another emphasis pass.
  // Escaping first makes these internal markers distinct from authored entities.
  const fragments: string[] = []
  const protect = (html: string) => {
    fragments.push(html)
    return `&#0;${fragments.length - 1}&#0;`
  }
  const renderEscaped = (text: string, links: boolean): string => {
    const pattern = links
      ? /`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
      : /`([^`]+)`/g
    let html = text.replace(pattern, (_match, code: string | undefined, label: string | undefined, href: string | undefined) => {
      if (code !== undefined) return protect(`<code>${code}</code>`)
      return protect(`<a href="${href}" target="_blank" rel="noopener noreferrer">${renderEscaped(label!, false)}</a>`)
    })
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/(^|[^\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    html = html.replace(/(^|[^\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
    return html.replace(/&#0;(\d+)&#0;/g, (_token, index: string) => fragments[Number(index)]!)
  }
  return renderEscaped(escapeHtml(value), true)
}

export function renderCopilotMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inCode = false
  let codeLanguage = ''
  let codeLines: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[] = []
  let paragraph: string[] = []

  const flushList = () => {
    if (!listType) return
    html.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${listType}>`)
    listType = null
    listItems = []
  }

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    html.push(`<p>${paragraph.map(inlineMarkdown).join('<br />')}</p>`)
    paragraph = []
  }

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([^\s]*)\s*$/)
    if (fence) {
      flushList()
      flushParagraph()
      if (inCode) {
        const className = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ''
        html.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        inCode = false
        codeLanguage = ''
        codeLines = []
      } else {
        inCode = true
        codeLanguage = fence[1]
      }
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/)
    if (heading) {
      flushList()
      flushParagraph()
      const level = heading[1].length
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      const nextType = unordered ? 'ul' : 'ol'
      if (listType !== nextType) {
        flushList()
        listType = nextType
      }
      listItems.push((unordered ?? ordered)?.[1] ?? '')
      continue
    }

    if (!line.trim()) {
      flushList()
      flushParagraph()
      continue
    }
    paragraph.push(line)
  }

  flushList()
  flushParagraph()
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }
  return html.join('')
}
