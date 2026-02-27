import type { Meta, StoryObj } from '@storybook/react';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta = { title: 'Design System/Primitives/Chip Pill', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const States: Story = {
  render: () => (
    <StoryFrame title="Chip / pill"><div className="flex flex-wrap gap-2"><button className="rounded-full border border-border px-3 py-1 text-caption">Default</button><button className="rounded-full border border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-50))] px-3 py-1 text-caption">Selected</button><button className="rounded-full border border-[hsl(var(--tone-warning-400))] bg-[hsl(var(--tone-warning-100))] px-3 py-1 text-caption">Pending</button><button className="rounded-full border border-border px-3 py-1 text-caption opacity-60" disabled>Disabled</button></div></StoryFrame>
  ),
};
