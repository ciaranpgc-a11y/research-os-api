export type RegurgitationSeverity = 'none' | 'trivial' | 'mild' | 'moderate' | 'severe'

export const REGURGITATION_SEVERITY_LABELS: Record<RegurgitationSeverity, string> = {
  none: 'None',
  trivial: 'Trivial',
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
}

export const REGURGITATION_SEVERITY_COLORS: Record<RegurgitationSeverity, string> = {
  none: 'hsl(164 40% 45%)',
  trivial: 'hsl(164 35% 50%)',
  mild: 'hsl(45 85% 58%)',
  moderate: 'hsl(30 75% 50%)',
  severe: 'hsl(3 55% 48%)',
}

export const RF_REGURGITATION_SEVERITY_THRESHOLDS: Array<{
  lo: number
  hi: number
  grade: RegurgitationSeverity
}> = [
  { lo: 0, hi: 5, grade: 'none' },
  { lo: 5, hi: 10, grade: 'trivial' },
  { lo: 10, hi: 20, grade: 'mild' },
  { lo: 20, hi: 40, grade: 'moderate' },
  { lo: 40, hi: Number.POSITIVE_INFINITY, grade: 'severe' },
]

export function rfToRegurgitationSeverity(rf: number): RegurgitationSeverity {
  for (const threshold of RF_REGURGITATION_SEVERITY_THRESHOLDS) {
    if (rf < threshold.hi) return threshold.grade
  }
  return 'severe'
}
