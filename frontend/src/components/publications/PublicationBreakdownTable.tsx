import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react'

import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { houseTables } from '@/lib/house-style'
import { publicationsHouseDrilldown } from '@/components/publications/publications-house-style'

type PublicationBreakdownRow = {
  key: string
  label: string
  value: number
  share_pct: number
  avg_citations?: number
}

type SortField = 'label' | 'value' | 'share_pct' | 'avg_citations'
type SortDirection = 'asc' | 'desc'

const HOUSE_TABLE_SHELL_CLASS = 'house-table-shell house-table-context-profile'
const HOUSE_TABLE_HEAD_CLASS = 'sticky top-0 bg-[hsl(var(--tone-neutral-50))] z-10'
const HOUSE_TABLE_HEAD_TEXT_CLASS = 'text-left text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-700))]'
const HOUSE_TABLE_ROW_CLASS = publicationsHouseDrilldown.tableRow
const HOUSE_TABLE_EMPTY_CLASS = publicationsHouseDrilldown.tableEmpty

export function PublicationBreakdownTable({
  rows,
  showAvgCitations = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data available',
}: {
  rows: PublicationBreakdownRow[]
  showAvgCitations?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('value')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const filteredAndSortedRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    let filtered = rows
    if (query) {
      filtered = rows.filter((row) => row.label.toLowerCase().includes(query))
    }

    return [...filtered].sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      if (sortField === 'label') {
        aVal = a.label.toLowerCase()
        bVal = b.label.toLowerCase()
      } else if (sortField === 'value') {
        aVal = a.value
        bVal = b.value
      } else if (sortField === 'share_pct') {
        aVal = a.share_pct
        bVal = b.share_pct
      } else if (sortField === 'avg_citations' && showAvgCitations) {
        aVal = a.avg_citations || 0
        bVal = b.avg_citations || 0
      }

      if (sortDirection === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      }
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
    })
  }, [rows, searchQuery, sortField, sortDirection, showAvgCitations])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5" />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn('pl-9', houseTables.filterInput)}
          />
        </div>
      </div>

      <div className={HOUSE_TABLE_SHELL_CLASS}>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className={HOUSE_TABLE_HEAD_CLASS}>
              <tr>
                <th className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => handleSort('label')}
                    className={cn(
                      'flex items-center gap-1.5 hover:text-[hsl(var(--tone-neutral-900))]',
                      HOUSE_TABLE_HEAD_TEXT_CLASS,
                      houseTables.sortTrigger,
                    )}
                  >
                    Name
                    <SortIcon field="label" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('value')}
                    className={cn(
                      'ml-auto flex items-center gap-1.5 hover:text-[hsl(var(--tone-neutral-900))]',
                      HOUSE_TABLE_HEAD_TEXT_CLASS,
                      houseTables.sortTrigger,
                    )}
                  >
                    Count
                    <SortIcon field="value" />
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('share_pct')}
                    className={cn(
                      'ml-auto flex items-center gap-1.5 hover:text-[hsl(var(--tone-neutral-900))]',
                      HOUSE_TABLE_HEAD_TEXT_CLASS,
                      houseTables.sortTrigger,
                    )}
                  >
                    % of Total
                    <SortIcon field="share_pct" />
                  </button>
                </th>
                {showAvgCitations ? (
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('avg_citations')}
                      className={cn(
                        'ml-auto flex items-center gap-1.5 hover:text-[hsl(var(--tone-neutral-900))]',
                        HOUSE_TABLE_HEAD_TEXT_CLASS,
                        houseTables.sortTrigger,
                      )}
                    >
                      Avg Cites
                      <SortIcon field="avg_citations" />
                    </button>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedRows.length === 0 ? (
                <tr>
                  <td colSpan={showAvgCitations ? 4 : 3} className={HOUSE_TABLE_EMPTY_CLASS}>
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                filteredAndSortedRows.map((row) => (
                  <tr key={row.key} className={HOUSE_TABLE_ROW_CLASS}>
                    <td className="px-3 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.value}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.share_pct}%</td>
                    {showAvgCitations ? (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.avg_citations !== undefined ? row.avg_citations.toFixed(1) : 'n/a'}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filteredAndSortedRows.length} of {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
      </p>
    </div>
  )
}
