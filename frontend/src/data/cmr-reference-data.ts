/**
 * Cardiac MRI (CMR) normal reference values.
 *
 * Organised by anatomical section -> sub-section -> rows of parameters
 * with per-sex reference ranges (LL, Mean, UL, SD), direction indicators,
 * BSA indexing flags, and age band info.
 *
 * Sources:
 *  Petersen et al. JCMR 2017;19:51
 *  Kawel-Boehm et al. JCMR 2015;17:29
 */

export type CmrRangeValues = {
  ll: number | null
  mean: number
  ul: number | null
  sd: number
}

export type CmrReferenceRow = {
  parameter: string
  unit: string
  male: CmrRangeValues
  female: CmrRangeValues
  source: string
  /** 'high' | 'low' | 'both' | null — abnormal direction */
  direction: 'high' | 'low' | 'both' | null
  /** Whether parameter is BSA-indexed */
  bsa: boolean
  /** Age band this data applies to, e.g. 'Adult', '20-29' */
  ageBand: string
}

export type CmrSubSection = {
  title: string
  rows: CmrReferenceRow[]
}

export type CmrSection = {
  title: string
  subSections: CmrSubSection[]
}

export const CMR_REFERENCE_COLUMNS_EXPANDED = [
  'Parameter', '', 'Unit', 'LL', 'Mean', 'UL', 'SD', 'Band',
] as const

function r(mean: number, sd: number): CmrRangeValues {
  return {
    ll: Math.round((mean - 2 * sd) * 100) / 100,
    mean,
    ul: Math.round((mean + 2 * sd) * 100) / 100,
    sd,
  }
}

