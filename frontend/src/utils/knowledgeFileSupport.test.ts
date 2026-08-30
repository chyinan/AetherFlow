import { describe, expect, it } from 'vitest'

import type { FileAsset } from '@/types/file'

import { isSupportedKnowledgeFile } from './knowledgeFileSupport'

function file(name: string, mime: string): FileAsset {
  return {
    id: name,
    name,
    mime,
    type: 'document',
    source: 'input',
    size: '1 KB',
    status: 'ready',
    updatedAt: '',
  }
}

describe('知识库文件支持', () => {
  it('接受能够按文本读取的文件', () => {
    expect(isSupportedKnowledgeFile(file('guide.md', 'text/markdown'))).toBe(true)
    expect(isSupportedKnowledgeFile(file('data.json', 'application/json'))).toBe(true)
  })

  it('接受后端统一解析链真实支持的二进制文档', () => {
    expect(isSupportedKnowledgeFile(file('manual.pdf', 'application/pdf'))).toBe(true)
    expect(isSupportedKnowledgeFile(file('runbook.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe(true)
    expect(isSupportedKnowledgeFile(file('mail.msg', 'application/vnd.ms-outlook'))).toBe(true)
    expect(isSupportedKnowledgeFile(file('book.epub', 'application/epub+zip'))).toBe(true)
  })

  it('拒绝媒体和可执行文件', () => {
    expect(isSupportedKnowledgeFile(file('meeting.mp4', 'video/mp4'))).toBe(false)
    expect(isSupportedKnowledgeFile(file('payload.exe', 'application/octet-stream'))).toBe(false)
  })
})
