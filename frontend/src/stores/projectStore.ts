import { defineStore } from 'pinia'

import { projectApi } from '@/services/api/projectApi'
import type { ProjectSummary } from '@/types/project'

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: [] as ProjectSummary[],
    currentProjectId: 'project-media-ops',
    loading: false,
  }),
  getters: {
    currentProject: (state) =>
      state.projects.find((project) => project.id === state.currentProjectId) ?? state.projects[0],
  },
  actions: {
    async loadProjects() {
      this.loading = true
      try {
        this.projects = await projectApi.listProjects()
        this.currentProjectId = this.currentProjectId || this.projects[0]?.id || 'project-media-ops'
      } finally {
        this.loading = false
      }
    },
    selectProject(projectId: string) {
      this.currentProjectId = projectId
    },
  },
})
