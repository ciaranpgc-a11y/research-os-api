import type { Meta, StoryObj } from '@storybook/react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta<typeof Button> = { title: 'Design System/Primitives/Button', component: Button, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof meta>;

export const VariantsSizesStates: Story = {
  render: () => (
    <StoryFrame title="Button">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button variant="housePrimary">Primary</Button><Button variant="house">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Destructive</Button></div>
        <div className="flex flex-wrap items-center gap-2"><Button size="sm">Small</Button><Button size="default">Default</Button><Button size="lg">Large</Button><Button size="icon" aria-label="Add"><Plus className="h-4 w-4" /></Button></div>
        <div className="flex flex-wrap items-center gap-2"><Button disabled>Disabled</Button><Button variant="housePrimary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</Button><Button variant="outline"><Plus className="mr-2 h-4 w-4" />With icon</Button></div>
      </div>
    </StoryFrame>
  ),
};
