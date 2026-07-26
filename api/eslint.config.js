import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'

// Split out from the repo's former single root eslint.config.js when the frontend moved
// to apps/floor-app/ and api/ started owning its own tooling independently (see the
// directory-restructuring log entry for context). shared/ (repo root, also used by
// apps/floor-app/) is linted from that project instead — not duplicated here.
export default defineConfig([
  globalIgnores(['dist', 'generated']),

  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      prettier,
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
])
