import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/**
 * Unit tests (test plan Part 3, #238): Vitest + React Testing Library in jsdom, reusing the
 * app's own Vite config (aliases, defines, plugins). Only `src/**` is collected, so the
 * Playwright specs under tests/e2e never run here. `npm test` / `npm run test:watch`.
 */
export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
}))
