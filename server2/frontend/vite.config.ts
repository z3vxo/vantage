import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/images': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  },
})
