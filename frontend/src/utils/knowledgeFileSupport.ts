// pattern: Functional Core
import type { FileAsset } from '@/types/file'

export const SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS = [
  'bmp', 'csv', 'doc', 'docx', 'eml', 'epub', 'htm', 'html', 'jpeg', 'jpg', 'json', 'markdown', 'md', 'mdx',
  'msg', 'odp', 'ods', 'odt', 'pdf', 'png', 'ppt', 'pptx', 'properties', 'rtf', 'text', 'tif', 'tiff', 'tsv',
  'txt', 'vtt', 'xls', 'xlsx', 'xhtml', 'xml', 'yaml', 'yml',
] as const

const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS)

function fileExtension(name: string): string | null {
  const index = name.lastIndexOf('.')
  return index >= 0 && index < name.length - 1 ? name.slice(index + 1) : null
}

export function isSupportedKnowledgeFile(file: Readonly<FileAsset>): boolean {
  const mime = file.mime.trim().toLowerCase()
  const name = file.name.trim().toLowerCase()
  const extension = fileExtension(name)

  if (extension) {
    return SUPPORTED_EXTENSION_SET.has(extension)
  }

  return mime.startsWith('text/')
    || mime.includes('json')
    || mime.includes('markdown')
    || mime.includes('xml')
    || mime === 'application/pdf'
    || mime === 'application/epub+zip'
    || mime === 'message/rfc822'
}
