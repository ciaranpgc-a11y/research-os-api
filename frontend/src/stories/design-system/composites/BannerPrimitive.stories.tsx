import type { Meta, StoryObj } from '@storybook/react-vite'
import { ButtonPrimitive } from '@/components/primitives/ButtonPrimitive'
import {
  BannerPrimitive,
  BannerContent,
  BannerTitle,
  BannerDescription,
  BannerAction,
} from '@/components/primitives/BannerPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Composites/Banner Primitive',
  component: BannerPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Composable banner primitive for info/success/warning/danger/default notices with semantic ARIA roles, tokenized color contrast, and close/action affordances.',
      },
    },
  },
} satisfies Meta<typeof BannerPrimitive>

export default meta
type Story = StoryObj<typeof meta>

const allVariants = ['default', 'info', 'success', 'warning', 'danger'] as const

export const Showcase: Story = {
  render: () => (
    <StoryFrame
      title="BannerPrimitive"
      subtitle="Variant matrix, closeable/action states, long content wrapping, and stacked notifications"
    >
      <div className="space-y-6" data-ui="banner-primitive-story">
        <section className="space-y-3" data-ui="banner-primitive-variants-section">
          <p className="text-label text-muted-foreground" data-ui="banner-primitive-variants-label">All variants</p>
          <div className="space-y-2" data-ui="banner-primitive-variants-list">
            {allVariants.map((variant) => (
              <BannerPrimitive key={variant} variant={variant}>
                <BannerContent>
                  <BannerTitle>{variant[0].toUpperCase() + variant.slice(1)} message</BannerTitle>
                  <BannerDescription>
                    This banner uses semantic tones and tokenized typography for consistent alerts.
                  </BannerDescription>
                </BannerContent>
              </BannerPrimitive>
            ))}
          </div>
        </section>

        <section className="space-y-3" data-ui="banner-primitive-close-action-section">
          <p className="text-label text-muted-foreground" data-ui="banner-primitive-close-action-label">Close and action options</p>
          <div className="space-y-2" data-ui="banner-primitive-close-action-list">
            <BannerPrimitive variant="info" closeable>
              <BannerContent>
                <BannerTitle>With close button</BannerTitle>
                <BannerDescription>This notice can be dismissed by keyboard or pointer interaction.</BannerDescription>
              </BannerContent>
            </BannerPrimitive>

            <BannerPrimitive variant="success" action>
              <BannerContent>
                <BannerTitle>With action</BannerTitle>
                <BannerDescription>Action area supports primary next steps after a successful operation.</BannerDescription>
              </BannerContent>
              <BannerAction>
                <ButtonPrimitive size="sm">View Details</ButtonPrimitive>
              </BannerAction>
            </BannerPrimitive>

            <BannerPrimitive variant="danger" closeable action>
              <BannerContent>
                <BannerTitle>With action and close</BannerTitle>
                <BannerDescription>Use for recoverable errors where remediation is available immediately.</BannerDescription>
              </BannerContent>
              <BannerAction>
                <ButtonPrimitive size="sm" variant="secondary">Retry</ButtonPrimitive>
              </BannerAction>
            </BannerPrimitive>
          </div>
        </section>

        <section className="space-y-3" data-ui="banner-primitive-long-copy-section">
          <p className="text-label text-muted-foreground" data-ui="banner-primitive-long-copy-label">Long message wrapping</p>
          <BannerPrimitive variant="warning">
            <BannerContent>
              <BannerTitle>Long contextual warning</BannerTitle>
              <BannerDescription>
                We detected an incomplete metadata import for this workspace. Some publication records may be missing author affiliations and
                citation details until the background reconciliation process is complete. You can continue browsing, but exports may be partial.
              </BannerDescription>
            </BannerContent>
          </BannerPrimitive>
        </section>

        <section className="space-y-3" data-ui="banner-primitive-stacked-section">
          <p className="text-label text-muted-foreground" data-ui="banner-primitive-stacked-label">Stacked banners</p>
          <div className="space-y-2" data-ui="banner-primitive-stacked-list">
            <BannerPrimitive variant="info" closeable>
              <BannerContent>
                <BannerDescription>Background sync started for your selected collection.</BannerDescription>
              </BannerContent>
            </BannerPrimitive>
            <BannerPrimitive variant="success">
              <BannerContent>
                <BannerDescription>3 publications were successfully validated and indexed.</BannerDescription>
              </BannerContent>
            </BannerPrimitive>
            <BannerPrimitive variant="danger" closeable>
              <BannerContent>
                <BannerDescription>API request failed. Verify credentials and try again.</BannerDescription>
              </BannerContent>
            </BannerPrimitive>
          </div>
        </section>

        <section
          className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-50))] p-3"
          data-ui="banner-primitive-a11y-note"
        >
          <p className="text-label text-[hsl(var(--foreground))]">Accessibility</p>
          <p className="text-body text-[hsl(var(--muted-foreground))]">
            `role="alert"` is used for success/warning/danger variants to announce urgency; `role="status"` is used for info/default.
            Variant text colors use tone-900 on tone-50/tone-100 backgrounds for high contrast.
          </p>
        </section>
      </div>
    </StoryFrame>
  ),
}
