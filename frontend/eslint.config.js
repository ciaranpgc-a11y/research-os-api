// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import designSystemPlugin from './.eslintrc-design-system.js'

export default defineConfig([globalIgnores(['dist', 'src/stories/__archive__/**', 'src/stories/_archive/**']), {
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
  files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
  ignores: ['src/components/legacy/**/*.{ts,tsx}', 'src/components/primitives/*Primitive.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@/components/legacy/**',
              '../legacy/**',
              './legacy/**',
            ],
            message:
              'Legacy components are story-only. Use canonical barrels (`@/components/ui`, `@/components/primitives`).',
          },
          {
            group: [
              '@/components/legacy/primitives/LegacyBadgePrimitive',
              '@/components/legacy/primitives/LegacyButtonPrimitive',
              '@/components/legacy/primitives/LegacyInputPrimitive',
              '@/components/legacy/primitives/LegacySelectPrimitive',
              '@/components/legacy/primitives/LegacyTextareaPrimitive',
              '@/components/legacy/primitives/LegacyTablePrimitive',
              '@/components/legacy/primitives/LegacyTooltipPrimitive',
            ],
            message:
              'Do not import moved legacy primitive implementations in app/component code.',
          },
        ],
      },
    ],
  },
},
...storybook.configs["flat/recommended"]])
