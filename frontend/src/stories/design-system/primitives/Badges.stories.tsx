import type { Meta, StoryObj } from '@storybook/react'

import { Badge } from '@/components/ui/badge'

const meta = {
  title: 'Design System/Primitives/Badges',
  component: Badge,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Badge>

export default meta

type Story = StoryObj<typeof meta>

export const RoleStatusUnread: Story = {
  render: () => (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-label font-semibold text-foreground">Role</h3>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))]">Owner</Badge>
          <Badge className="border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]">Editor</Badge>
          <Badge className="border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]">Viewer</Badge>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-label font-semibold text-foreground">Status</h3>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]">Active</Badge>
          <Badge className="border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-800))]">Pending</Badge>
          <Badge className="border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-800))]">Removed</Badge>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-label font-semibold text-foreground">Unread</h3>
        <div className="flex items-center gap-2">
          <Badge className="border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-500))] text-white">12</Badge>
          <span className="text-body text-foreground">New notifications</span>
        </div>
      </section>
    </div>
  ),
}
