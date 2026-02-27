// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import designSystemPlugin from './.eslintrc-design-system.js'

export default defineConfig([globalIgnores(['dist']), {
  files: ['**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    reactHooks.configs['recommended-latest'],
    reactRefresh.configs.vite,
  ],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
  },
},
{
  files: ['src/**/*.{ts,tsx}'],
  plugins: {
    'design-system': designSystemPlugin,
  },
  rules: {
    'design-system/no-hardcoded-motion': 'warn',
    'design-system/no-transition-all': 'error',
  },
},
{
  files: ['src/components/primitives/**', 'src/stories/**'],
  rules: {
    'design-system/no-hardcoded-motion': 'off',
    'design-system/no-transition-all': 'off',
  },
},
...storybook.configs["flat/recommended"]])
