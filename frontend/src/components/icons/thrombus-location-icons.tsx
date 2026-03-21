/**
 * Anatomical icons for thrombus primary locations.
 * 4-chamber heart cross-section base for cardiac chambers (LV, LA, LAA, RV, RA).
 * Illustrator-sourced silhouettes for Aorta and PA.
 * Hand-drawn pacemaker for Device, crosshair heart for Other.
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const defaults = (props: IconProps, viewBox: string) => {
  const { size = 20, ...rest } = props
  return { width: size, height: size, viewBox, fill: 'none', ...rest }
}

// --- Shared heart base paths (4-chamber cross-section) ---
const HEART_OUTLINE = 'M24 44 C24 44 6 30 6 18 C6 10 11 5 17 5 C20.5 5 23 7 24 9 C25 7 27.5 5 31 5 C37 5 42 10 42 18 C42 30 24 44 24 44Z'
const SEPTUM = 'M24 9 L24 38'
const AV_PLANE = 'M10 20 Q17 23 24 20 Q31 17 38 20'

function HeartBase({ stroke = 'currentColor' }: { stroke?: string }) {
  return (
    <>
      <path d={HEART_OUTLINE} fill="currentColor" opacity={0.08} stroke={stroke} strokeWidth={1.2} />
      <path d={SEPTUM} stroke={stroke} strokeWidth={0.8} opacity={0.4} />
      <path d={AV_PLANE} stroke={stroke} strokeWidth={0.8} opacity={0.4} />
    </>
  )
}

// --- LV ---
export function IconLV(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 48 48')}>
      <HeartBase />
      <path d="M24 20 Q31 17 38 20 L42 18 C42 30 24 44 24 44 L24 38 Z" fill="currentColor" opacity={0.55} />
    </svg>
  )
}

// --- LA ---
export function IconLA(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 48 48')}>
      <HeartBase />
      <path d="M24 9 C25 7 27.5 5 31 5 C37 5 42 10 42 18 L38 20 Q31 17 24 20 Z" fill="currentColor" opacity={0.55} />
    </svg>
  )
}

// --- LAA (heart + radar rings from LA region) ---
export function IconLAA(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 48 48')}>
      <HeartBase />
      <circle cx={34} cy={13} r={4} fill="currentColor" opacity={0.15} stroke="currentColor" strokeWidth={1.4} />
      <circle cx={34} cy={13} r={8.5} fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.5} />
      <circle cx={34} cy={13} r={13} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.3} />
      <circle cx={34} cy={13} r={2.5} fill="currentColor" opacity={0.9} />
    </svg>
  )
}

// --- RV ---
export function IconRV(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 48 48')}>
      <HeartBase />
      <path d="M24 20 Q17 23 10 20 L6 18 C6 26 18 38 24 44 L24 38 Z" fill="currentColor" opacity={0.55} />
    </svg>
  )
}

// --- RA ---
export function IconRA(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 48 48')}>
      <HeartBase />
      <path d="M24 9 C23 7 20.5 5 17 5 C11 5 6 10 6 18 L10 20 Q17 23 24 20 Z" fill="currentColor" opacity={0.55} />
    </svg>
  )
}

// --- Aorta (Illustrator silhouette) ---
const AORTA_PATH = 'M260.4,51c1,.6,2,1.1,3,1.7l13.8,7.6-25.9,57.1c-3.5,7.6-2,15,4,20.7,26.5,25.3,42.6,58.3,46,94.8,3.7,40.1-8.3,88.7-17.7,128l-18.9,72.7-46.9-12c8.1-27.8,15.7-54.9,22.3-83.1,5.1-21.9,9.2-43,11.9-65.2,5.3-43.5-7.1-98.6-55.8-109.1-23.7-5.1-47.2,4.6-60.4,25-11.9,18.3-13.9,40.8-5.9,61.3,16.7,42.5,58.9,44.4,66,78.9,1.1,5.2.3,10.1-2.9,14.3-2.8,3.7-7.6,6-13.4,6.6-.3,10.4-7.7,18.1-18.4,19,0,4.9.7,9.5-2.3,13.5-2.3,3.1-6.9,5.7-12.1,5.7-14.8,0-28.7-6.9-38.8-18.3-14.7-16.7-26.1-35.6-35.7-55.8-27-56.7-25.2-117.4,10.9-169.4,5.9-8.5,6.8-20.8-.2-28.5-10.8-12-23-21.7-35.9-31.1l-26.2-19.2,12.2-22.1,39.9,23.4c5,2.9,10.7,1.7,13.2-3.7,5.3-11.3,10.4-22.3,16.9-33.2l14.9,6.4c-3.3,8.2-7.3,15.7-9,24.5-3,15.1,10.9,37.3,21.7,47.3,5,4.7,12.2,4.1,18.1,1.4,5.5-2.4,8.2-7.5,9.9-14.1,5.2-20.8,8.6-41.4,11.8-62.8l25.4,4.3-6.3,33.7c-1.5,8.1-3.1,16.2-2.7,24.5.6,11.2,10.6,18.8,21.3,19.4,8.3.5,14.3-3.5,18.1-10.4l29.6-54.5c.4-.1,1.1-.3,2-.2,1.2.1,2,.7,2.4,1Z'

export function IconAorta(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 333.3 464')}>
      <path d={AORTA_PATH} fill="currentColor" opacity={0.5} />
    </svg>
  )
}

// --- PA (Illustrator silhouette) ---
const PA_MAIN = 'M18.7,32.8c1.6.3,4.3.7,7.5,1.2,0,0,10.2,1.6,18.3,2.8,21.3,3.1,55.1,3.5,55.1,3.5,26.5.3,46.7-.7,63.5-1.6,28.8-1.5,53.3-2.8,79.3-7.3,24.8-4.2,34.4-6.3,34.4-6.3,5-1.1,12.4-2.7,22.8-4.5,6.4-1.1,11.6-1.8,15.1-2.2-.4.6-2.9,4.1-1.9,8.7.8,3.8,3.7,6.8,7.5,8-3.4,1.8-6.2,2.9-8.1,3.6-2.8,1-4.5,1.6-7,2.2-.5,0-2.6.6-7,1.7-1,.3-2.8.7-3.6,2.2-.2.4-.4.7-.3,1,.3,1.4,5,1.3,10.2,1.6,2.4.1,5.9.4,10.3,1-1.1.5-7.5,3.7-9.3,10.8-1,3.9-.2,7.3,0,7.9.8,3,2.3,5.1,3.2,6.2-11.9-2.4-21.7-3-28.7-3.1-6.7-.1-10.7.3-15.2,1.8,0,0-7.5,2.5-13.8,8.3-12.6,11.6-14.9,33.6-15.4,38.3-1.9,16.9-7.3,41.2-22.6,74-1.5-2.6-7.2-11.9-19.1-16.4-13-4.9-24.3-.8-26.9.3,10-17.2,13.9-32.3,15.5-41.9,2.6-15,.9-22-.6-26-3.5-9.7-10.1-15.4-13-17.8-15.1-12.7-34.1-12.7-64.7-12.6-25.6,0-43.2,3.9-51.6,6-8.8,2.2-16.1,4.7-21.5,6.7,1.2-3.4.5-7.1-1.9-9.7-3.4-3.6-8.3-2.8-8.6-2.8,1.5-1,3.8-2.5,6.7-4.2,16.8-9.9,27.7-11.5,27.4-14.1-.2-2-6.4-2.4-22.6-5.5-7.2-1.4-13-2.7-16.8-3.6.7-.5,4.8-3.7,5.4-9.4.4-4.3-1.4-7.5-2.1-8.5Z'
const PA_DETAILS = [
  'M18.7,33.3c-1.5-.5-3.5,1.9-3.9,2.4-.2.3-1,1.3-1.7,3.1-.5,1.4-1.4,3.6-.9,6.3.3,1.8,1.6,5.1,3.4,5.3,2.3.2,4.7-5.1,5.2-9,0-.2.3-2.6-.5-5.4-.4-1.3-.7-2.4-1.5-2.6Z',
  'M314.9,18.7c-.2,0-.5.2-1,1.4-.7,1.6-1.9,4.5-.7,7.9.5,1.4,1.2,2.3,2.3,3.6,1.5,1.9,2.6,2.4,3.2,2.7.9.4,1.3.5,1.7.4,1.6-.7,1.2-6.2-.7-10.5-1.1-2.6-3.4-6-4.7-5.6Z',
  'M312.2,50.3c-1.6,1.2-4.2,3.2-5.7,6.9-.1.3-1.9,4.7-.8,9.4.3,1.3.7,2.3,1.1,3.1.9,1.9,1.3,3,2.3,3.3,1.2.4,2.5-.6,3-1,5.4-4.2,6.3-22.2,2.9-23.1-.5-.1-1.2.4-2.7,1.5Z',
  'M20.6,86.8c2.4,4.1,8.5,5.8,10.5,3.9,2.1-2,.2-8.3-3.8-11.1-.2-.2-4-2.8-6.4-1.2-2.2,1.4-1.9,5.8-.4,8.5Z',
  'M213,192.4c-1.9,5.3-20.7,5.8-34.1-2.1-5.4-3.2-13.4-9.9-11.9-14,1.7-4.7,16-5.1,27-.9,9.9,3.7,20.6,12.4,19,17Z',
]

export function IconPA(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 333.3 217')}>
      <path d={PA_MAIN} fill="currentColor" opacity={0.5} />
      {PA_DETAILS.map((d, i) => (
        <path key={i} d={d} fill="currentColor" opacity={0.5} />
      ))}
    </svg>
  )
}

// --- Device (pacemaker) ---
export function IconDevice(props: IconProps) {
  return (
    <svg {...defaults(props, '0 2 48 48')}>
      <rect x={6} y={3} width={24} height={17} rx={4} fill="currentColor" opacity={0.08} stroke="currentColor" strokeWidth={1.4} />
      <rect x={9} y={6} width={18} height={4} rx={1.5} fill="currentColor" opacity={0.12} />
      <circle cx={13} cy={15} r={1.5} fill="currentColor" opacity={0.4} />
      <circle cx={19} cy={15} r={1.5} fill="currentColor" opacity={0.3} />
      <path d="M24 20 C26 24 32 28 36 34 C39 38 40 42 40 46" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M18 20 C18 26 22 32 24 38 C25 42 26 44 26 46" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={40} cy={46} r={2.2} fill="currentColor" opacity={0.5} />
      <circle cx={26} cy={46} r={2.2} fill="currentColor" opacity={0.5} />
    </svg>
  )
}

// --- Other (heart + crosshair) ---
export function IconOther(props: IconProps) {
  return (
    <svg {...defaults(props, '0 0 48 48')}>
      <path d="M24 42 C24 42 8 30 8 19 C8 12 12 7 17 7 C20 7 22.5 8.5 24 11 C25.5 8.5 28 7 31 7 C36 7 40 12 40 19 C40 30 24 42 24 42Z" fill="currentColor" opacity={0.06} stroke="currentColor" strokeWidth={1.2} />
      <circle cx={24} cy={22} r={5} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.4} />
      <circle cx={24} cy={22} r={1.5} fill="currentColor" opacity={0.3} />
    </svg>
  )
}

// --- Lookup by ThrombusPrimary key ---
export const THROMBUS_LOCATION_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  LV: IconLV,
  LA: IconLA,
  LAA: IconLAA,
  RV: IconRV,
  RA: IconRA,
  Aorta: IconAorta,
  PA: IconPA,
  Device: IconDevice,
  Other: IconOther,
}
