/** 受控同源锁替身，只验证并发交错，不代替真实多窗口浏览器验收。 */
export function installCustomNodeLockHarness() {
  const original = Object.getOwnPropertyDescriptor(navigator, 'locks')
  let tail: Promise<unknown> = Promise.resolve()
  const locks = {
    request<T>(_name: string, options: { signal?: AbortSignal }, callback: () => T) {
      const next = tail.then(() => {
        if (options.signal?.aborted) throw new DOMException('锁等待已取消', 'AbortError')
        return callback()
      })
      tail = next.catch(() => undefined)
      return next
    },
  }
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  return {
    locks,
    hold(promise: Promise<unknown>) { tail = promise },
    restore() { if (original) Object.defineProperty(navigator, 'locks', original); else Reflect.deleteProperty(navigator, 'locks') },
  }
}
