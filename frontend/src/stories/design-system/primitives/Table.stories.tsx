import type { Meta, StoryObj } from '@storybook/react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StoryFrame } from '../_helpers/StoryFrame'
import { mockTableRows } from '../_helpers/mockData'

const meta = { title: 'Design System/Primitives/Table', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
type Story = StoryObj

function Base({ mode }: { mode: 'loading'|'empty'|'populated'|'sorted'|'unread' }) {
  return <Table className="min-w-[40rem]"><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{mode==='loading' ? <TableRow><TableCell colSpan={4}>Loading…</TableCell></TableRow> : mode==='empty' ? <TableRow><TableCell colSpan={4}>No rows</TableCell></TableRow> : mockTableRows.map((row)=> <TableRow key={row.id} className={mode==='unread'&&row.status==='Unread'?'bg-[hsl(var(--tone-accent-50))]':''}><TableCell>{mode==='sorted'?row.name.split(' ').reverse().join(' '):row.name}</TableCell><TableCell>{row.owner}</TableCell><TableCell>{row.status}</TableCell><TableCell><button className="text-caption underline">Open</button></TableCell></TableRow>)}</TableBody></Table>
}

export const States: Story = { render: () => <StoryFrame title="Table states"><div className="space-y-4"><Base mode="loading" /><Base mode="empty" /><Base mode="populated" /><Base mode="sorted" /><Base mode="unread" /></div></StoryFrame> }
