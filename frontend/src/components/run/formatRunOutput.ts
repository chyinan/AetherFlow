// JSON 解析仅用于校验，展示时保留原始数字、转义和重复字段，避免格式化改变结果。
export function formatRunOutput(output: string): string | null {
  try {
    JSON.parse(output)
  } catch {
    return null
  }
  const tokens = output.match(/"(?:\\.|[^"\\])*"|[^\s]/g) ?? []
  const formatted: string[] = []
  let depth = 0
  let previous = ''
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token === '{' || token === '[') {
      formatted.push(token)
      if (tokens[index + 1] !== (token === '{' ? '}' : ']')) {
        depth++
        formatted.push('\n', '  '.repeat(depth))
      }
    } else if (token === '}' || token === ']') {
      if (previous !== (token === '}' ? '{' : '[')) {
        depth--
        formatted.push('\n', '  '.repeat(depth))
      }
      formatted.push(token)
    } else if (token === ',') {
      formatted.push(',\n', '  '.repeat(depth))
    } else if (token === ':') {
      formatted.push(': ')
    } else {
      formatted.push(token)
    }
    previous = token
  }
  return formatted.join('')
}
