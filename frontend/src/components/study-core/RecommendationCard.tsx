import { Button } from '@/components/ui/button'

type RecommendationCardProps = {
  title: string
  rationale: string
  actionLabel: string
  onApply: () => void
  optionalPreview?: string
  disabled?: boolean
}

export function RecommendationCard({
  title,
  rationale,
  actionLabel,
  onApply,
  optionalPreview,
  disabled = false,
}: RecommendationCardProps) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{rationale}</p>
      <Button size="sm" onClick={onApply} disabled={disabled}>
        {actionLabel}
      </Button>
      {optionalPreview ? (
        <details className="rounded border border-border/70 bg-muted/20 p-2">
          <summary className="cursor-pointer text-xs font-medium">Preview</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground">{optionalPreview}</pre>
        </details>
      ) : null}
    </div>
  )
}
