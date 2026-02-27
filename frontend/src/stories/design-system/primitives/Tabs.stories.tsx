import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta<typeof Tabs> = { title: 'Design System/Primitives/Tabs', component: Tabs, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <StoryFrame title="Tabs"><Tabs defaultValue="overview" className="max-w-xl"><TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="settings" disabled>Settings</TabsTrigger></TabsList><TabsContent value="overview">Overview content</TabsContent><TabsContent value="activity">Activity content</TabsContent><TabsContent value="settings">Settings content</TabsContent></Tabs></StoryFrame>
  ),
};
