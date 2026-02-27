import type { Meta, StoryObj } from '@storybook/react';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta = { title: 'Design System/Primitives/Select Dropdown', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const Variants: Story = { render: () => <StoryFrame title="Select / dropdown"><div className="grid max-w-sm gap-3"><select className="house-dropdown h-9 rounded-md px-2"><option>Default</option><option>Option two</option></select><select className="house-dropdown h-9 rounded-md px-2 border-[hsl(var(--tone-danger-500))]" aria-invalid><option>Error</option></select><select className="house-dropdown h-9 rounded-md px-2" disabled><option>Disabled</option></select></div></StoryFrame> };
