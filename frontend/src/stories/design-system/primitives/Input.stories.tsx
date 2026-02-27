import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '@/components/ui/input';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta<typeof Input> = { title: 'Design System/Primitives/Input', component: Input, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = { render: () => <StoryFrame title="Input"><div className="grid max-w-xl gap-3"><Input value="Default value" readOnly /><Input placeholder="Placeholder" /><Input aria-invalid className="border-[hsl(var(--tone-danger-500))]" value="Invalid value" readOnly /><Input disabled value="Disabled" readOnly /><Input className="ring-2 ring-ring" value="Focus simulated" readOnly /></div></StoryFrame> };
