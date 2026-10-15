import { describe, expect, it } from 'vitest'
import { failedNodeEditLocation, runArtifactsLocation, runReturnLocation } from './runNavigation'

describe('运行来源导航契约', () => {
  it('保留同一运行的完整历史筛选、重复参数、分页和锚点', () => {
    const source = '/runs/run-12?q=%E4%BC%9A%E8%AE%AE&workflowId=workflow-9&status=FAILED&page=3&pageSize=50&tag=a&tag=b#detail'
    expect(runReturnLocation('run-12', source)).toBe(source)
    expect(runArtifactsLocation('run-12', source)).toEqual({ path: '/files', query: { runId: 'run-12', runReturnLocation: source } })
    expect(runArtifactsLocation('run-12')).toEqual({ path: '/files', query: { runId: 'run-12' } })
  })

  it.each([
    undefined, null, '', '/runs/run-123?page=3', '/runs/run-13', '/runs/run-12/child',
    '/runs/run-12/../run-13', '//evil.test/runs/run-12', 'https://evil.test/runs/run-12',
    'javascript:alert(1)', '/workflows/workflow-1', '/runs/run-12?x=1\n', '/runs/run-12\\evil',
  ])('不完整或越出来源运行的返回地址回退到安全深链：%s', candidate => {
    expect(runReturnLocation('run-12', candidate)).toBe('/runs/run-12')
  })

  it('重复返回参数只使用首个值，不从其他值猜测来源', () => {
    expect(runReturnLocation('run-12', ['/runs/run-12?page=2', '/runs/run-13'])).toBe('/runs/run-12?page=2')
    expect(runReturnLocation('run-12', [null, '/runs/run-12?page=2'])).toBe('/runs/run-12')
  })

  it('普通深链接的空格搜索词和锚点不丢失历史页码', () => {
    const source = '/runs/run-12?q=meeting notes&page=3#item details'
    expect(runReturnLocation('run-12', source)).toBe(source)
  })

  it('节点链接携带精确来源，仅对工作流路径编码而不改变节点 ID', () => {
    expect(failedNodeEditLocation('workflow-中 文', 'run-12', '节点 ?#', '/runs/run-12?page=2')).toEqual({
      path: '/workflows/workflow-%E4%B8%AD%20%E6%96%87',
      query: { nodeId: '节点 ?#', sourceRunId: 'run-12', runReturnLocation: '/runs/run-12?page=2' },
    })
  })

  it.each([
    [undefined, 'run-12', 'node'], ['workflow-1', undefined, 'node'], [' ', 'run-12', 'node'],
    ['workflow-1', ' ', 'node'], ['workflow-1', 'run-12', ''], ['workflow-1', 'run-12', 'loop/iteration-0/node'],
  ])('缺失来源或循环子记录不构造编辑链接', (workflowId, runId, nodeId) => {
    expect(failedNodeEditLocation(workflowId, runId, nodeId!)).toBeUndefined()
  })
})
