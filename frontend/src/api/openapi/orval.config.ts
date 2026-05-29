/// <reference types="node" />

import { defineConfig } from 'orval'

const openApiBase =
  process.env.OPENAPI_BASE ?? process.env.VITE_OPENAPI_BASE ?? 'http://localhost:8080'

function input(servicePath: string) {
  return `${openApiBase}${servicePath}`
}

export default defineConfig({
  auth: {
    input: input('/auth/v3/api-docs'),
    output: {
      target: 'src/api/generated/auth.ts',
      client: 'axios',
      override: {
        mutator: {
          path: 'src/api/client/apiClient.ts',
          name: 'orvalMutator',
        },
      },
    },
  },
  workflow: {
    input: input('/workflows/v3/api-docs'),
    output: {
      target: 'src/api/generated/workflow.ts',
      client: 'axios',
      override: {
        mutator: {
          path: 'src/api/client/apiClient.ts',
          name: 'orvalMutator',
        },
      },
    },
  },
  ai: {
    input: input('/ai/v3/api-docs'),
    output: {
      target: 'src/api/generated/ai.ts',
      client: 'axios',
      override: {
        mutator: {
          path: 'src/api/client/apiClient.ts',
          name: 'orvalMutator',
        },
      },
    },
  },
  file: {
    input: input('/files/v3/api-docs'),
    output: {
      target: 'src/api/generated/file.ts',
      client: 'axios',
      override: {
        mutator: {
          path: 'src/api/client/apiClient.ts',
          name: 'orvalMutator',
        },
      },
    },
  },
  notify: {
    input: input('/notify/v3/api-docs'),
    output: {
      target: 'src/api/generated/notify.ts',
      client: 'axios',
      override: {
        mutator: {
          path: 'src/api/client/apiClient.ts',
          name: 'orvalMutator',
        },
      },
    },
  },
})
