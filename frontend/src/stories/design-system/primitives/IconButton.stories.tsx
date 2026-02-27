import type { Meta, StoryObj } from '@storybook/react';
import { Bell, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta<typeof Button> = { title: 'Design System/Primitives/IconButton', component: Button, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof meta>;

export const SizesStates: Story = { render: () => <StoryFrame title="Icon button"><div className="flex flex-wrap gap-2"><Button size="icon" variant="outline" aria-label="Search"><Search className="h-4 w-4" /></Button><Button size="icon" variant="housePrimary" aria-label="Notifications"><Bell className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label="Settings"><Settings className="h-4 w-4" /></Button><Button size="icon" variant="outline" disabled aria-label="Disabled"><Search className="h-4 w-4" /></Button></div></StoryFrame> };
