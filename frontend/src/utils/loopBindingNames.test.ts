import { describe, expect, it } from 'vitest'
import { assertLoopBindingNames, validateLoopBindingNames } from './loopBindingNames'
import { mapWorkflowToDefinitionDTO } from '../api/mappers/workflowMapper'
import type { WorkflowDefinition } from '../types/workflow'

function serialize(kind: 'iteration' | 'loop', config: Record<string, unknown>) {
  return mapWorkflowToDefinitionDTO({ id: 'workflow', name: '循环', edges: [], nodes: [{
    id: 'container', type: 'workflow', position: { x: 0, y: 0 }, data: {
      kind, label: '循环', description: '', config, inputs: [], outputs: [], status: 'idle',
    },
  }] } as WorkflowDefinition)
}

describe('循环绑定名称', () => {
  for (const type of ['ITERATION', 'LOOP']) {
    const fields = type === 'ITERATION' ? ['itemVariable', 'indexVariable', 'outputVariable']
      : ['inputVariable', 'indexVariable', 'outputVariable']
    for (const field of fields) {
      it.each(['userId', 'username', '__workflowNodeConfigs', '__nestedNodeTypes', '__nestedContexts', '__runtime', ' userId '])(`${type} 的 ${field} 拒绝保留名 %s`, name => {
        expect(validateLoopBindingNames(type, { [field]: name })).toEqual([`${field} 不能使用保留变量名 '${name.trim()}'`])
        expect(() => serialize(type === 'ITERATION' ? 'iteration' : 'loop', { [field]: name })).toThrow('不能使用保留变量名')
      })
    }
  }

  it('允许正常名称、默认值及 ITERATION 的只读输入', () => {
    expect(validateLoopBindingNames('ITERATION', { inputVariable: 'userId', itemVariable: 'entry', indexVariable: 'position', outputVariable: 'batchResults' })).toEqual([])
    expect(validateLoopBindingNames('LOOP', { inputVariable: 'currentState', indexVariable: 'round', outputVariable: 'nextState' })).toEqual([])
    expect(validateLoopBindingNames('ITERATION', { itemVariable: 'userIdValue', indexVariable: '_index', outputVariable: 'usernameResult' })).toEqual([])
    expect(() => serialize('iteration', { inputVariable: 'userId' })).not.toThrow()
    expect(() => serialize('iteration', {})).not.toThrow()
    expect(() => serialize('loop', {})).not.toThrow()
    expect(validateLoopBindingNames('PROMPT', { outputVariable: 'userId' })).toEqual([])
  })

  it('序列化后检查旧 output/input 别名', () => {
    expect(() => serialize('iteration', { output: 'username' })).toThrow("outputVariable 不能使用保留变量名 'username'")
    expect(() => serialize('loop', { input: '__nestedContexts' })).toThrow("inputVariable 不能使用保留变量名 '__nestedContexts'")
  })

  it('检查循环体内的嵌套绑定且不改写原配置', () => {
    const config = { bodyNodes: [{ nodeId: 'inner', nodeType: 'LOOP', config: { indexVariable: 'username' } }] }
    const before = structuredClone(config)
    expect(() => assertLoopBindingNames('ITERATION', config)).toThrow("indexVariable 不能使用保留变量名 'username'")
    expect(() => serialize('iteration', config)).toThrow('不能使用保留变量名')
    expect(config).toEqual(before)
  })
})
