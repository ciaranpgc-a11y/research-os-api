import * as React from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { cn } from '@/lib/utils'

export type HelpTooltipIconButtonProps = {
  content: React.ReactNode
  ariaLabel?: string
  className?: string
  buttonClassName?: string
  iconClassName?: string
  side?: React.ComponentProps<typeof TooltipContent>['side']
  align?: React.ComponentProps<typeof TooltipContent>['align']
}

export function HelpTooltipIconButton({
  content,
  ariaLabel = 'Show more information',
  className,
  buttonClassName,
  iconClassName,
  side = 'top',
  align = 'end',
}: HelpTooltipIconButtonProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={ariaLabel}
              className={cn(
                'group inline-flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--background))] text-[hsl(var(--tone-neutral-700))] transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-duration-ui)] ease-out hover:border-[hsl(var(--tone-accent-400))] hover:bg-[hsl(var(--tone-neutral-50))] hover:text-[hsl(var(--tone-accent-800))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2',
                buttonClassName,
              )}
            >
            <span
              aria-hidden="true"
              className={cn(
                'text-[0.95rem] font-semibold leading-none text-[hsl(var(--tone-neutral-700))] transition-colors duration-[var(--motion-duration-ui)] ease-out group-hover:text-[hsl(var(--tone-accent-800))] group-focus-visible:text-[hsl(var(--tone-accent-800))]',
                iconClassName,
              )}
            >
              ?
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={cn(
            'house-approved-tooltip max-w-[18rem] whitespace-normal px-2 py-1.5 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none',
            className,
          )}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
