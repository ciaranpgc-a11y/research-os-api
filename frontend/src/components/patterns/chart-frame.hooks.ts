import { useEffect, useMemo, useState } from 'react'

type ChartMotionPreset = 'snappy' | 'default' | 'emphasis'

type ChartTheme = {
  series: string[]
  gridLine: string
  gridLineStrong: string
  label: string
  labelStrong: string
  muted: string
  foreground: string
}

type ChartMotion = {
  duration: string
  easing: string
  reducedMotion: boolean
}

function cssVar(token: string): string {
  return `hsl(var(${token}))`
}

function motionDurationByPreset(preset: ChartMotionPreset): string {
  if (preset === 'snappy') {
    return 'var(--motion-duration-fast)'
  }
  if (preset === 'emphasis') {
    return 'var(--motion-duration-base)'
  }
  return 'var(--motion-duration-ui)'
}

export function useChartTheme(): ChartTheme {
  return useMemo(
    () => ({
      series: [
        cssVar('--chart-series-1'),
        cssVar('--chart-series-2'),
        cssVar('--chart-series-3'),
        cssVar('--chart-series-4'),
        cssVar('--chart-series-5'),
      ],
      gridLine: cssVar('--chart-grid-line'),
      gridLineStrong: cssVar('--chart-grid-line-strong'),
      label: cssVar('--chart-label'),
      labelStrong: cssVar('--chart-label-strong'),
      muted: cssVar('--muted-foreground'),
      foreground: cssVar('--foreground'),
    }),
    [],
  )
}

export function useChartMotion(preset: ChartMotionPreset = 'default'): ChartMotion {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyPreference = () => setReducedMotion(mediaQuery.matches)
    applyPreference()
    mediaQuery.addEventListener('change', applyPreference)
    return () => mediaQuery.removeEventListener('change', applyPreference)
  }, [])

  return {
    duration: reducedMotion ? '0ms' : motionDurationByPreset(preset),
    easing: 'var(--motion-ease-chart-series)',
    reducedMotion,
  }
}

export type { ChartMotion, ChartMotionPreset, ChartTheme }
