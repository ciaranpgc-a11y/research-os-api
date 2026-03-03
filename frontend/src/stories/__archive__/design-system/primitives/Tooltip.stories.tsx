import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta = { title: 'Design System/Primitives/Tooltip', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const States: Story = {
  render: () => (
    <StoryFrame title="Tooltip"><TooltipProvider><div className="flex gap-3"><Tooltip open><TooltipTrigger asChild><Button variant="outline">Visible tooltip</Button></TooltipTrigger><TooltipContent>Tooltip content</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="outline" disabled>Disabled trigger</Button></TooltipTrigger><TooltipContent>Disabled</TooltipContent></Tooltip></div></TooltipProvider></StoryFrame>
  ),
};
