/** 与服务端一致：仅限制循环容器写入的绑定，框架上下文保留双下划线前缀。 */
export function validateLoopBindingNames(nodeType: string, config: Record<string, unknown>): string[] {
  const type = nodeType.trim().toUpperCase()
  const fields = type === 'ITERATION' ? ['itemVariable', 'indexVariable', 'outputVariable']
    : type === 'LOOP' ? ['inputVariable', 'indexVariable', 'outputVariable'] : []
  return fields.flatMap(field => {
    const value = config[field]
    if (typeof value !== 'string') return []
    const name = value.trim()
    return name === 'userId' || name === 'username' || name.startsWith('__')
      ? [`${field} 不能使用保留变量名 '${name}'`] : []
  })
}

export function assertLoopBindingNames(nodeType: string, config: Record<string, unknown>, depth = 0): void {
  const errors = validateLoopBindingNames(nodeType, config)
  if (errors.length) throw new Error(errors.join('；'))
  if (!['LOOP', 'ITERATION'].includes(nodeType.trim().toUpperCase()) || !Array.isArray(config.bodyNodes)) return
  if (depth >= 8) return
  for (const child of config.bodyNodes) {
    if (!child || typeof child !== 'object' || typeof child.nodeType !== 'string') continue
    const childConfig = child.config && typeof child.config === 'object' && !Array.isArray(child.config) ? child.config : {}
    assertLoopBindingNames(child.nodeType, childConfig, depth + 1)
  }
}
