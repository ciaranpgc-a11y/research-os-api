import type { Meta, StoryObj } from '@storybook/react';
import { AuthPage } from '../../../pages/auth-page';

const meta: Meta<typeof AuthPage> = {
  title: 'Design System/Pages/Auth Page',
  component: AuthPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AuthPage>;

/**
 * Auth page with redesigned tokens:
 * - Institutional heading typography
 * - Underline-based tab system
 * - Preferred auth button style (white fill + black outline + subtle hover)
 * - 1.75rem section spacing
 */
export const SignInMode: Story = {
  args: {},
  render: () => <AuthPage />,
};

export const RegisterMode: Story = {
  args: {},
  render: () => (
    <AuthPage />
  ),
};

export const DarkMode: Story = {
  args: {},
  render: () => <AuthPage />,
  parameters: {
    theme: 'dark',
  },
};
