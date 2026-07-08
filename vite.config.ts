import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(resolve(__dirname, './package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, './shared'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
  // Injects the app version from package.json as a build-time global — see src/vite-env.d.ts
  // for the type declaration. Read once here instead of importing package.json from app code
  // so it stays a plain compile-time constant rather than bundling the whole file.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
