import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the Go backend (port 8080) serves the API; proxy /api
// so the frontend can always use relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
