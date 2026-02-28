import type { Meta, StoryObj } from '@storybook/react';
import { Eye } from 'lucide-react';
import { AuthPage } from '../../../pages/auth-page';
import { LoginCard } from '../../../components/auth/LoginCard';
import { ButtonPrimitive } from '../../../components/primitives/ButtonPrimitive';
import { InputPrimitive } from '../../../components/primitives/InputPrimitive';

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

export const IncorrectPasswordState: Story = {
  args: {},
  render: () => {
    const authLabelClass =
      'text-[0.86rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]';
    const authInputClass =
      '!h-9 !min-h-0 border-[hsl(var(--tone-neutral-500))] bg-card !text-[1.02rem] !font-normal !leading-[1.25] text-[hsl(var(--tone-neutral-900))] placeholder:text-[0.96rem] placeholder:text-[hsl(var(--tone-neutral-600))] hover:border-[hsl(var(--tone-neutral-600))] focus-visible:border-[hsl(var(--tone-accent-600))] focus-visible:ring-[hsl(var(--tone-accent-500))]';
    const authPasswordInputClass =
      `${authInputClass} !border-0 !bg-transparent !shadow-none !focus-visible:ring-0 !focus-visible:border-transparent`;
    const authPasswordWrapClass =
      'flex h-9 items-center overflow-hidden rounded-md border border-[hsl(var(--tone-neutral-500))] bg-card transition-colors hover:border-[hsl(var(--tone-neutral-600))] focus-within:border-[hsl(var(--tone-neutral-700))] focus-within:ring-0';
    const authPasswordToggleClass =
      'inline-flex !h-full !min-h-0 w-10 shrink-0 items-center justify-center !rounded-none !border-0 border-l border-[hsl(var(--tone-neutral-500))] !bg-transparent !text-[hsl(var(--tone-neutral-500))] !shadow-none !transition-none !duration-0 !ease-linear !transform-none hover:!bg-transparent hover:!text-[hsl(var(--tone-neutral-700))] hover:!shadow-none hover:!transform-none !active:bg-transparent !active:shadow-none !active:scale-100 !active:translate-y-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!border-[hsl(var(--tone-neutral-500))] focus-visible:!shadow-none';
    const authInputStyle: React.CSSProperties = {
      paddingBlock: '0',
      lineHeight: '1.25',
    };
    const authPrimaryButtonClass =
      'w-full !h-[calc(var(--button-auth-height)-2px)] !min-h-[calc(var(--button-auth-height)-2px)] !rounded-[0.25rem] !border px-[var(--space-3)] !text-[0.96rem] !font-medium uppercase tracking-[0.06em] !text-[hsl(var(--tone-neutral-50))] !transition-none !transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))] focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed !active:scale-100 !active:translate-y-0';
    const authPrimaryButtonStyle: React.CSSProperties = {
      height: 'calc(var(--button-auth-height, 2.5rem) - 2px)',
      minHeight: 'calc(var(--button-auth-height, 2.5rem) - 2px)',
      borderRadius: '0.25rem',
      fontSize: '0.96rem',
      fontWeight: 500,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      paddingInline: 'var(--space-3)',
      borderColor: 'hsl(var(--tone-accent-800))',
      backgroundColor: 'hsl(var(--tone-accent-700))',
      color: 'hsl(var(--tone-neutral-50))',
      transition: 'none',
    };

    return (
      <div className="min-h-screen bg-[hsl(var(--tone-neutral-100))] px-4 py-8 sm:py-12">
        <LoginCard
          title="Access your research workspace"
          subtitle=""
          oauthActions={[
            { id: 'orcid', label: 'ORCID', icon: <span className="h-5 w-5 rounded-full bg-[#A6CE39]" />, onClick: () => {} },
            { id: 'google', label: 'Google', icon: <span className="h-5 w-5 rounded-full bg-[#EA4335]" />, onClick: () => {} },
            { id: 'microsoft', label: 'Microsoft', icon: <span className="h-5 w-5 rounded-full bg-[#00A4EF]" />, onClick: () => {} },
          ]}
          error="Incorrect password. Please try again."
          footer={
            <div className="mt-5 text-center">
              <p className="text-[0.92rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]">
                Ready to start?
              </p>
              <a
                href="#"
                onClick={(event) => event.preventDefault()}
                className="mt-1 inline-block text-label font-medium underline underline-offset-2 !text-[hsl(var(--tone-neutral-900))] visited:!text-[hsl(var(--tone-neutral-900))] hover:!text-[hsl(var(--tone-accent-700))] active:!text-[hsl(var(--tone-accent-700))] transition-colors"
              >
                Create your research workspace
              </a>
            </div>
          }
        >
          <div className="space-y-5">
            <div className="space-y-[0.55rem]">
              <label className={authLabelClass}>Email address</label>
              <InputPrimitive value="email@address.com" readOnly className={authInputClass} style={authInputStyle} />
            </div>
            <div className="space-y-[0.55rem]">
              <label className={authLabelClass}>Password</label>
              <div className={authPasswordWrapClass}>
                <InputPrimitive
                  value="••••••••••"
                  readOnly
                  type="password"
                  className={authPasswordInputClass}
                  style={authInputStyle}
                />
                <ButtonPrimitive type="button" className={authPasswordToggleClass} aria-label="Show password">
                  <Eye className="h-8 w-8" strokeWidth={2} />
                </ButtonPrimitive>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <a
                href="#"
                onClick={(event) => event.preventDefault()}
                className="-mt-[0.35rem] block text-[0.92rem] font-normal text-[hsl(var(--tone-neutral-600))] no-underline transition-[color,text-decoration-color] duration-[var(--motion-duration-ui)] hover:underline hover:text-[hsl(var(--tone-neutral-800))]"
              >
                Reset password
              </a>
            </div>
            <ButtonPrimitive type="button" className={authPrimaryButtonClass} style={{ ...authPrimaryButtonStyle, marginTop: '1.9rem' }}>
              Sign in
            </ButtonPrimitive>
          </div>
        </LoginCard>
      </div>
    );
  },
};
