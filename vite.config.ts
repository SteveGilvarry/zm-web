import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend zm_api address for the dev proxy. Set VITE_API_PROXY_TARGET in a
  // local (gitignored) .env file — see .env.example.
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

  return {
  plugins: [
    TanStackRouterVite({
      quoteStyle: 'single',
      // Colocated test files (e.g. src/routes/settings/state.test.tsx) are not
      // route modules — exclude them from the router scan so dev-mode doesn't
      // warn about a missing Route export on every file save.
      routeFileIgnorePattern: '\\.(test|spec)\\.tsx?$',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  }
})
