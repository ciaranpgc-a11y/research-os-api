import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { qcItems } from '@/mock/qc'
import { PageFrame } from '@/pages/page-frame'
import { useAaweStore } from '@/store/use-aawe-store'

const severityVariantMap: Record<'High' | 'Medium' | 'Low', 'destructive' | 'secondary' | 'outline'> = {
  High: 'destructive',
  Medium: 'secondary',
  Low: 'outline',
}

export function QCDashboardPage() {
  const selectedItem = useAaweStore((state) => state.selectedItem)
  const setSelectedItem = useAaweStore((state) => state.setSelectedItem)
  const searchQuery = useAaweStore((state) => state.searchQuery)

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredQcItems = useMemo(() => {
    if (!normalizedQuery) {
      return qcItems
    }
    return qcItems.filter((item) => {
      const text = [
        item.id,
        item.category,
        item.severity,
        item.summary,
        item.recommendation,
        ...item.affectedItems,
      ]
        .join(' ')
        .toLowerCase()
      return text.includes(normalizedQuery)
    })
  }, [normalizedQuery])

  return (
    <PageFrame
      title="QC Dashboard"
      description="Integrity checks spanning unsupported claims, citations, consistency, and journal policy fit."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredQcItems.map((item) => {
          const isActive = selectedItem?.type === 'qc' && selectedItem.data.id === item.id
          return (
            <Card
              key={item.id}
              className={`cursor-pointer transition-colors ${isActive ? 'border-primary/70 bg-primary/5' : ''}`}
              onClick={() => setSelectedItem({ type: 'qc', data: item })}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{item.category}</CardTitle>
                  <Badge variant={severityVariantMap[item.severity]}>{item.severity}</Badge>
                </div>
                <CardDescription>{item.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <p>
                  Findings: <span className="font-semibold">{item.count}</span>
                </p>
                <p className="text-muted-foreground">Affected: {item.affectedItems.join(', ')}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {filteredQcItems.length === 0 ? (
        <p className="text-xs text-muted-foreground">No QC cards match the current search query.</p>
      ) : null}
    </PageFrame>
  )
}
