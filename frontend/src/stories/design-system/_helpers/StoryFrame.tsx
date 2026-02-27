import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type StoryFrameProps = {
  title?: string
  subtitle?: string
  padded?: boolean
  children: ReactNode
}

export function StoryFrame({ title, subtitle, padded = true, children }: StoryFrameProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className={cn('mx-auto w-full max-w-sz-1200', padded ? 'p-6' : '')}>
        {title ? <h1 className="house-section-title">{title}</h1> : null}
        {subtitle ? <p className="house-section-subtitle mt-1">{subtitle}</p> : null}
        <div className={cn(title || subtitle ? 'mt-4' : '')}>{children}</div>
      </div>
    </div>
  )
}
