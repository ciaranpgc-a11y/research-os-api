import * as React from 'react'

import { cn } from '@/lib/utils'

export type InsightsGlyphProps = React.SVGProps<SVGSVGElement>

export function InsightsGlyph({
  className,
  useCurrentColor = false,
  animateTwinkle = false,
  ...props
}: InsightsGlyphProps & { useCurrentColor?: boolean; animateTwinkle?: boolean }) {
  const gradientId = React.useId()
  const heroTwinkleStyle = animateTwinkle
    ? ({
        animation: 'insights-glyph-twinkle 2.6s ease-in-out infinite',
        transformBox: 'fill-box',
        transformOrigin: 'center',
      } as const)
    : undefined
  const secondaryTwinkleStyle = animateTwinkle
    ? ({
        animation: 'insights-glyph-twinkle-soft 2.2s ease-in-out 0.28s infinite',
        transformBox: 'fill-box',
        transformOrigin: 'center',
      } as const)
    : undefined
  const microTwinkleStyle = animateTwinkle
    ? ({
        animation: 'insights-glyph-twinkle-soft 1.9s ease-in-out 0.62s infinite',
        transformBox: 'fill-box',
        transformOrigin: 'center',
      } as const)
    : undefined

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('h-4 w-4', className)}
      aria-hidden="true"
      data-ui="insights-glyph"
      data-animated={animateTwinkle ? 'true' : 'false'}
      {...props}
    >
      {animateTwinkle ? (
        <style>
          {`
            @keyframes insights-glyph-twinkle {
              0%, 100% {
                opacity: 0.88;
                transform: scale(0.96);
              }
              18% {
                opacity: 1;
                transform: scale(1.08);
              }
              34% {
                opacity: 0.94;
                transform: scale(0.99);
              }
              52% {
                opacity: 1;
                transform: scale(1.04);
              }
            }
            @keyframes insights-glyph-twinkle-soft {
              0%, 100% {
                opacity: 0.62;
                transform: scale(0.94);
              }
              22% {
                opacity: 0.9;
                transform: scale(1.06);
              }
              44% {
                opacity: 0.72;
                transform: scale(0.98);
              }
              64% {
                opacity: 0.96;
                transform: scale(1.02);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-ui="insights-glyph"][data-animated="true"] path {
                animation: none !important;
                transform: none !important;
                opacity: inherit !important;
              }
            }
          `}
        </style>
      ) : null}
      {!useCurrentColor ? (
        <defs>
          <linearGradient id={`${gradientId}-hero`} x1="4.2" y1="16.8" x2="15.8" y2="5.9" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="hsl(var(--tone-accent-500))" />
            <stop offset="1" stopColor="hsl(var(--tone-accent-300))" />
          </linearGradient>
          <linearGradient id={`${gradientId}-secondary`} x1="14.2" y1="7.1" x2="20.3" y2="2.9" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="hsl(var(--tone-accent-600))" />
            <stop offset="1" stopColor="hsl(var(--tone-accent-400))" />
          </linearGradient>
          <linearGradient id={`${gradientId}-micro`} x1="13.9" y1="18.6" x2="18.7" y2="15.5" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="hsl(var(--tone-accent-700))" />
            <stop offset="1" stopColor="hsl(var(--tone-accent-500))" />
          </linearGradient>
        </defs>
      ) : null}
      <path
        d="M8.55 3.6C9.06 6.24 10.71 7.89 13.35 8.4C10.71 8.91 9.06 10.56 8.55 13.2C8.04 10.56 6.39 8.91 3.75 8.4C6.39 7.89 8.04 6.24 8.55 3.6Z"
        fill={useCurrentColor ? 'currentColor' : `url(#${gradientId}-hero)`}
        style={heroTwinkleStyle}
      />
      <path
        d="M17.35 2.45C17.68 3.95 18.7 4.97 20.2 5.3C18.7 5.63 17.68 6.65 17.35 8.15C17.02 6.65 16 5.63 14.5 5.3C16 4.97 17.02 3.95 17.35 2.45Z"
        fill={useCurrentColor ? 'currentColor' : `url(#${gradientId}-secondary)`}
        opacity={useCurrentColor ? '0.76' : '0.95'}
        style={secondaryTwinkleStyle}
      />
      <path
        d="M15.6 15.25C15.87 16.46 16.64 17.23 17.85 17.5C16.64 17.77 15.87 18.54 15.6 19.75C15.33 18.54 14.56 17.77 13.35 17.5C14.56 17.23 15.33 16.46 15.6 15.25Z"
        fill={useCurrentColor ? 'currentColor' : `url(#${gradientId}-micro)`}
        opacity={useCurrentColor ? '0.58' : '0.92'}
        style={microTwinkleStyle}
      />
    </svg>
  )
}
