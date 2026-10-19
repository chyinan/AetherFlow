import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultCustomDefinition, mapCustomOutputs, parseCustomDefinition, previewCustomNode, type CustomField } from './customNodes'

interface PointerCase { name: string; sample: unknown; path: string; type: CustomField['type']; expected?: unknown; missing?: boolean; invalidPointer?: boolean }
const cases: PointerCase[] = JSON.parse(readFileSync(fileURLToPath(new URL('../../../backend/workflow-service/src/test/resources/custom-node-pointer-cases.json', import.meta.url)), 'utf8'))

describe('与 Java 共用的 JSON Pointer 响应映射契约', () => {
  it.each(cases)('$name', example => {
    for (const required of [true, false]) {
      const definition = defaultCustomDefinition('CODE')
      definition.outputs = [{ name: 'mapped', type: example.type, path: example.path, required }]
      if (example.invalidPointer) { expect(() => parseCustomDefinition(definition)).toThrow('JSON Pointer'); continue }
      const parsed = parseCustomDefinition(definition)
      if (example.missing && required) {
        expect(() => mapCustomOutputs(parsed, example.sample)).toThrow('字段必填')
        expect(() => previewCustomNode(parsed, {}, {}, example.sample)).toThrow('字段必填')
      } else {
        const expected = example.missing ? {} : { mapped: example.expected }
        expect(mapCustomOutputs(parsed, example.sample)).toEqual(expected)
        expect(previewCustomNode(parsed, {}, {}, example.sample).outputs).toEqual(expected)
      }
    }
  })
})
