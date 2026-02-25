import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

export function WorkspaceExportsPage() {
  const navigate = useNavigate()
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = params.workspaceId || 'hf-registry'

  return (
    <section data-house-role="page" className="space-y-4">
      <header data-house-role="page-header" className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder)}>
        <h1 data-house-role="page-title" className={houseTypography.title}>Exports</h1>
        <p data-house-role="page-subtitle" className={houseTypography.subtitle}>
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
