import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function WorkspaceExportsPage() {
  const navigate = useNavigate()
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = params.workspaceId || 'hf-registry'

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="text-sm text-muted-foreground">
          Package manuscript outputs and quality checks for submission workflows.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export checklist</CardTitle>
          <CardDescription>Run QC first, then export manuscript and supporting evidence.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(`/w/${workspaceId}/qc`)}>
            Open quality check
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/w/${workspaceId}/manuscript/introduction`)}>
            Open manuscript
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/w/${workspaceId}/run-wizard`)}>
            Open run wizard
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
