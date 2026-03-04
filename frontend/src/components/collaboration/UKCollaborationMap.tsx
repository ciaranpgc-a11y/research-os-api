'use client'

import { useMemo } from 'react'
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
  const mapData = useMemo(() => {
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
    const unmatchedInstitutionCounts = new Map<string, number>()

    collaborators.forEach((collaborator) => {
      const inst = findInstitution(collaborator.primary_institution)
      if (!inst) {
        const key = collaborator.primary_institution.trim() || 'Unknown'
        unmatchedInstitutionCounts.set(key, (unmatchedInstitutionCounts.get(key) || 0) + 1)
        return
      }

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

    const points = Array.from(pointMap.values()).map((item) => {
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

    const unmatchedTop = Array.from(unmatchedInstitutionCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }))

    return {
      points,
      unmatchedCount: Array.from(unmatchedInstitutionCounts.values()).reduce((sum, count) => sum + count, 0),
      unmatchedTop,
    }
  }, [collaborators])

  const intensityCeiling = useMemo(
    () => Math.max(percentile(mapData.points.map((item) => item.intensity), 0.92), 1),
    [mapData.points]
  )

  const totalUkCollaborators = mapData.points.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{totalUkCollaborators} UK collaborators</span>
        <span>Geographic intensity (smoothed points)</span>
      </div>

      <div className="w-full rounded-md border bg-muted/20 p-2">
        <div className="h-[420px] w-full overflow-visible rounded md:h-[560px]">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [-2.2, 54.9], scale: 2860 }}
            width={960}
            height={760}
            style={{ width: '100%', height: '100%' }}
          >
            <defs>
              <filter id="heat-blur" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="5.2" />
              </filter>
            </defs>

            <Geographies geography={WORLD_TOPOJSON}>
              {({ geographies }: { geographies: SimpleGeography[] }) => {
                const ukGeographies = geographies.filter((geo) => geo.properties?.name === 'United Kingdom')

                return (
                  <>
                    {ukGeographies.map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="hsl(var(--muted))"
                        fillOpacity={0.74}
                        stroke="hsl(var(--foreground))"
                        strokeOpacity={0.38}
                        strokeWidth={1.15}
                      />
                    ))}

                    <g>
                      {mapData.points.map((item) => {
                        const normalizedRaw = Math.min(item.intensity, intensityCeiling) / intensityCeiling
                        const normalized = Math.pow(Math.max(0, Math.min(1, normalizedRaw)), 0.85)
                        const outerRadius = 13 + (normalized * 30)
                        const middleRadius = outerRadius * 0.62
                        const innerRadius = outerRadius * 0.37
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
                                fillOpacity={0.08 + normalized * 0.16}
                                filter="url(#heat-blur)"
                              />
                              <circle
                                r={middleRadius}
                                fill={color}
                                fillOpacity={0.13 + normalized * 0.16}
                                filter="url(#heat-blur)"
                              />
                              <circle
                                r={innerRadius}
                                fill={color}
                                fillOpacity={0.18 + normalized * 0.2}
                              />
                              <circle
                                r={Math.max(2.4, innerRadius * 0.2)}
                                fill="white"
                                fillOpacity={0.9}
                                stroke={color}
                                strokeWidth={1.1}
                              />
                            </g>
                          </Marker>
                        )
                      })}
                    </g>

                    {ukGeographies.map((geo) => (
                      <Geography
                        key={`outline-${geo.rsmKey}`}
                        geography={geo}
                        fill="none"
                        stroke="hsl(var(--foreground))"
                        strokeOpacity={0.55}
                        strokeWidth={1.15}
                      />
                    ))}
                  </>
                )
              }}
            </Geographies>
          </ComposableMap>
        </div>
      </div>

      {mapData.unmatchedCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {mapData.unmatchedCount} collaborators could not be mapped to UK institution coordinates.
          {mapData.unmatchedTop.length > 0
            ? ` Top unmapped: ${mapData.unmatchedTop.map((item) => `${item.name} (${item.count})`).join(', ')}.`
            : ''}
        </p>
      ) : null}

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
        <span className="text-muted-foreground">(click hotspot for drilldown)</span>
        {onMarkerClick ? <span className="text-muted-foreground">Click a marker to drill down</span> : null}
      </div>
    </div>
  )
}
