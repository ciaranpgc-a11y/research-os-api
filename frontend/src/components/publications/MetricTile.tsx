import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PublicationMetricTilePayload } from '@/types/impact'

import { dashboardTileStyles } from './dashboard-tile-styles'

type MetricTagTone = 'positive' | 'neutral' | 'caution' | 'negative'

function metricTagClass(tone: MetricTagTone): string {
  if (tone === 'positive') {
    return dashboardTileStyles.tagPositive
  }
  if (tone === 'caution') {
    return dashboardTileStyles.tagCaution
  }
  if (tone === 'negative') {
    return dashboardTileStyles.tagNegative
  }
  return dashboardTileStyles.tagNeutral
}

export type MetricTileProps = {
  tile: PublicationMetricTilePayload
  onOpen: () => void
  shouldIgnoreTileOpen: (target: EventTarget | null) => boolean
  sourceText: string
  updateText: string
  primaryValue: ReactNode
  secondaryText?: ReactNode
  visual: ReactNode
  footerText?: ReactNode
  tagLabel?: string
  tagTone?: MetricTagTone
  tileClassName?: string
  titleClassName?: string
  showSecondary?: boolean
  showFooter?: boolean
}

export function MetricTile({
  tile,
  onOpen,
  shouldIgnoreTileOpen,
  sourceText,
  updateText,
  primaryValue,
  secondaryText,
  visual,
  footerText,
  tagLabel,
  tagTone = 'neutral',
  tileClassName,
  titleClassName,
  showSecondary = true,
  showFooter = true,
}: MetricTileProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-metric-key={tile.key}
      onClick={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        onOpen()
      }}
      onKeyDown={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        dashboardTileStyles.tileShell,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        tileClassName,
      )}
    >
      <div className={dashboardTileStyles.tileHeader}>
        <p className={cn(dashboardTileStyles.tileTitle, titleClassName)} data-testid={`metric-label-${tile.key}`}>
          {tile.label}
        </p>
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-stop-tile-open="true"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className={dashboardTileStyles.tileInfoButton}
                aria-label={`About ${tile.label}`}
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sz-320 leading-relaxed">
              <p>{tile.tooltip}</p>
              <p className="mt-1 text-micro text-muted-foreground">Formula: {tile.drilldown.formula || '\u2014'}</p>
              <p className="mt-1 text-micro text-muted-foreground">Source: {sourceText}</p>
              <p className="mt-1 text-micro text-muted-foreground">Update: {updateText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <p className={dashboardTileStyles.tileMetric} data-testid={`metric-value-${tile.key}`}>
        {primaryValue}
      </p>
      {showSecondary ? <p className={dashboardTileStyles.tileSecondary}>{secondaryText || '\u2014'}</p> : null}

      {visual}

      {showFooter ? (
        <div className={dashboardTileStyles.tileFooter}>
          {footerText ? (
            footerText
          ) : (
            <p className={dashboardTileStyles.tileFooterText}>{'\u2014'}</p>
          )}
          {tagLabel ? (
            <span className={cn(dashboardTileStyles.tagPill, metricTagClass(tagTone))}>
              {tagLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}


