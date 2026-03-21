import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

type CmrMarkProps = SVGProps<SVGSVGElement>

export function CmrMark({ className, ...props }: CmrMarkProps) {
  return (
    <svg
      viewBox="0 0 120 84"
      role="img"
      aria-label="CMR mark"
      className={cn('h-8 w-auto', className)}
      {...props}
    >
      <path d="M60 4L108 22L60 40L12 22L60 4Z" fill="currentColor" fillOpacity="0.9" />
      <path d="M60 26L102 42L60 58L18 42L60 26Z" fill="currentColor" fillOpacity="0.72" />
      <path d="M60 46L96 60L60 76L24 60L60 46Z" fill="currentColor" fillOpacity="0.54" />
    </svg>
  )
}
