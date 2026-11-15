/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same /api paths as Vercel; the dev API (api/server.ts) mounts the serverless handlers
    port: 5180,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3002' },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: { maplibre: ['maplibre-gl'], recharts: ['recharts'] },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
