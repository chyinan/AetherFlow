import { mockLogs, mockRuns } from '../mock/runMock'
import { delay } from '../mock/timing'

export const runApi = {
  listRuns() {
    return delay(mockRuns)
  },
  getRun(runId: string) {
    return delay(mockRuns.find((run) => run.id === runId) ?? mockRuns[0])
  },
  getLogs(_runId: string) {
    return delay(mockLogs)
  },
}
