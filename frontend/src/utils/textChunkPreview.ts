// pattern: Functional Core

export function splitTextForPreview(text: string, chunkSize: number, overlap: number) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Chunk size must be a positive integer')
  }
  if (!Number.isInteger(overlap) || overlap < 0) {
    throw new Error('Overlap must be a non-negative integer')
  }
  if (overlap >= chunkSize) {
    throw new Error('Overlap must be smaller than chunk size')
  }

  const normalized = text.trim()
  if (!normalized) return []

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length)
    chunks.push(normalized.slice(start, end))
    if (end >= normalized.length) break
    start = end - overlap
  }
  return chunks
}
