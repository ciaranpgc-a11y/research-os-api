import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { resultObjects } from '@/mock/results'
import { PageFrame } from '@/pages/page-frame'
import { useAaweStore } from '@/store/use-aawe-store'

export function ResultsPage() {
  const selectedItem = useAaweStore((state) => state.selectedItem)
  const setSelectedItem = useAaweStore((state) => state.setSelectedItem)
  const searchQuery = useAaweStore((state) => state.searchQuery)

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredResults = useMemo(() => {
    if (!normalizedQuery) {
      return resultObjects
    }
    return resultObjects.filter((result) => {
      const text = [
        result.id,
        result.type,
        result.effect,
        result.ci,
        result.model,
        result.derivation.populationFilter,
      ]
        .join(' ')
        .toLowerCase()
      return text.includes(normalizedQuery)
    })
  }, [normalizedQuery])

  return (
    <PageFrame
      title="Results"
      description="Structured result objects with provenance and validation metadata."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Result Objects</CardTitle>
          <CardDescription>Click any row to inspect derivation details in the Insight panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Result ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Effect</TableHead>
                <TableHead>CI</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Adjusted</TableHead>
                <TableHead>Validated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResults.map((result) => {
                const isActive = selectedItem?.type === 'result' && selectedItem.data.id === result.id
                return (
                  <TableRow
                    key={result.id}
                    data-state={isActive ? 'selected' : undefined}
                    className="cursor-pointer"
                    onClick={() => setSelectedItem({ type: 'result', data: result })}
                  >
                    <TableCell className="font-medium">{result.id}</TableCell>
                    <TableCell>{result.type}</TableCell>
                    <TableCell>{result.effect}</TableCell>
                    <TableCell>{result.ci}</TableCell>
                    <TableCell>{result.model}</TableCell>
                    <TableCell>
                      <Badge variant={result.adjusted ? 'default' : 'outline'}>
                        {result.adjusted ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={result.validated ? 'secondary' : 'outline'}>
                        {result.validated ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filteredResults.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No result objects match the current search query.</p>
          ) : null}
        </CardContent>
      </Card>
    </PageFrame>
  )
}
