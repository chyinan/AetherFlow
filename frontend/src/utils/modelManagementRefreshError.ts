/** 管理写入已经被确认，只有随后的运行快照读取失败。 */
export class ModelManagementRefreshError extends Error {
  constructor(readonly refreshError: unknown) {
    super('The management write was confirmed, but its snapshot refresh failed')
    this.name = 'ModelManagementRefreshError'
  }
}
