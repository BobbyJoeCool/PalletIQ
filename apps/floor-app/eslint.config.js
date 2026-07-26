import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'

// Note: ESLint's flat config can only govern files inside this config's own directory
// tree — ../../shared/ (used by this app, api/, and apps/desktop-app/) can't be linted
// from here even via a `files` pattern reaching outside it. It's still fully
// type-checked as part of `npm run build` via the `@shared/*` tsconfig path; it just
// isn't covered by any project's `npm run lint` as a side effect of each app owning
// its own config independently.
export default defineConfig([
  globalIgnores(['dist']),

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
])
