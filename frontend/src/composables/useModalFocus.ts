import { nextTick, watch, type Ref } from 'vue'

/** 保留设置弹窗的键盘范围、背景滚动状态和打开前焦点。 */
export function useModalFocus(open: Ref<boolean>, dialog: Ref<HTMLElement | null>, close: () => void) {
  let previousFocus: HTMLElement | null = null
  watch(open, (isOpen) => {
    if (isOpen) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, { flush: 'sync' })
  watch(open, (isOpen, _previous, onCleanup) => {
    if (!isOpen || !dialog.value) return
    const restoreFocus = previousFocus
    const previousOverflow = document.body.style.overflow

    const focusable = () => Array.from(dialog.value?.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    ) ?? []).filter((element) => !element.matches(':disabled, [hidden], [tabindex="-1"]') && !element.closest('[inert], [hidden]'))
    const focusFirst = () => (focusable()[0] ?? dialog.value)?.focus({ preventScroll: true })
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.value?.contains(event.target)) focusFirst()
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements.at(-1)
        if (!first || !last) {
          event.preventDefault()
          dialog.value?.focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    onCleanup(() => {
      document.removeEventListener('keydown', handleKeydown)
      document.removeEventListener('focusin', handleFocus)
      document.body.style.overflow = previousOverflow
      void nextTick(() => {
        if (restoreFocus?.isConnected && !restoreFocus.closest('[inert]')) restoreFocus.focus({ preventScroll: true })
      })
    })
    document.body.style.overflow = 'hidden'
    focusFirst()
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('focusin', handleFocus)
  }, { flush: 'post' })
}
