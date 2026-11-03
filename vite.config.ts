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
    // This config file lives at the repo root, so Vite's watcher otherwise
    // covers the whole repo, including server/ — a backend-only directory
    // with no frontend module ever imports from. Without this, writes to its
    // runtime-persisted state files (server/.rbac.json, .notifications.json,
    // etc. — see server/.gitignore) make Vite emit a full-reload over HMR,
    // bouncing the SPA back to its default page on every such write even
    // though nothing frontend-relevant changed.
    watch: { ignored: ['**/server/**'] },
  },
})
