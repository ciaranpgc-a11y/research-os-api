import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

type ExtractMarkProps = SVGProps<SVGSVGElement>

export function ExtractMark({ className, ...props }: ExtractMarkProps) {
  return (
    <svg
      viewBox="0 0 120 84"
      role="img"
      aria-label="Extract mark"
      className={cn('h-8 w-auto', className)}
      {...props}
    >
      {/* Stylised heartbeat / pulse waveform */}
      <path
        d="M8 48 L28 48 L36 24 L48 68 L56 32 L64 56 L72 40 L80 48 L112 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  )
}
