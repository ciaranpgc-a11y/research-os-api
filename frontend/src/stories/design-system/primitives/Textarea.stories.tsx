import type { Meta, StoryObj } from '@storybook/react';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta = { title: 'Design System/Primitives/Textarea', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const States: Story = { render: () => <StoryFrame title="Textarea"><div className="grid max-w-xl gap-3"><textarea className="house-textarea min-h-24 rounded-md border border-border p-3" defaultValue="Default content" /><textarea className="house-textarea min-h-24 rounded-md border border-[hsl(var(--tone-danger-500))] p-3" defaultValue="Invalid content" aria-invalid /><textarea className="house-textarea min-h-24 rounded-md border border-border p-3 opacity-60" defaultValue="Disabled" disabled /></div></StoryFrame> };
