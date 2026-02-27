import type { Meta, StoryObj } from '@storybook/react'

import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type RowData = {
  name: string
  role: string
  status: string
}

const ROWS: RowData[] = [
  { name: 'A. Patel', role: 'Editor', status: 'Active' },
  { name: 'L. Santos', role: 'Reviewer', status: 'Pending' },
  { name: 'M. Evans', role: 'Viewer', status: 'Removed' },
]

function BaseTable({ selectedIndex, showEmpty }: { selectedIndex?: number; showEmpty?: boolean }) {
  return (
    <Table className="min-w-[34rem]">
      <TableHeader>
        <TableRow>
          <TableHead>Collaborator</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {showEmpty ? (
          <TableRow>
            <TableCell colSpan={3} className="text-muted-foreground">
              No records found.
            </TableCell>
          </TableRow>
        ) : (
          ROWS.map((row, index) => (
            <TableRow key={row.name} className={cn(index === selectedIndex && 'bg-[hsl(var(--tone-accent-50))]')}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.role}</TableCell>
              <TableCell>{row.status}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

const meta = {
  title: 'Design System/Primitives/TableStates',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

type Story = StoryObj

export const Default: Story = {
  render: () => <BaseTable />,
}

export const SelectedRow: Story = {
  render: () => <BaseTable selectedIndex={1} />,
}

export const Empty: Story = {
  render: () => <BaseTable showEmpty />,
}
