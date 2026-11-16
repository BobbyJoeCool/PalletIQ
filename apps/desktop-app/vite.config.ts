import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, './package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, '../../shared'),
    },
  },
  server: {
    // 5174, not Vite's default 5173 — the floor app's dev server owns 5173, and the two
    // need to run side by side. strictPort so a clash fails loudly instead of silently
    // moving to a port Electron's `--dev` launch (electron/main.ts) isn't pointed at.
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
  // Injects the app version from package.json as a build-time global — see src/vite-env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
