import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const gatewayTarget = process.env.VITE_DEV_GATEWAY_TARGET ?? 'http://localhost:8080'

function stripGatewayPrefix(prefix: string, path: string) {
  if (path === prefix) {
    return '/'
  }
  if (path.startsWith(`${prefix}/`)) {
    return path.slice(prefix.length)
  }
  return path
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: gatewayTarget,
        changeOrigin: true,
        rewrite: (path) => stripGatewayPrefix('/api', path),
      },
      '/ws': {
        target: gatewayTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => stripGatewayPrefix('/ws', path),
      },
      '/sse': {
        target: gatewayTarget,
        changeOrigin: true,
        rewrite: (path) => stripGatewayPrefix('/sse', path),
      },
    },
  },
})
