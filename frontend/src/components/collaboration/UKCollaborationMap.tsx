'use client'

import { useId, useMemo } from 'react'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'

import { findInstitution } from '@/data/uk-institutions'
import { cn } from '@/lib/utils'

type UKCollaborationMapProps = {
  collaborators: Array<{
    country: string
    primary_institution: string
    collaboration_strength_score?: number
  }>
  className?: string
  onMarkerClick?: (institution: string) => void
}

type SimpleGeography = {
  rsmKey: string
  properties?: {
    name?: string
  }
}

const WORLD_TOPOJSON = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 1
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[index] || 1
}

function lerp(start: number, end: number, t: number): number {
  return Math.round(start + (end - start) * t)
}

function heatColor(normalized: number): string {
  const t = Math.max(0, Math.min(1, normalized))

  if (t < 0.5) {
    const local = t / 0.5
    const r = lerp(59, 251, local)
    const g = lerp(130, 191, local)
    const b = lerp(246, 36, local)
    return `rgb(${r}, ${g}, ${b})`
  }

  const local = (t - 0.5) / 0.5
  const r = lerp(251, 239, local)
  const g = lerp(191, 68, local)
  const b = lerp(36, 68, local)
  return `rgb(${r}, ${g}, ${b})`
}

export function UKCollaborationMap({ collaborators, className, onMarkerClick }: UKCollaborationMapProps) {
  const rawClipPathId = useId()
  const clipPathId = `uk-clip-${rawClipPathId.replace(/:/g, '')}`

  const aggregatedData = useMemo(() => {
    const pointMap = new Map<
      string,
      {
        lat: number
        lon: number
        intensity: number
        count: number
        institutionCounts: Map<string, number>
      }
    >()

    collaborators.forEach((collaborator) => {
      const inst = findInstitution(collaborator.primary_institution)
      if (!inst) return

      const key = `${inst.lat},${inst.lon}`
      const existing = pointMap.get(key) || {
        lat: inst.lat,
        lon: inst.lon,
        intensity: 0,
        count: 0,
        institutionCounts: new Map<string, number>(),
      }

      const institutionLabel = collaborator.primary_institution.trim() || inst.name
      existing.intensity += collaborator.collaboration_strength_score || 1
      existing.count += 1
      existing.institutionCounts.set(
        institutionLabel,
        (existing.institutionCounts.get(institutionLabel) || 0) + 1
      )
      pointMap.set(key, existing)
    })

    return Array.from(pointMap.values()).map((item) => {
      const rankedInstitutions = Array.from(item.institutionCounts.entries()).sort((left, right) => {
        if (left[1] === right[1]) {
          return left[0].localeCompare(right[0])
        }
        return right[1] - left[1]
      })
      return {
        lat: item.lat,
        lon: item.lon,
        intensity: item.intensity,
        count: item.count,
        institution: rankedInstitutions[0]?.[0] || 'Unknown',
      }
    })
  }, [collaborators])

  const intensityCeiling = useMemo(
    () => Math.max(percentile(aggregatedData.map((item) => item.intensity), 0.9), 1),
    [aggregatedData]
  )

  const totalUkCollaborators = aggregatedData.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{totalUkCollaborators} UK collaborators</span>
        <span>Geographic intensity</span>
      </div>

      <div className="w-full rounded-md border bg-muted/20 p-2">
        <div className="h-[560px] w-full overflow-hidden rounded md:h-[700px]">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [-3.5, 55.2], scale: 3200 }}
            width={760}
            height={980}
            style={{ width: '100%', height: '100%' }}
          >
            <defs>
              <filter id="heat-blur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4.2" />
              </filter>
            </defs>

            <Geographies geography={WORLD_TOPOJSON}>
              {({ geographies }: { geographies: SimpleGeography[] }) => {
                const ukGeographies = geographies.filter((geo) => geo.properties?.name === 'United Kingdom')

                return (
                  <>
                    <defs>
                      <clipPath id={clipPathId}>
                        {ukGeographies.map((geo) => (
                          <Geography key={`clip-${geo.rsmKey}`} geography={geo} fill="black" stroke="none" />
                        ))}
                      </clipPath>
                    </defs>

                    {ukGeographies.map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="hsl(var(--muted))"
                        fillOpacity={0.82}
                        stroke="hsl(var(--foreground))"
                        strokeOpacity={0.45}
                        strokeWidth={1.25}
                      />
                    ))}

                    <g clipPath={`url(#${clipPathId})`}>
                      {aggregatedData.map((item) => {
                        const normalized = Math.min(item.intensity, intensityCeiling) / intensityCeiling
                        const outerRadius = 22 + Math.sqrt(normalized) * 34
                        const middleRadius = outerRadius * 0.66
                        const innerRadius = outerRadius * 0.44
                        const color = heatColor(normalized)

                        return (
                          <Marker
                            key={`${item.lat}-${item.lon}`}
                            coordinates={[item.lon, item.lat]}
                            onClick={() => onMarkerClick?.(item.institution)}
                          >
                            <title>{`${item.institution}: ${item.count} collaborators`}</title>
                            <g
                              style={{
                                mixBlendMode: 'multiply',
                                cursor: onMarkerClick ? 'pointer' : 'default',
                              }}
                            >
                              <circle
                                r={outerRadius}
                                fill={color}
                                fillOpacity={0.06 + normalized * 0.12}
                                filter="url(#heat-blur)"
                              />
                              <circle
                                r={middleRadius}
                                fill={color}
                                fillOpacity={0.1 + normalized * 0.14}
                                filter="url(#heat-blur)"
                              />
                              <circle
                                r={innerRadius}
                                fill={color}
                                fillOpacity={0.14 + normalized * 0.18}
                                filter="url(#heat-blur)"
                              />
                            </g>
                          </Marker>
                        )
                      })}
                    </g>
                  </>
                )
              }}
            </Geographies>
          </ComposableMap>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Intensity:</span>
        <div className="flex items-center gap-1">
          <div className="h-4 w-4 rounded border border-blue-300 bg-blue-400" />
          <span className="text-muted-foreground">Low</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-4 w-4 rounded border border-yellow-300 bg-yellow-400" />
          <span className="text-muted-foreground">Med</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-4 w-4 rounded border border-red-400 bg-red-500" />
          <span className="text-muted-foreground">High</span>
        </div>
        {onMarkerClick ? <span className="text-muted-foreground">Click a marker to drill down</span> : null}
      </div>
    </div>
  )
}
