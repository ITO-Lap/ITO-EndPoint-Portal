import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev-only convenience: src/api/index.ts defaults to relative paths
    // (same-origin, for the production container) with no VITE_API_URL set
    // locally — proxy /api to the Express dev server so `npm run dev` works
    // without needing a .env override.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
