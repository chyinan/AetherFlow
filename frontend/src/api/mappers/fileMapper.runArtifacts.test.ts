import { describe, expect, it } from 'vitest'
import type { FileAssetMetadataView } from '@/api/modules/file'
import { mapFileAssetViewToAsset } from './fileMapper'

function artifact(overrides: Partial<FileAssetMetadataView> = {}): FileAssetMetadataView {
  return {
    id: 101, name: 'meeting-summary.md', source: 'artifact', artifactKind: 'summary',
    mime: 'text/markdown', status: 'ready', workflowId: '42', ...overrides,
  }
}

describe('后端运行产物关联', () => {
  it('将后端产物元数据的运行实例 ID 映射成前端 run ID，不依赖名称或存储目录', () => {
    const first = mapFileAssetViewToAsset(artifact({ workflowId: '41', objectKey: 'workflow/exports/41/export/hash-meeting-summary.md' }))
    const second = mapFileAssetViewToAsset(artifact({ id: 102, workflowId: '42', objectKey: 'team-output/user-7/workflow-42/node-export/hash-meeting-summary.md' }))
    expect(first.name).toBe(second.name)
    expect(first.linkedRunId).toBe('run-41')
    expect(second.linkedRunId).toBe('run-42')
    expect(first.backendFileId).toBe('101')
    expect(second.backendFileId).toBe('102')
  })

  it('历史导出使用后端回填的 workflowId，同样支持运行筛选', () => {
    expect(mapFileAssetViewToAsset(artifact({ source: undefined, workflowId: '43', objectKey: 'workflow/exports/43/export/result.md' })).linkedRunId).toBe('run-43')
  })

  it('字符串实例 ID 保持原始精度，不转为 JavaScript 数字', () => {
    expect(mapFileAssetViewToAsset(artifact({ workflowId: '9007199254740993' })).linkedRunId).toBe('run-9007199254740993')
  })

  it('普通输入即使关联了 workflowId，也不能冒充该运行的成品', () => {
    expect(mapFileAssetViewToAsset(artifact({ source: 'input', workflowId: '42' })).linkedRunId).toBeUndefined()
  })

  it.each([undefined, '', '0', '-1', '1.5', 'run-42', 'wf-42', '42/foo'])('缺失或无效实例 ID %s 不从文件名和存储键猜运行', workflowId => {
    const mapped = mapFileAssetViewToAsset(artifact({ workflowId, name: 'run-42.md', objectKey: 'workflow/exports/42/export/result.md' }))
    expect(mapped.linkedRunId).toBeUndefined()
  })
})
