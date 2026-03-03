import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui'
import { Button } from '@/components/ui'
import { StoryFrame } from '../_helpers/StoryFrame';

const meta: Meta = { title: 'Design System/Primitives/Modal Sheet Drawer', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

function Demo({ widthClass }: { widthClass: string }) {
  return <Sheet><SheetTrigger asChild><Button variant="outline">Open {widthClass}</Button></SheetTrigger><SheetContent side="right" className={widthClass}><div className="pt-8"><p className="text-label">Drawer {widthClass}</p></div></SheetContent></Sheet>;
}

export const Sizes: Story = { render: () => <StoryFrame title="Modal / Sheet / Drawer"><div className="flex gap-2"><Demo widthClass="w-[20rem]" /><Demo widthClass="w-[32rem]" /></div></StoryFrame> };