export const CMR_REFERENCE_DATA: CmrSection[] = [
  {
    title: 'Left Ventricle',
    subSections: [
      {
        title: 'LV Volumes',
        rows: [
          { parameter: 'LVEDV', unit: 'mL', male: r(150, 35), female: r(106, 22), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'LVEDVi', unit: 'mL/m\u00B2', male: r(78, 15), female: r(62, 11), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
          { parameter: 'LVESV', unit: 'mL', male: r(58, 18), female: r(37, 11), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'LVESVi', unit: 'mL/m\u00B2', male: r(30, 8), female: r(22, 6), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
          { parameter: 'LVSV', unit: 'mL', male: r(92, 21), female: r(69, 14), source: 'Petersen 2017', direction: 'both', bsa: false, ageBand: 'Adult' },
          { parameter: 'LVSVi', unit: 'mL/m\u00B2', male: r(48, 9), female: r(40, 7), source: 'Petersen 2017', direction: 'both', bsa: true, ageBand: 'Adult' },
        ],
      },
      {
        title: 'LV Function',
        rows: [
          { parameter: 'LVEF', unit: '%', male: r(62, 5), female: r(66, 5), source: 'Petersen 2017', direction: 'low', bsa: false, ageBand: 'Adult' },
          { parameter: 'LV CO', unit: 'L/min', male: r(5.9, 1.5), female: r(4.6, 1.1), source: 'Petersen 2017', direction: 'low', bsa: false, ageBand: 'Adult' },
          { parameter: 'LV CI', unit: 'L/min/m\u00B2', male: r(3.0, 0.7), female: r(2.7, 0.6), source: 'Petersen 2017', direction: 'low', bsa: true, ageBand: 'Adult' },
        ],
      },
      {
        title: 'LV Mass',
        rows: [
          { parameter: 'LV mass', unit: 'g', male: r(148, 33), female: r(108, 23), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'LV mass index', unit: 'g/m\u00B2', male: r(76, 14), female: r(63, 11), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
          { parameter: 'LV mass/EDV', unit: 'g/mL', male: r(1.01, 0.16), female: r(1.03, 0.16), source: 'Kawel-Boehm 2015', direction: 'high', bsa: false, ageBand: 'Adult' },
        ],
      },
      {
        title: 'LV Geometry',
        rows: [
          { parameter: 'IVSd', unit: 'mm', male: r(9.1, 1.6), female: r(7.7, 1.3), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'LVIDd', unit: 'mm', male: r(50.2, 4.6), female: r(45.0, 3.8), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'LVPWd', unit: 'mm', male: r(8.3, 1.6), female: r(7.0, 1.3), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
        ],
      },
    ],
  },
  {
    title: 'Right Ventricle',
    subSections: [
      {
        title: 'RV Volumes',
        rows: [
          { parameter: 'RVEDV', unit: 'mL', male: r(163, 37), female: r(112, 24), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'RVEDVi', unit: 'mL/m\u00B2', male: r(84, 16), female: r(66, 12), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
          { parameter: 'RVESV', unit: 'mL', male: r(68, 21), female: r(43, 13), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'RVESVi', unit: 'mL/m\u00B2', male: r(35, 10), female: r(25, 7), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
          { parameter: 'RVSV', unit: 'mL', male: r(95, 21), female: r(69, 14), source: 'Petersen 2017', direction: 'both', bsa: false, ageBand: 'Adult' },
          { parameter: 'RVSVi', unit: 'mL/m\u00B2', male: r(49, 9), female: r(41, 7), source: 'Petersen 2017', direction: 'both', bsa: true, ageBand: 'Adult' },
        ],
      },
      {
        title: 'RV Function',
        rows: [
          { parameter: 'RVEF', unit: '%', male: r(59, 6), female: r(63, 5), source: 'Petersen 2017', direction: 'low', bsa: false, ageBand: 'Adult' },
          { parameter: 'TAPSE', unit: 'mm', male: r(24, 3.5), female: r(23, 3.3), source: 'Kawel-Boehm 2015', direction: 'low', bsa: false, ageBand: 'Adult' },
        ],
      },
    ],
  },
  {
    title: 'Left Atrium',
    subSections: [
      {
        title: 'LA Volumes',
        rows: [
          { parameter: 'LA max vol', unit: 'mL', male: r(66, 20), female: r(52, 15), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'LA max vol index', unit: 'mL/m\u00B2', male: r(34, 9), female: r(31, 8), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
          { parameter: 'LA min vol', unit: 'mL', male: r(24, 10), female: r(18, 7), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'LA min vol index', unit: 'mL/m\u00B2', male: r(13, 5), female: r(10, 4), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
        ],
      },
      {
        title: 'LA Function',
        rows: [
          { parameter: 'LA EF', unit: '%', male: r(64, 8), female: r(66, 7), source: 'Petersen 2017', direction: 'low', bsa: false, ageBand: 'Adult' },
        ],
      },
    ],
  },
  {
    title: 'Right Atrium',
    subSections: [
      {
        title: 'RA Volumes',
        rows: [
          { parameter: 'RA max vol', unit: 'mL', male: r(72, 24), female: r(51, 16), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'RA max vol index', unit: 'mL/m\u00B2', male: r(37, 11), female: r(30, 9), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
          { parameter: 'RA min vol', unit: 'mL', male: r(32, 14), female: r(21, 9), source: 'Petersen 2017', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'RA min vol index', unit: 'mL/m\u00B2', male: r(16, 7), female: r(12, 5), source: 'Petersen 2017', direction: 'high', bsa: true, ageBand: 'Adult' },
        ],
      },
      {
        title: 'RA Function',
        rows: [
          { parameter: 'RA EF', unit: '%', male: r(56, 9), female: r(60, 8), source: 'Petersen 2017', direction: 'low', bsa: false, ageBand: 'Adult' },
        ],
      },
    ],
  },
  {
    title: 'Aorta',
    subSections: [
      {
        title: 'Aortic Dimensions',
        rows: [
          { parameter: 'Aortic root', unit: 'mm', male: r(34.0, 3.5), female: r(29.5, 3.0), source: 'Kawel-Boehm 2015', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'Ascending aorta', unit: 'mm', male: r(30.0, 3.6), female: r(27.0, 3.2), source: 'Kawel-Boehm 2015', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'Aortic arch', unit: 'mm', male: r(24.7, 2.9), female: r(22.1, 2.6), source: 'Kawel-Boehm 2015', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'Descending aorta', unit: 'mm', male: r(22.8, 2.5), female: r(20.7, 2.2), source: 'Kawel-Boehm 2015', direction: 'high', bsa: false, ageBand: 'Adult' },
        ],
      },
    ],
  },
  {
    title: 'Tissue Characterisation',
    subSections: [
      {
        title: 'Native T1 Values (1.5T)',
        rows: [
          { parameter: 'Myocardial T1', unit: 'ms', male: r(1030, 34), female: r(1053, 33), source: 'Kawel-Boehm 2015', direction: 'both', bsa: false, ageBand: 'Adult' },
          { parameter: 'Blood T1', unit: 'ms', male: r(1550, 100), female: r(1550, 100), source: 'Kawel-Boehm 2015', direction: null, bsa: false, ageBand: 'Adult' },
        ],
      },
      {
        title: 'Native T1 Values (3T)',
        rows: [
          { parameter: 'Myocardial T1', unit: 'ms', male: r(1159, 45), female: r(1181, 43), source: 'Kawel-Boehm 2015', direction: 'both', bsa: false, ageBand: 'Adult' },
          { parameter: 'Blood T1', unit: 'ms', male: r(1650, 100), female: r(1650, 100), source: 'Kawel-Boehm 2015', direction: null, bsa: false, ageBand: 'Adult' },
        ],
      },
      {
        title: 'T2 Values',
        rows: [
          { parameter: 'Myocardial T2 (1.5T)', unit: 'ms', male: r(52, 3), female: r(53, 3), source: 'Kawel-Boehm 2015', direction: 'both', bsa: false, ageBand: 'Adult' },
          { parameter: 'Myocardial T2 (3T)', unit: 'ms', male: r(45, 3), female: r(46, 3), source: 'Kawel-Boehm 2015', direction: 'both', bsa: false, ageBand: 'Adult' },
        ],
      },
      {
        title: 'ECV',
        rows: [
          { parameter: 'ECV (1.5T)', unit: '%', male: r(25.3, 3.5), female: r(27.1, 3.2), source: 'Kawel-Boehm 2015', direction: 'high', bsa: false, ageBand: 'Adult' },
          { parameter: 'ECV (3T)', unit: '%', male: r(25.8, 3.0), female: r(27.5, 2.9), source: 'Kawel-Boehm 2015', direction: 'high', bsa: false, ageBand: 'Adult' },
        ],
      },
    ],
  },
]
