import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageFrame } from '@/pages/page-frame'

export function OverviewPage() {
  return (
    <PageFrame
      title="Overview"
      description="Project-level state for protocol, data readiness, manuscript progress, and integrity posture."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Data readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge>Ready</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Manuscript state</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Drafting</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Integrity risk</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Moderate</Badge>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  )
}
