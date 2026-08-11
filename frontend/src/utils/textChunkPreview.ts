// pattern: Functional Core

export interface TextChunkPreviewOptions {
  delimiter?: string
  cleanSpaces?: boolean
  cleanUrls?: boolean
}

function preprocess(text: string, options: TextChunkPreviewOptions) {
  let content = text
  if (options.cleanSpaces) {
    content = content
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\r?\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
  }
  if (options.cleanUrls) {
    content = content.replace(/https?:\/\/[^\s]+/g, '[URL]')
  }
  return content.trim()
}

function resolveDelimiter(delimiter?: string) {
  return delimiter
    ?.replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
    .replaceAll('\\t', '\t')
}

function splitWindow(text: string, chunkSize: number, overlap: number) {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    if (end >= text.length) break
    start = end - overlap
  }
  return chunks
}

export function splitTextForPreview(text: string, chunkSize: number, overlap: number, options: TextChunkPreviewOptions = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Chunk size must be a positive integer')
  }
  if (!Number.isInteger(overlap) || overlap < 0) {
    throw new Error('Overlap must be a non-negative integer')
  }
  if (overlap >= chunkSize) {
    throw new Error('Overlap must be smaller than chunk size')
  }

  const normalized = preprocess(text, options)
  if (!normalized) return []

  const delimiter = resolveDelimiter(options.delimiter)
  if (!delimiter) {
    return splitWindow(normalized, chunkSize, overlap)
  }
  return normalized
    .split(delimiter)
    .flatMap((section) => section.trim() ? splitWindow(section.trim(), chunkSize, overlap) : [])
}
