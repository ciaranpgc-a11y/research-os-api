// This file has been automatically migrated to valid ESM format by Storybook.
import { fileURLToPath } from "node:url";
import path, { dirname } from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: StorybookConfig = {
  stories: [
    '../src/stories/design-system/approvals/Approvals.stories.@(ts|tsx|mdx)',
    '../src/stories/__archive__/design-system/approved/Approved.stories.@(ts|tsx|mdx)',
    '../src/stories/__archive__/design-system/primitives/Badges.stories.@(ts|tsx|mdx)',
    '../src/stories/__archive__/design-system/foundations/MotionChoreography.stories.@(ts|tsx|mdx)',
  ],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (baseConfig) =>
    mergeConfig(baseConfig, {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
        },
      },
    }),
}

export default config
