import type { ProjectSummary } from '@/types/project'

import { mockProjects } from '../mock/projectMock'
import { delay } from '../mock/timing'

export const projectApi = {
  listProjects() {
    return delay<ProjectSummary[]>(mockProjects)
  },
  getProject(projectId: string) {
    return delay(mockProjects.find((project) => project.id === projectId) ?? mockProjects[0])
  },
}
