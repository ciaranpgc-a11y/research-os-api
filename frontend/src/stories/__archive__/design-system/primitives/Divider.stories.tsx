import type { Meta, StoryObj } from '@storybook/react-vite';
import { Separator } from '@/components/ui'
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta<typeof Separator> = { title: 'Design System/Primitives/Divider', component: Separator, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof meta>;

export const HorizontalVertical: Story = {
  render: () => (
    <StoryFrame title="Divider"><div className="space-y-3"><div>Section A</div><Separator /><div>Section B</div><div className="flex h-16 items-center gap-3"><span>A</span><Separator orientation="vertical" /><span>B</span></div></div></StoryFrame>
  ),
};
