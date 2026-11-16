import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'

// Own config rather than extending the floor app's, matching how each app in this
// monorepo owns its tooling independently. Two blocks because this app has two runtimes:
// the renderer (browser globals, React rules) and Electron's main/preload (Node globals).
// As in the floor app, ../../shared can't be linted from here — it is still type-checked
// through the `@shared/*` tsconfig path.
export default defineConfig([
  globalIgnores(['dist', 'dist-electron', 'release']),

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    files: ['electron/**/*.{ts,cts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
    languageOptions: {
      globals: globals.node,
    },
  },
])
