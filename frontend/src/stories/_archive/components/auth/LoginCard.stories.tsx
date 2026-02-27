import { Loader2 } from 'lucide-react'
import type { Meta, StoryObj } from '@storybook/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { LoginCard } from './LoginCard'

function providerBadge(label: string) {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-caption font-semibold text-[hsl(var(--tone-neutral-700))]"
    >
      {label}
    </span>
  )
}

const oauthActions = [
  {
    id: 'orcid',
    label: 'ORCID',
    icon: providerBadge('OR'),
    onClick: () => undefined,
  },
  {
    id: 'google',
    label: 'Google',
    icon: providerBadge('G'),
    onClick: () => undefined,
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    icon: providerBadge('M'),
    onClick: () => undefined,
  },
]

const authLabelClass =
  'text-caption font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-600))]'
const authInputClass =
  'h-10 border-[hsl(var(--tone-neutral-200))] bg-card text-[hsl(var(--auth-brand-navy))] placeholder:text-[hsl(var(--tone-neutral-400))] focus-visible:ring-[hsl(var(--auth-brand-accent))]'

function SignInPreview({ loading = false }: { loading?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="story-signin-email" className={authLabelClass}>Email address</label>
        <Input id="story-signin-email" placeholder="email@address.com" className={authInputClass} />
      </div>
      <div className="space-y-1">
        <label htmlFor="story-signin-password" className={authLabelClass}>Password</label>
        <Input id="story-signin-password" type="password" placeholder="Enter your password" className={authInputClass} />
      </div>
      <Button
        type="button"
        className="h-10 w-full bg-[hsl(var(--auth-brand-accent))] text-white hover:bg-[hsl(var(--auth-brand-accent-strong))]"
        disabled={loading}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {loading ? 'Please wait...' : 'Sign in'}
      </Button>
    </div>
  )
}

const meta: Meta<typeof LoginCard> = {
  title: 'Auth/LoginCard',
  component: LoginCard,
  decorators: [
    (Story) => (
      <div
        className="min-h-screen bg-[hsl(var(--tone-neutral-100))] px-4 py-8 sm:py-12"
        style={{
          ['--auth-brand-navy' as string]: '217 49% 8%',
          ['--auth-brand-accent' as string]: '188 42% 30%',
          ['--auth-brand-accent-strong' as string]: '188 42% 24%',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    mode: 'signin',
    title: 'Welcome back',
    subtitle: 'Sign in to continue in your research workspace.',
    oauthActions,
    onModeChange: () => undefined,
    footer: (
      <p>
        New to Axiomos?{' '}
        <button type="button" className="text-label font-medium underline underline-offset-2">
          Create an account
        </button>
      </p>
    ),
  },
}

export default meta

type Story = StoryObj<typeof LoginCard>

export const Default: Story = {
  render: (args) => (
    <LoginCard {...args}>
      <SignInPreview />
    </LoginCard>
  ),
}

export const ErrorState: Story = {
  args: {
    error: 'Could not reach API. Check network and retry.',
    errorAction: (
      <Button type="button" variant="tertiary" size="sm" className="h-8 text-label">
        Retry API connection
      </Button>
    ),
  },
  render: (args) => (
    <LoginCard {...args}>
      <SignInPreview />
    </LoginCard>
  ),
}

export const LoadingState: Story = {
  args: {
    loading: true,
  },
  render: (args) => (
    <LoginCard {...args}>
      <SignInPreview loading />
    </LoginCard>
  ),
}


