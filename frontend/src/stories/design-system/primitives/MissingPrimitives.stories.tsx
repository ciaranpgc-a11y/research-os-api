import type { Meta, StoryObj } from '@storybook/react';
import { StoryFrame } from '../_helpers/StoryFrame';

function MissingPrimitive({ primitive, alternatives }: { primitive: string; alternatives: string }) {
  return <div className="rounded-md border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-50))] p-4 text-sm"><p className="font-semibold">Missing primitive: {primitive}</p><p className="mt-1">Use existing alternatives: {alternatives}</p></div>;
}

const meta: Meta = { title: 'Design System/Primitives/Missing Primitives', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const Gaps: Story = { render: () => <StoryFrame title="Primitive coverage gaps"><div className="grid gap-2"><MissingPrimitive primitive="Checkbox" alternatives="Badge + button + table row selection pattern" /><MissingPrimitive primitive="Switch" alternatives="Tabs trigger or pill toggle pattern" /><MissingPrimitive primitive="Radio group" alternatives="Tabs and select dropdown" /><MissingPrimitive primitive="Toast/Notification" alternatives="Banner/Alert pattern" /><MissingPrimitive primitive="Pagination" alternatives="Table with filtered subsets" /><MissingPrimitive primitive="Breadcrumbs" alternatives="Left navigation + section headers" /><MissingPrimitive primitive="Avatar" alternatives="Initials badge pattern" /><MissingPrimitive primitive="Accordion/Collapse" alternatives="Drilldown collapsible section classes" /></div></StoryFrame> };
