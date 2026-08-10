import type { FileAsset } from '@/types/file'

const TEXT_FILE_EXTENSIONS = ['.csv', '.json', '.md', '.mdx', '.text', '.txt', '.xml', '.yaml', '.yml']

export function isSupportedKnowledgeFile(file: Readonly<FileAsset>): boolean {
  const mime = file.mime.trim().toLowerCase()
  const name = file.name.trim().toLowerCase()

  return mime.startsWith('text/')
    || mime.includes('json')
    || mime.includes('markdown')
    || mime.includes('xml')
    || TEXT_FILE_EXTENSIONS.some((extension) => name.endsWith(extension))
}
