import { useNavigate } from 'react-router-dom'

import { AxiomosMark } from '@/components/auth/AxiomosMark'
import { Container, Grid, PageHeader, Row, Section, Stack } from '@/components/primitives'
import { PanelShell } from '@/components/patterns'
import { Button } from '@/components/ui'

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <main className="min-h-screen bg-[hsl(var(--background))]">
      <Container size="wide" gutter="default" className="py-[var(--space-6)]">
        <Stack space="xl">
          <Row align="between" gap="md">
            <Row align="center" gap="md" wrap={false}>
              <AxiomosMark className="h-[var(--space-6)] text-[hsl(var(--primary))]" />
              <Stack space="sm">
                <span className="block truncate text-h2 font-semibold text-[hsl(var(--tone-neutral-900))]">
                  Axiomos
                </span>
                <span className="hidden truncate text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] md:block">
                  The Research Operating System
                </span>
              </Stack>
            </Row>
            <Button type="button" variant="secondary" onClick={() => navigate('/auth')}>
              Sign in
            </Button>
          </Row>

          <Section surface="card" inset="lg" spaceY="lg">
            <PageHeader
              eyebrow="Research writing workspace"
              heading="Plan, draft, and quality-check manuscripts in one workflow"
              description="Axiomos helps you structure research context, build a rigorous manuscript plan, and produce draft-ready sections with transparent guardrails."
              actions={
                <Row gap="sm" align="center">
                  <Button type="button" onClick={() => navigate('/auth')}>
                    Get started
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate('/auth')}>
                    Create account
                  </Button>
                </Row>
              }
            />

            <Grid cols={1} gap="md" className="md:grid-cols-3">
              <PanelShell
                heading="Structured planning"
                description="Build manuscript plans section-by-section with explicit assumptions and unresolved items."
                surface="muted"
                inset="sm"
                spaceY="sm"
              />
              <PanelShell
                heading="Profile-driven context"
                description="Connect account and publication context so planning decisions are traceable and reusable."
                surface="muted"
                inset="sm"
                spaceY="sm"
              />
              <PanelShell
                heading="QC-ready outputs"
                description="Keep methods and interpretations constrained before generation and export."
                surface="muted"
                inset="sm"
                spaceY="sm"
              />
            </Grid>
          </Section>
        </Stack>
      </Container>
    </main>
  )
}
