import { describe, expect, it } from 'vitest'

import { runApi } from './runApi'

describe('runApi 正式模式', () => {
  it('未知运行 ID 不回退到演示运行', async () => {
    await expect(runApi.getRun('unknown-run')).rejects.toThrow('invalid workflow run id')
  })

  it('未知运行 ID 不回退到演示日志', async () => {
    await expect(runApi.getLogs('unknown-run')).rejects.toThrow('invalid workflow run id')
  })

  it('即使 ID 命中演示数据，正式模式也不返回演示结果', async () => {
    await expect(runApi.getRun('run-20260528-001')).rejects.toThrow('invalid workflow run id')
    await expect(runApi.getLogs('run-20260528-001')).rejects.toThrow('invalid workflow run id')
  })
})
