import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react'

import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'
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

type PublicationBreakdownTableVariant = 'interactive' | 'summary-drilldown'
type SortField = 'label' | 'value' | 'share_pct' | 'avg_citations'
type SortDirection = 'asc' | 'desc'

const HOUSE_TABLE_EMPTY_CLASS = publicationsHouseDrilldown.tableEmpty

function formatSharePercent(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`
}

export function PublicationBreakdownTable({
  rows,
  variant = 'interactive',
  showAvgCitations = false,
  showSearch = true,
  showRowCount = true,
  nameColumnLabel = 'Name',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data available',
}: {
  rows: PublicationBreakdownRow[]
  variant?: PublicationBreakdownTableVariant
  showAvgCitations?: boolean
  showSearch?: boolean
  showRowCount?: boolean
  nameColumnLabel?: string
  searchPlaceholder?: string
  emptyMessage?: string
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('value')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const isSummaryDrilldownVariant = variant === 'summary-drilldown'

  const filteredRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    let filtered = [...rows]
    if (showSearch && query) {
      filtered = rows.filter((row) => row.label.toLowerCase().includes(query))
    }
    return filtered
  }, [rows, searchQuery, showSearch])

  const displayedRows = useMemo(() => {
    if (isSummaryDrilldownVariant) {
      return filteredRows
    }
    return [...filteredRows].sort((a, b) => {
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
  }, [filteredRows, isSummaryDrilldownVariant, sortField, sortDirection, showAvgCitations])

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
      {showSearch ? (
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
      ) : null}

      {isSummaryDrilldownVariant ? (
        <div className="w-full overflow-visible">
          <div
            className="house-table-shell house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background"
            style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
          >
            <table
              className="w-full border-collapse"
              data-house-no-column-resize="true"
              data-house-no-column-controls="true"
            >
              <thead className="house-table-head">
                <tr>
                  <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">{nameColumnLabel}</th>
                  <th
                    className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap"
                    style={{ width: '1%' }}
                  >
                    Count
                  </th>
                  <th
                    className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap"
                    style={{ width: '1%' }}
                  >
                    Share
                  </th>
                  {showAvgCitations ? (
                    <th
                      className="house-table-head-text h-10 px-1.5 text-right align-middle font-semibold whitespace-nowrap"
                      style={{ width: '1%' }}
                    >
                      Avg Cites
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {displayedRows.length ? (
                  displayedRows.map((row) => (
                    <tr key={row.key} className="house-table-row">
                      <td className="house-table-cell-text px-2 py-2">
                        <span className="block max-w-full whitespace-normal break-words leading-snug">{row.label}</span>
                      </td>
                      <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">{row.value}</td>
                      <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">{formatSharePercent(row.share_pct)}</td>
                      {showAvgCitations ? (
                        <td className="house-table-cell-text px-1.5 py-2 text-right whitespace-nowrap tabular-nums">
                          {row.avg_citations !== undefined ? row.avg_citations.toFixed(1) : 'n/a'}
                        </td>
                      ) : null}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className={cn('house-table-cell-text px-3 py-4 text-center', HOUSE_TABLE_EMPTY_CLASS)} colSpan={showAvgCitations ? 4 : 3}>
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="relative w-full house-table-context-profile">
          <div className="max-h-[28rem] overflow-auto">
            <Table
              className="w-full table-fixed house-table-resizable"
              data-house-no-column-resize="true"
              data-house-no-column-controls="true"
            >
              <TableHeader className="house-table-head sticky top-0 z-10 text-left">
                <TableRow style={{ backgroundColor: 'transparent' }}>
                  <TableHead className="house-table-head-text text-left">
                    <button
                      type="button"
                      onClick={() => handleSort('label')}
                      className={cn(
                        'inline-flex items-center gap-1 text-inherit',
                        houseTables.sortTrigger,
                      )}
                    >
                      {nameColumnLabel}
                      <SortIcon field="label" />
                    </button>
                  </TableHead>
                  <TableHead className="house-table-head-text text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('value')}
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 text-inherit',
                        houseTables.sortTrigger,
                      )}
                    >
                      Count
                      <SortIcon field="value" />
                    </button>
                  </TableHead>
                  <TableHead className="house-table-head-text text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('share_pct')}
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 text-inherit',
                        houseTables.sortTrigger,
                      )}
                    >
                      % of Total
                      <SortIcon field="share_pct" />
                    </button>
                  </TableHead>
                  {showAvgCitations ? (
                    <TableHead className="house-table-head-text text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('avg_citations')}
                        className={cn(
                          'ml-auto inline-flex items-center gap-1 text-inherit',
                          houseTables.sortTrigger,
                        )}
                      >
                        Avg Cites
                        <SortIcon field="avg_citations" />
                      </button>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showAvgCitations ? 4 : 3}
                      className={cn('house-table-cell-text px-3 py-4 text-center', HOUSE_TABLE_EMPTY_CLASS)}
                    >
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="house-table-cell-text px-3 py-2 align-top font-medium whitespace-normal break-words leading-tight">{row.label}</TableCell>
                      <TableCell className="house-table-cell-text px-3 py-2 align-top text-right whitespace-nowrap tabular-nums">{row.value}</TableCell>
                      <TableCell className="house-table-cell-text px-3 py-2 align-top text-right whitespace-nowrap tabular-nums">{formatSharePercent(row.share_pct)}</TableCell>
                      {showAvgCitations ? (
                        <TableCell className="house-table-cell-text px-3 py-2 align-top text-right whitespace-nowrap tabular-nums">
                          {row.avg_citations !== undefined ? row.avg_citations.toFixed(1) : 'n/a'}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {showRowCount ? (
        <p className="text-xs text-muted-foreground">
          Showing {displayedRows.length} of {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </p>
      ) : null}
    </div>
  )
}
