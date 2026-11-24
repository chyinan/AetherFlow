import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'

import { observeWorkflowNavigation } from '@/utils/workflowNavigation'

export type WorkflowEntrySource = 'header' | 'empty'
type WorkflowOpening = { source: WorkflowEntrySource; phase: 'opening' | 'failed'; showRetry: boolean }
export const newWorkbenchWorkflowPath = '/workflows/new'

/** Two entry links open one editor destination, with only one pending attempt. */
export function useWorkbenchWorkflowOpen() {
  const router = useRouter()
  const opening = shallowRef<WorkflowOpening | null>(null)
  const navigation = observeWorkflowNavigation(router)
  watch(() => navigation.pending, (to) => {
    if (to && to.fullPath !== newWorkbenchWorkflowPath) opening.value = null
  }, { flush: 'sync' })
  const stopAfterEach = router.afterEach((to, _from, failure) => {
    // Re-selecting the current route cancels a pending push without visiting beforeEach.
    if (to.fullPath !== newWorkbenchWorkflowPath && isNavigationFailure(failure, NavigationFailureType.duplicated)) {
      opening.value = null
    }
  })
  onBeforeUnmount(() => {
    opening.value = null
    stopAfterEach()
  })

  async function openWorkflow(source: WorkflowEntrySource) {
    if (opening.value?.phase === 'opening') return
    const from = router.currentRoute.value
    const attempt: WorkflowOpening = { source, phase: 'opening', showRetry: opening.value?.source === source }
    opening.value = attempt

    function finish(failed: boolean) {
      if (opening.value !== attempt) return
      opening.value = failed && router.currentRoute.value === from
        ? { ...attempt, phase: 'failed', showRetry: true }
        : null
    }

    try {
      const failure = await router.push(newWorkbenchWorkflowPath)
      finish(isNavigationFailure(failure, NavigationFailureType.aborted))
    } catch {
      finish(true)
    }
  }

  function openWorkflowLink(event: MouseEvent, source: WorkflowEntrySource) {
    // Modified and non-primary activation keeps the browser's ordinary link behavior.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    void openWorkflow(source)
  }

  return { workflowOpening: opening, openWorkflow, openWorkflowLink }
}
