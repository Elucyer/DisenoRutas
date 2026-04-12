import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/strava-api': {
        target: 'http://localhost:3002',
        rewrite: path => path.replace(/^\/strava-api/, ''),
      },
    },
  },
})
