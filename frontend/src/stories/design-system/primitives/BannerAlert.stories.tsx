import type { Meta, StoryObj } from '@storybook/react';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta = { title: 'Design System/Primitives/Banner Alert', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const States: Story = {
  render: () => (
    <StoryFrame title="Banner / alert">
      <div className="space-y-2">
        <div className="rounded-md border border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] p-3 text-sm">Info: update complete.</div>
        <div className="rounded-md border border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] p-3 text-sm">Success: preferences saved.</div>
        <div className="rounded-md border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] p-3 text-sm">Warning: missing metadata.</div>
        <div className="rounded-md border border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-100))] p-3 text-sm">Error: request failed.</div>
      </div>
    </StoryFrame>
  ),
};
