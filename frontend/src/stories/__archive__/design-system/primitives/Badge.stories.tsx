import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '@/components/ui'
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta<typeof Badge> = { title: 'Design System/Primitives/Badge', component: Badge, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof meta>;

export const RoleStatusUnread: Story = {
  render: () => {
    return (
      <StoryFrame title="Badges">
        <div className="space-y-3">
          <div className="flex gap-2"><Badge>Owner</Badge><Badge variant="secondary">Editor</Badge><Badge variant="outline">Viewer</Badge></div>
          <div className="flex gap-2"><Badge className="bg-[hsl(var(--tone-positive-500))] text-white">Active</Badge><Badge className="bg-[hsl(var(--tone-warning-500))] text-white">Pending</Badge><Badge className="bg-[hsl(var(--tone-danger-500))] text-white">Removed</Badge></div>
          <div className="flex items-center gap-2"><Badge className="rounded-full bg-[hsl(var(--tone-accent-700))] px-2.5 text-white">12</Badge><span className="text-body">Unread</span></div>
        </div>
      </StoryFrame>
    );
  },
};
