import { flushPromises, type VueWrapper } from '@vue/test-utils'

/** 等待真实路由守卫，并在出现未保存弹窗时完成指定选择。 */
export async function resolveWorkflowNavigation(
  wrapper: VueWrapper,
  navigation: Promise<unknown> | undefined,
  choice: 'discard' | 'stay' = 'discard',
) {
  await flushPromises()
  const dialog = wrapper.find('[data-testid="unsaved-navigation-dialog"]')
  const prompted = dialog.exists()
  if (prompted) {
    await dialog.get(`[data-action="leave-${choice}"]`).trigger('click')
  }
  await navigation
  await flushPromises()
  return prompted
}
