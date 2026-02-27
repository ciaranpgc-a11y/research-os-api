import type { Meta, StoryObj } from '@storybook/react'
import { ArrowRight, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Button',
  component: Button,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const CanonicalVariants: Story = {
  render: () => (
    <StoryFrame title="Button">
      <div data-ui="button-story" className="space-y-5">
        <section data-ui="button-story-tiers" className="space-y-2">
          <div data-ui="button-story-tiers-label" className="text-label text-muted-foreground">
            Tiers
          </div>
          <div data-ui="button-story-tiers-row" className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="tertiary">Tertiary</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </section>

        <section data-ui="button-story-sizes" className="space-y-2">
          <div data-ui="button-story-sizes-label" className="text-label text-muted-foreground">
            Sizes
          </div>
          <div data-ui="button-story-sizes-row" className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary" size="default">
              Default
            </Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
            <Button variant="primary" size="icon" aria-label="Add">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section data-ui="button-story-states" className="space-y-2">
          <div data-ui="button-story-states-label" className="text-label text-muted-foreground">
            Disabled + Loading
          </div>
          <div data-ui="button-story-states-row" className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="secondary">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading
            </Button>
          </div>
        </section>

        <section data-ui="button-story-focus" className="space-y-2">
          <div data-ui="button-story-focus-label" className="text-label text-muted-foreground">
            Focus Visible
          </div>
          <div data-ui="button-story-focus-row" className="flex flex-wrap items-center gap-2">
            <Button variant="tertiary">Before</Button>
            <Button variant="tertiary" autoFocus>
              Focus target
            </Button>
          </div>
        </section>

        <section data-ui="button-story-icons" className="space-y-2">
          <div data-ui="button-story-icons-label" className="text-label text-muted-foreground">
            Icon Left / Right
          </div>
          <div data-ui="button-story-icons-row" className="flex flex-wrap items-center gap-2">
            <Button variant="primary">
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
            <Button variant="tertiary">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        <section data-ui="button-story-as-child" className="space-y-2">
          <div data-ui="button-story-as-child-label" className="text-label text-muted-foreground">
            asChild
          </div>
          <div data-ui="button-story-as-child-row" className="flex flex-wrap items-center gap-2">
            <Button asChild variant="tertiary">
              <a
                data-ui="button-story-as-child-link"
                href="https://example.com"
                target="_blank"
                rel="noreferrer"
              >
                Open Link
              </a>
            </Button>
          </div>
        </section>
      </div>
    </StoryFrame>
  ),
}
