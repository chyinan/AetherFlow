import { defineStore } from 'pinia'

import { fileApi } from '@/services/api/fileApi'
import type { FileAsset } from '@/types/file'

export const useFileStore = defineStore('file', {
  state: () => ({
    files: [] as FileAsset[],
    uploading: false,
    uploadProgress: 0,
  }),
  actions: {
    async loadFiles() {
      this.files = await fileApi.listFiles()
    },
    async upload(file: File) {
      this.uploading = true
      this.uploadProgress = 16
      const progressTimer = window.setInterval(() => {
        this.uploadProgress = Math.min(92, this.uploadProgress + 14)
      }, 120)
      try {
        const asset = await fileApi.uploadFile(file)
        this.files.unshift(asset)
        this.uploadProgress = 100
      } finally {
        window.clearInterval(progressTimer)
        window.setTimeout(() => {
          this.uploading = false
          this.uploadProgress = 0
        }, 420)
      }
    },
  },
})
