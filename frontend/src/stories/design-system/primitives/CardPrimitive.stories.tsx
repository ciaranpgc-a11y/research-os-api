import type { Meta, StoryObj } from '@storybook/react'
import { ButtonPrimitive } from '@/components/primitives/ButtonPrimitive'
import {
  CardPrimitive,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/primitives/CardPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Card Primitive',
  component: CardPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Composable card primitive with tokenized surface, spacing, typography, and optional interactive elevation behavior.',
      },
    },
  },
} satisfies Meta<typeof CardPrimitive>

export default meta
type Story = StoryObj<typeof meta>

export const Showcase: Story = {
  render: () => (
    <StoryFrame title="Card primitive" subtitle="Composable structure with variant and interaction coverage">
      <div data-ui="card-primitive-story" className="space-y-5">
        <section data-ui="card-primitive-basic-section" className="space-y-2">
          <p data-ui="card-primitive-basic-label" className="text-label text-muted-foreground">Basic (content only)</p>
          <CardPrimitive data-ui="card-primitive-basic" className="max-w-xl">
            <CardContent data-ui="card-primitive-basic-content">
              This is a basic card with content only.
            </CardContent>
          </CardPrimitive>
        </section>

        <section data-ui="card-primitive-full-section" className="space-y-2">
          <p data-ui="card-primitive-full-label" className="text-label text-muted-foreground">Full composition</p>
          <CardPrimitive data-ui="card-primitive-full" className="max-w-xl">
            <CardHeader data-ui="card-primitive-full-header">
              <CardTitle data-ui="card-primitive-full-title">Publication Snapshot</CardTitle>
              <CardDescription data-ui="card-primitive-full-description">
                Overview of key indicators and latest status.
              </CardDescription>
            </CardHeader>
            <CardContent data-ui="card-primitive-full-content">
              <p data-ui="card-primitive-full-copy" className="text-body">
                Card content area supports narrative, metrics, and embedded components.
              </p>
            </CardContent>
            <CardFooter data-ui="card-primitive-full-footer">
              <ButtonPrimitive data-ui="card-primitive-full-primary-action" size="sm">Open Detail</ButtonPrimitive>
              <ButtonPrimitive data-ui="card-primitive-full-secondary-action" size="sm" variant="ghost">Dismiss</ButtonPrimitive>
            </CardFooter>
          </CardPrimitive>
        </section>

        <section data-ui="card-primitive-variants-section" className="space-y-2">
          <p data-ui="card-primitive-variants-label" className="text-label text-muted-foreground">Variants</p>
          <div data-ui="card-primitive-variants-grid" className="grid gap-3 lg:grid-cols-3">
            <CardPrimitive data-ui="card-primitive-variant-default" variant="default">
              <CardContent data-ui="card-primitive-variant-default-content">Default</CardContent>
            </CardPrimitive>
            <CardPrimitive data-ui="card-primitive-variant-flat" variant="flat">
              <CardContent data-ui="card-primitive-variant-flat-content">Flat</CardContent>
            </CardPrimitive>
            <CardPrimitive data-ui="card-primitive-variant-outlined" variant="outlined">
              <CardContent data-ui="card-primitive-variant-outlined-content">Outlined</CardContent>
            </CardPrimitive>
          </div>
        </section>

        <section data-ui="card-primitive-interactive-section" className="space-y-2">
          <p data-ui="card-primitive-interactive-label" className="text-label text-muted-foreground">Interactive (hover elevation)</p>
          <CardPrimitive data-ui="card-primitive-interactive" interactive className="max-w-xl">
            <CardHeader data-ui="card-primitive-interactive-header">
              <CardTitle data-ui="card-primitive-interactive-title">Interactive Card</CardTitle>
              <CardDescription data-ui="card-primitive-interactive-description">
                Hover to observe elevation transition.
              </CardDescription>
            </CardHeader>
            <CardContent data-ui="card-primitive-interactive-content">
              <p data-ui="card-primitive-interactive-copy" className="text-body">
                Use this mode when the entire card acts as an action target.
              </p>
            </CardContent>
            <CardFooter data-ui="card-primitive-interactive-footer">
              <ButtonPrimitive data-ui="card-primitive-interactive-action" size="sm">Inspect</ButtonPrimitive>
            </CardFooter>
          </CardPrimitive>
        </section>
      </div>
    </StoryFrame>
  ),
}
