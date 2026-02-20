import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type PageFrameProps = {
  title: string
  description: string
  children?: ReactNode
}

export function PageFrame({ title, description, children }: PageFrameProps) {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace Scaffold</CardTitle>
          <CardDescription>Interactive UI elements can be expanded here as backend features are connected.</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}
