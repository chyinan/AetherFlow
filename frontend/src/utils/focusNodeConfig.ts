// pattern: Imperative Shell
function inspectorFor(nodeId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-node-inspector]'))
    .find((element) => element.dataset.nodeInspector === nodeId)
}

export function focusNodeConfigField(nodeId: string, field: string): boolean {
  const inspector = inspectorFor(nodeId)
  const target = inspector && Array.from(inspector.querySelectorAll<HTMLElement>('[data-config-field]'))
    .find((element) => element.dataset.configField === field && !element.matches(':disabled')
      && !element.closest('[hidden], [aria-hidden="true"]'))
  if (!target) return false
  target.scrollIntoView?.({ block: 'nearest' })
  target.focus()
  return document.activeElement === target
}

export function requestNodeConfigFieldFocus(nodeId: string, field: string): boolean {
  const inspector = inspectorFor(nodeId)
  if (!inspector) return false
  inspector.dispatchEvent(new CustomEvent('aetherflow-focus-config', { detail: { field } }))
  return true
}
