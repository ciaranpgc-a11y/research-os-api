import type { Meta, StoryObj } from '@storybook/react-vite'
import { LegacyButtonPrimitive } from '@/components/legacy/primitives/LegacyButtonPrimitive'
import {
  ModalPrimitive,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalClose,
} from '@/components/primitives'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Composites/Modal Primitive',
  component: ModalPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Accessible modal composite with tokenized overlay, sizing, motion, and focus management (ESC, outside click, focus return).',
      },
    },
  },
} satisfies Meta<typeof ModalPrimitive>

export default meta
type Story = StoryObj<typeof meta>

type DemoModalProps = {
  size?: 'sm' | 'md' | 'lg'
  scrollable?: boolean
  withFooter?: boolean
}

function DemoModal({ size = 'md', scrollable = false, withFooter = false }: DemoModalProps) {
  return (
    <ModalPrimitive>
      <ModalTrigger asChild>
        <LegacyButtonPrimitive size="sm">Open {size.toUpperCase()} modal</LegacyButtonPrimitive>
      </ModalTrigger>
      <ModalContent size={size} scrollable={scrollable}>
        <ModalHeader>
          <ModalTitle>{size.toUpperCase()} modal title</ModalTitle>
          <ModalDescription>
            This dialog uses token-driven spacing, radius, elevation, and motion.
          </ModalDescription>
          <ModalClose />
        </ModalHeader>
        <ModalBody scrollable={scrollable}>
          <p className="text-body text-[hsl(var(--foreground))]">
            Modal body content supports regular text, forms, and action-heavy workflows.
          </p>
          {scrollable ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 16 }).map((_, index) => (
                <p key={`scroll-line-${index}`} className="text-body text-[hsl(var(--muted-foreground))]">
                  Scroll line {index + 1}: Sample long-form content for overflow testing.
                </p>
              ))}
            </div>
          ) : null}
        </ModalBody>
        {withFooter ? (
          <ModalFooter>
            <LegacyButtonPrimitive variant="ghost" size="sm">Cancel</LegacyButtonPrimitive>
            <LegacyButtonPrimitive size="sm">Confirm</LegacyButtonPrimitive>
          </ModalFooter>
        ) : null}
      </ModalContent>
    </ModalPrimitive>
  )
}

export const Showcase: Story = {
  render: () => (
    <StoryFrame
      title="ModalPrimitive"
      subtitle="Simple dialog, footer actions, size variants, and scrollable behavior"
    >
      <div className="space-y-6" data-ui="modal-primitive-story">
        <section className="space-y-2" data-ui="modal-primitive-simple-section">
          <p className="text-label text-muted-foreground" data-ui="modal-primitive-simple-label">Simple modal</p>
          <DemoModal />
        </section>

        <section className="space-y-2" data-ui="modal-primitive-footer-section">
          <p className="text-label text-muted-foreground" data-ui="modal-primitive-footer-label">Modal with footer actions</p>
          <DemoModal withFooter />
        </section>

        <section className="space-y-2" data-ui="modal-primitive-size-section">
          <p className="text-label text-muted-foreground" data-ui="modal-primitive-size-label">Sizes</p>
          <div className="flex flex-wrap gap-2" data-ui="modal-primitive-size-actions">
            <DemoModal size="sm" />
            <DemoModal size="md" />
            <DemoModal size="lg" />
          </div>
        </section>

        <section className="space-y-2" data-ui="modal-primitive-scroll-section">
          <p className="text-label text-muted-foreground" data-ui="modal-primitive-scroll-label">Scrollable content</p>
          <DemoModal scrollable withFooter />
        </section>

        <section
          className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-50))] p-3"
          data-ui="modal-primitive-a11y-note"
        >
          <p className="text-label text-[hsl(var(--foreground))]">Accessibility</p>
          <p className="text-body text-[hsl(var(--muted-foreground))]">
            Dialog role semantics and focus trapping are handled by Radix Dialog. ESC closes the modal, and focus
            returns to the trigger after close.
          </p>
        </section>
      </div>
    </StoryFrame>
  ),
}
