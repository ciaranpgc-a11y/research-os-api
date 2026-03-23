// =============================================================================
// Synthetic CVI42-style CMR report generator
// Generates a realistic structured report with values for all 162 parameters,
// adjusted according to one of 7 pathology profiles.
// =============================================================================

type PathologyProfile =
  | 'normal'
  | 'ischaemic_cardiomyopathy'
  | 'dilated_cardiomyopathy'
  | 'hypertrophic_cardiomyopathy'
  | 'severe_aortic_stenosis'
  | 'pulmonary_hypertension'
  | 'myocarditis';

const PATHOLOGY_LABELS: Record<PathologyProfile, string> = {
  normal: 'Normal study',
  ischaemic_cardiomyopathy: 'Ischaemic cardiomyopathy',
  dilated_cardiomyopathy: 'Dilated cardiomyopathy',
  hypertrophic_cardiomyopathy: 'Hypertrophic cardiomyopathy',
  severe_aortic_stenosis: 'Severe aortic stenosis',
  pulmonary_hypertension: 'Pulmonary hypertension',
  myocarditis: 'Myocarditis',
};

const ALL_PROFILES: PathologyProfile[] = Object.keys(PATHOLOGY_LABELS) as PathologyProfile[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeded-optional random with gaussian approximation (Box-Muller) */
function gaussRandom(mean: number, sd: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * sd;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function roundTo(val: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(val * f) / f;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Reference range lookup helpers
// ---------------------------------------------------------------------------

interface RefRange {
  parameter: string;
  sex: string;
  unit: string;
  indexing: string;
  age_band: string;
  age_min: number;
  age_max: number;
  ll: number | null;
  mean: number | null;
  ul: number | null;
  sd: number | null;
  abnormal_direction?: string;
}

interface OutputParam {
  parameter: string;
  unit: string;
  indexing: string;
  major_section: string;
  sub_section: string | null;
  decimal_places: number;
  separator_before?: boolean;
  nested_under?: string;
  [k: string]: unknown;
}

function findRefRange(
  refRanges: RefRange[],
  paramName: string,
  sex: string,
  age: number,
): RefRange | null {
  const matches = refRanges.filter(
    (r) =>
      r !== null &&
      r.parameter === paramName &&
      r.sex === sex &&
      age >= r.age_min &&
      age <= r.age_max,
  );
  return matches.length > 0 ? matches[0] : null;
}

function findAnyRefRange(refRanges: RefRange[], paramName: string): RefRange | null {
  const match = refRanges.find((r) => r !== null && r.parameter === paramName && r.mean !== null);
  return match ?? null;
}

// ---------------------------------------------------------------------------
// Pathology-specific parameter overrides
// Each override specifies either { mean, sd } to generate from, or
// { factor } to multiply the normal mean by, or { value } for exact.
// ---------------------------------------------------------------------------

interface ParamOverride {
  mean?: number;
  sd?: number;
  factor?: number;
  value?: number;
  minVal?: number;
  maxVal?: number;
}

type ProfileOverrides = Partial<Record<string, ParamOverride>>;

function getProfileOverrides(profile: PathologyProfile): ProfileOverrides {
  switch (profile) {
    // -----------------------------------------------------------------------
    case 'normal':
      return {};

    // -----------------------------------------------------------------------
    case 'ischaemic_cardiomyopathy':
      return {
        // Severely impaired LV
        'LV EF': { mean: 27, sd: 3, minVal: 20, maxVal: 35 },
        'LV EDV': { factor: 1.5 },
        'LV EDV (i)': { factor: 1.5 },
        'LV ESV': { factor: 2.2 },
        'LV ESV (i)': { factor: 2.2 },
        'LV ED diameter (4ch)': { factor: 1.25 },
        'LV ED diameter (4ch) (i)': { factor: 1.25 },
        'LV ED diameter (sax)': { factor: 1.25 },
        'LV ED diameter (sax) (i)': { factor: 1.25 },
        'LV ES diameter (4ch)': { factor: 1.4 },
        'LV ES diameter (4ch) (i)': { factor: 1.4 },
        'LV ES diameter (sax)': { factor: 1.4 },
        'LV SV': { factor: 0.65 },
        'LV SV (i)': { factor: 0.65 },
        'LV CO': { factor: 0.7 },
        'LV CI': { factor: 0.7 },
        'LV mass': { factor: 1.3 },
        'LV mass (i)': { factor: 1.3 },
        'LV mass / LV EDV': { factor: 0.85 },
        MAPSE: { mean: 8, sd: 2 },
        'MAPSE anterior': { mean: 8, sd: 2 },
        'MAPSE septal': { mean: 6, sd: 2 },
        'MAPSE inferior': { mean: 7, sd: 2 },
        'MAPSE lateral': { mean: 9, sd: 2 },
        // Moderate MR
        'MR volume (per heartbeat)': { mean: 25, sd: 8, minVal: 10 },
        'MR regurgitant fraction': { mean: 25, sd: 8, minVal: 10, maxVal: 45 },
        // Mild TR
        'TR volume (per heartbeat)': { mean: 8, sd: 4, minVal: 2 },
        'TR regurgitant fraction': { mean: 12, sd: 5, minVal: 2, maxVal: 25 },
        // Mildly dilated LA
        'LA max volume': { factor: 1.3 },
        'LA max volume (i)': { factor: 1.3 },
        'LA min volume': { factor: 1.5 },
        'LA min volume (i)': { factor: 1.5 },
        'LA EF': { mean: 45, sd: 8 },
        // Elevated T1/ECV, normal T2
        'Native T1': { mean: 1080, sd: 30 },
        ECV: { mean: 35, sd: 3, minVal: 30 },
        'Post-contrast T1': { mean: 380, sd: 30 },
        'Native T2': { mean: 50, sd: 3 },
        // Elevated PCWP
        PCWP: { mean: 16, sd: 3, minVal: 12 },
      };

    // -----------------------------------------------------------------------
    case 'dilated_cardiomyopathy':
      return {
        'LV EF': { mean: 24, sd: 4, minVal: 15, maxVal: 32 },
        'LV EDV': { factor: 1.8 },
        'LV EDV (i)': { factor: 1.8 },
        'LV ESV': { factor: 2.8 },
        'LV ESV (i)': { factor: 2.8 },
        'LV ED diameter (4ch)': { factor: 1.35 },
        'LV ED diameter (4ch) (i)': { factor: 1.35 },
        'LV ED diameter (sax)': { factor: 1.35 },
        'LV ED diameter (sax) (i)': { factor: 1.35 },
        'LV ES diameter (4ch)': { factor: 1.55 },
        'LV ES diameter (4ch) (i)': { factor: 1.55 },
        'LV ES diameter (sax)': { factor: 1.55 },
        'LV SV': { factor: 0.6 },
        'LV SV (i)': { factor: 0.6 },
        'LV CO': { factor: 0.6 },
        'LV CI': { factor: 0.6 },
        'LV mass': { factor: 1.2 },
        'LV mass (i)': { factor: 1.2 },
        'LV mass / LV EDV': { factor: 0.7 },
        MAPSE: { mean: 7, sd: 2 },
        'MAPSE anterior': { mean: 7, sd: 2 },
        'MAPSE septal': { mean: 5, sd: 2 },
        'MAPSE inferior': { mean: 6, sd: 2 },
        'MAPSE lateral': { mean: 8, sd: 2 },
        // Mild-moderate MR
        'MR volume (per heartbeat)': { mean: 20, sd: 10, minVal: 5 },
        'MR regurgitant fraction': { mean: 20, sd: 8, minVal: 5, maxVal: 40 },
        // Mild-moderate TR
        'TR volume (per heartbeat)': { mean: 15, sd: 6, minVal: 3 },
        'TR regurgitant fraction': { mean: 18, sd: 7, minVal: 3, maxVal: 40 },
        // Dilated LA and RA
        'LA max volume': { factor: 1.5 },
        'LA max volume (i)': { factor: 1.5 },
        'LA min volume': { factor: 1.8 },
        'LA min volume (i)': { factor: 1.8 },
        'LA EF': { mean: 38, sd: 8 },
        'RA max volume': { factor: 1.4 },
        'RA max volume (i)': { factor: 1.4 },
        'RA min volume': { factor: 1.6 },
        'RA min volume (i)': { factor: 1.6 },
        'RA EF': { mean: 38, sd: 8 },
        // Elevated T1/ECV (mid-wall LGE pattern)
        'Native T1': { mean: 1100, sd: 35 },
        ECV: { mean: 37, sd: 3, minVal: 32 },
        'Post-contrast T1': { mean: 360, sd: 25 },
        // RV may be mildly impaired
        'RV EF': { mean: 45, sd: 6 },
        'RV EDV': { factor: 1.2 },
        'RV EDV (i)': { factor: 1.2 },
        PCWP: { mean: 18, sd: 3, minVal: 14 },
      };

    // -----------------------------------------------------------------------
    case 'hypertrophic_cardiomyopathy':
      return {
        'LV EF': { mean: 60, sd: 5, minVal: 50, maxVal: 72 },
        // Small LV cavity
        'LV EDV': { factor: 0.85 },
        'LV EDV (i)': { factor: 0.85 },
        'LV ESV': { factor: 0.7 },
        'LV ESV (i)': { factor: 0.7 },
        'LV ED diameter (4ch)': { factor: 0.9 },
        'LV ED diameter (sax)': { factor: 0.9 },
        // Increased wall thickness and mass
        'LV peak wall thickness': { mean: 18, sd: 3, minVal: 15 },
        'LV mass': { factor: 1.6 },
        'LV mass (i)': { factor: 1.6 },
        'LV mass / LV EDV': { factor: 1.9 },
        // Enlarged LA
        'LA max volume': { factor: 1.4 },
        'LA max volume (i)': { factor: 1.4 },
        'LA min volume': { factor: 1.5 },
        'LA min volume (i)': { factor: 1.5 },
        // Dynamic LVOT obstruction - high AV velocity
        'AV maximum velocity': { mean: 2.5, sd: 0.5, minVal: 1.8 },
        'AV maximum pressure gradient': { mean: 25, sd: 10, minVal: 12 },
        'AV mean pressure gradient': { mean: 12, sd: 5, minVal: 5 },
        // Mild MR
        'MR volume (per heartbeat)': { mean: 10, sd: 5, minVal: 2 },
        'MR regurgitant fraction': { mean: 12, sd: 5, minVal: 2, maxVal: 25 },
        // Elevated T1
        'Native T1': { mean: 1060, sd: 30 },
        ECV: { mean: 32, sd: 3 },
        'Post-contrast T1': { mean: 400, sd: 30 },
        MAPSE: { mean: 12, sd: 2 },
      };

    // -----------------------------------------------------------------------
    case 'severe_aortic_stenosis':
      return {
        // Mildly impaired EF
        'LV EF': { mean: 47, sd: 3, minVal: 40, maxVal: 55 },
        // Moderate LVH
        'LV mass': { factor: 1.45 },
        'LV mass (i)': { factor: 1.45 },
        'LV peak wall thickness': { mean: 14, sd: 2, minVal: 12 },
        'LV mass / LV EDV': { factor: 1.4 },
        'LV EDV': { factor: 1.1 },
        'LV EDV (i)': { factor: 1.1 },
        'LV ESV': { factor: 1.35 },
        'LV ESV (i)': { factor: 1.35 },
        // High AV peak velocity and gradients
        'AV maximum velocity': { mean: 4.5, sd: 0.4, minVal: 4.0 },
        'AV maximum pressure gradient': { mean: 82, sd: 10, minVal: 64 },
        'AV mean pressure gradient': { mean: 48, sd: 8, minVal: 40 },
        // Mild AR
        'AV backward flow (per heartbeat)': { mean: 8, sd: 4, minVal: 2 },
        'AV regurgitant fraction': { mean: 12, sd: 5, minVal: 2, maxVal: 25 },
        // Dilated ascending aorta
        'Asc aorta diameter': { mean: 40, sd: 3, minVal: 36 },
        'Asc aorta diameter (i)': { mean: 21, sd: 2, minVal: 18 },
        'Aortic sinus diameter': { mean: 38, sd: 3 },
        // Mildly dilated LA
        'LA max volume': { factor: 1.2 },
        'LA max volume (i)': { factor: 1.2 },
        MAPSE: { mean: 10, sd: 2 },
        'LV SV': { factor: 0.8 },
        'LV SV (i)': { factor: 0.8 },
        PCWP: { mean: 14, sd: 3, minVal: 10 },
      };

    // -----------------------------------------------------------------------
    case 'pulmonary_hypertension':
      return {
        // Dilated RV, impaired RV EF
        'RV EF': { mean: 32, sd: 3, minVal: 25, maxVal: 40 },
        'RV EDV': { factor: 1.7 },
        'RV EDV (i)': { factor: 1.7 },
        'RV ESV': { factor: 2.3 },
        'RV ESV (i)': { factor: 2.3 },
        'RV mass': { factor: 1.5 },
        'RV mass (i)': { factor: 1.5 },
        'RV basal diameter': { factor: 1.35 },
        'RV basal diameter (i)': { factor: 1.35 },
        'RV SV': { factor: 0.7 },
        'RV SV (i)': { factor: 0.7 },
        TAPSE: { mean: 14, sd: 2 },
        // Dilated RA
        'RA max volume': { factor: 1.6 },
        'RA max volume (i)': { factor: 1.6 },
        'RA min volume': { factor: 1.8 },
        'RA min volume (i)': { factor: 1.8 },
        'RA EF': { mean: 35, sd: 6 },
        // Dilated MPA
        'MPA systolic diameter': { mean: 35, sd: 3, minVal: 30 },
        'MPA diastolic diameter': { mean: 32, sd: 3, minVal: 28 },
        'MPA systolic area': { factor: 1.5 },
        'MPA diastolic area': { factor: 1.5 },
        'MPA distension': { factor: 0.5 },
        // Moderate-severe TR
        'TR volume (per heartbeat)': { mean: 30, sd: 10, minVal: 15 },
        'TR regurgitant fraction': { mean: 35, sd: 10, minVal: 20, maxVal: 55 },
        // Preserved LV
        'LV EF': { mean: 62, sd: 5, minVal: 52, maxVal: 72 },
        // D-shaped septum signs (reduced LV diameters in sax)
        'LV ED diameter (sax)': { factor: 0.88 },
        'LV ES diameter (sax)': { factor: 0.85 },
        // Elevated PV velocities
        'PV maximum velocity': { mean: 1.2, sd: 0.3 },
        'PV regurgitant fraction': { mean: 15, sd: 5 },
        PCWP: { mean: 10, sd: 2 },
      };

    // -----------------------------------------------------------------------
    case 'myocarditis':
      return {
        // Preserved LV EF (mildly reduced)
        'LV EF': { mean: 52, sd: 3, minVal: 45, maxVal: 58 },
        // Normal-ish volumes
        'LV EDV': { factor: 1.05 },
        'LV ESV': { factor: 1.15 },
        // Elevated T1, T2, ECV
        'Native T1': { mean: 1120, sd: 35 },
        ECV: { mean: 38, sd: 3, minVal: 33 },
        'Post-contrast T1': { mean: 340, sd: 25 },
        'Native T2': { mean: 58, sd: 4, minVal: 52 },
        // Mild pericardial effusion markers (not a direct param, but adjust PCWP slightly)
        PCWP: { mean: 10, sd: 2 },
        // Mildly impaired MAPSE
        MAPSE: { mean: 12, sd: 2 },
      };
  }
}

// ---------------------------------------------------------------------------
// BSA and demographics generation
// ---------------------------------------------------------------------------

interface Demographics {
  sex: 'Male' | 'Female';
  age: number;
  height: number; // cm
  weight: number; // kg
  bsa: number; // m^2
  hr: number; // beats per minute
}

function generateDemographics(): Demographics {
  const sex: 'Male' | 'Female' = Math.random() > 0.5 ? 'Male' : 'Female';
  const age = Math.floor(clamp(gaussRandom(55, 12), 25, 85));
  const height =
    sex === 'Male'
      ? Math.round(clamp(gaussRandom(177, 7), 155, 200))
      : Math.round(clamp(gaussRandom(164, 6), 148, 185));
  const weight =
    sex === 'Male'
      ? Math.round(clamp(gaussRandom(82, 12), 55, 130))
      : Math.round(clamp(gaussRandom(68, 11), 45, 120));
  // Mosteller BSA
  const bsa = Math.sqrt((height * weight) / 3600);
  const hr = Math.round(clamp(gaussRandom(70, 10), 50, 100));
  return { sex, age, height, weight, bsa: roundTo(bsa, 2), hr };
}

// ---------------------------------------------------------------------------
// Value generation for a single parameter
// ---------------------------------------------------------------------------

function generateValue(
  paramName: string,
  paramMeta: OutputParam,
  refRanges: RefRange[],
  demographics: Demographics,
  overrides: ProfileOverrides,
  _generatedValues: Record<string, number>,
): number {
  const override = overrides[paramName];
  const ref =
    findRefRange(refRanges, paramName, demographics.sex, demographics.age) ??
    findAnyRefRange(refRanges, paramName);

  let value: number;

  if (override) {
    if (override.value !== undefined) {
      return override.value;
    }
    if (override.mean !== undefined && override.sd !== undefined) {
      value = gaussRandom(override.mean, override.sd);
    } else if (override.factor !== undefined && ref && ref.mean !== null && ref.sd !== null) {
      value = gaussRandom(ref.mean * override.factor, ref.sd * 0.6);
    } else if (ref && ref.mean !== null && ref.sd !== null) {
      value = gaussRandom(ref.mean, ref.sd);
    } else {
      value = 0;
    }
    if (override.minVal !== undefined) value = Math.max(value, override.minVal);
    if (override.maxVal !== undefined) value = Math.min(value, override.maxVal);
  } else if (ref && ref.mean !== null && ref.sd !== null) {
    // Normal generation: mean +/- 0.6*SD to stay close to normal range
    value = gaussRandom(ref.mean, ref.sd * 0.6);
    // Clamp within plausible bounds
    if (ref.ll !== null && ref.ul !== null) {
      const range = ref.ul - ref.ll;
      value = clamp(value, ref.ll - range * 0.15, ref.ul + range * 0.15);
    }
  } else {
    value = 0;
  }

  // Ensure non-negative for most params (except possibly some like distensibility, which can be near-zero)
  if (!paramName.includes('distens') && !paramName.includes('PCWP')) {
    value = Math.max(0, value);
  }

  return roundTo(value, paramMeta.decimal_places);
}

// ---------------------------------------------------------------------------
// Enforce physiological consistency
// ---------------------------------------------------------------------------

function enforceConsistency(
  vals: Record<string, number>,
  outputParams: Record<string, OutputParam>,
  demographics: Demographics,
): void {
  const bsa = demographics.bsa;
  const hr = demographics.hr;

  // LV volumes -> EF/SV consistency
  if (vals['LV EDV'] !== undefined && vals['LV EF'] !== undefined) {
    const ef = vals['LV EF'] / 100;
    vals['LV ESV'] = roundTo(vals['LV EDV'] * (1 - ef), 0);
    vals['LV SV'] = roundTo(vals['LV EDV'] - vals['LV ESV'], 0);
    vals['LV CO'] = roundTo((vals['LV SV'] * hr) / 1000, 1);
  }

  // RV volumes -> EF/SV consistency
  if (vals['RV EDV'] !== undefined && vals['RV EF'] !== undefined) {
    const ef = vals['RV EF'] / 100;
    vals['RV ESV'] = roundTo(vals['RV EDV'] * (1 - ef), 0);
    vals['RV SV'] = roundTo(vals['RV EDV'] - vals['RV ESV'], 0);
    vals['RV CO'] = roundTo((vals['RV SV'] * hr) / 1000, 1);
  }

  // LA volumes -> EF/SV
  if (vals['LA max volume'] !== undefined && vals['LA min volume'] !== undefined) {
    const laSv = vals['LA max volume'] - vals['LA min volume'];
    vals['LA SV'] = roundTo(Math.max(laSv, 1), 0);
    vals['LA EF'] = roundTo(
      vals['LA max volume'] > 0 ? (vals['LA SV'] / vals['LA max volume']) * 100 : 50,
      0,
    );
  }

  // RA volumes -> EF/SV
  if (vals['RA max volume'] !== undefined && vals['RA min volume'] !== undefined) {
    const raSv = vals['RA max volume'] - vals['RA min volume'];
    vals['RA SV'] = roundTo(Math.max(raSv, 1), 0);
    vals['RA EF'] = roundTo(
      vals['RA max volume'] > 0 ? (vals['RA SV'] / vals['RA max volume']) * 100 : 50,
      0,
    );
  }

  // LV mass/EDV ratio
  if (vals['LV mass'] !== undefined && vals['LV EDV'] !== undefined && vals['LV EDV'] > 0) {
    vals['LV mass / LV EDV'] = roundTo(vals['LV mass'] / vals['LV EDV'], 1);
  }

  // CO -> CI
  if (vals['LV CO'] !== undefined) vals['LV CI'] = roundTo(vals['LV CO'] / bsa, 1);
  if (vals['RV CO'] !== undefined) vals['RV CI'] = roundTo(vals['RV CO'] / bsa, 1);

  // MAPSE average
  const mapseComponents = ['MAPSE anterior', 'MAPSE septal', 'MAPSE inferior', 'MAPSE lateral'];
  const mapseVals = mapseComponents.map((k) => vals[k]).filter((v) => v !== undefined);
  if (mapseVals.length === 4) {
    vals['MAPSE'] = roundTo(mapseVals.reduce((a, b) => a + b, 0) / 4, 1);
  }

  // AV forward flow consistency
  if (vals['LV SV'] !== undefined) {
    const avBackflow = vals['AV backward flow (per heartbeat)'] ?? 0;
    vals['AV forward flow (per heartbeat)'] = roundTo(vals['LV SV'] + avBackflow, 1);
    vals['AV forward flow (per minute)'] = roundTo(
      (vals['AV forward flow (per heartbeat)'] * hr) / 1000,
      1,
    );
    vals['AV effective forward flow (per heartbeat)'] = roundTo(vals['LV SV'], 0);
    vals['AV effective forward flow (per minute)'] = roundTo((vals['LV SV'] * hr) / 1000, 1);
    if (vals['AV forward flow (per heartbeat)'] > 0) {
      vals['AV regurgitant fraction'] = roundTo(
        (avBackflow / vals['AV forward flow (per heartbeat)']) * 100,
        1,
      );
    }
  }

  // AV pressure from velocity: PG = 4 * V^2
  if (vals['AV maximum velocity'] !== undefined) {
    vals['AV maximum pressure gradient'] = roundTo(4 * vals['AV maximum velocity'] ** 2, 1);
    vals['AV mean pressure gradient'] = roundTo(vals['AV maximum pressure gradient'] * 0.58, 0);
  }

  // PV forward flow consistency
  if (vals['RV SV'] !== undefined) {
    const pvBackflow = vals['PV backward flow (per heartbeat)'] ?? 0;
    vals['PV forward flow (per heartbeat)'] = roundTo(vals['RV SV'] + pvBackflow, 0);
    vals['PV forward flow (per minute)'] = roundTo(
      (vals['PV forward flow (per heartbeat)'] * hr) / 1000,
      1,
    );
    vals['PV effective forward flow (per heartbeat)'] = roundTo(vals['RV SV'], 0);
    vals['PV effective forward flow (per minute)'] = roundTo((vals['RV SV'] * hr) / 1000, 1);
    if (vals['PV forward flow (per heartbeat)'] > 0) {
      vals['PV regurgitant fraction'] = roundTo(
        (pvBackflow / vals['PV forward flow (per heartbeat)']) * 100,
        0,
      );
    }
  }

  // PV pressure from velocity
  if (vals['PV maximum velocity'] !== undefined) {
    vals['PV maximum pressure gradient'] = roundTo(4 * vals['PV maximum velocity'] ** 2, 1);
    vals['PV mean pressure gradient'] = roundTo(vals['PV maximum pressure gradient'] * 0.55, 0);
  }

  // MR regurgitant fraction consistency
  if (
    vals['MR volume (per heartbeat)'] !== undefined &&
    vals['LV SV'] !== undefined &&
    vals['LV SV'] > 0
  ) {
    const totalLvOutput = vals['LV SV'] + vals['MR volume (per heartbeat)'];
    vals['MR regurgitant fraction'] = roundTo(
      (vals['MR volume (per heartbeat)'] / totalLvOutput) * 100,
      0,
    );
  }

  // TR regurgitant fraction consistency
  if (
    vals['TR volume (per heartbeat)'] !== undefined &&
    vals['RV SV'] !== undefined &&
    vals['RV SV'] > 0
  ) {
    const totalRvOutput = vals['RV SV'] + vals['TR volume (per heartbeat)'];
    vals['TR regurgitant fraction'] = roundTo(
      (vals['TR volume (per heartbeat)'] / totalRvOutput) * 100,
      0,
    );
  }

  // PA areas from diameters (area = pi * (d/2)^2, convert mm -> cm)
  const paAreaFromDiameter = (diamKey: string, areaKey: string) => {
    if (vals[diamKey] !== undefined) {
      const rCm = vals[diamKey] / 20; // mm to cm radius
      vals[areaKey] = roundTo(Math.PI * rCm * rCm, 1);
    }
  };
  paAreaFromDiameter('MPA systolic diameter', 'MPA systolic area');
  paAreaFromDiameter('MPA diastolic diameter', 'MPA diastolic area');
  paAreaFromDiameter('RPA systolic diameter', 'RPA systolic area');
  paAreaFromDiameter('RPA diastolic diameter', 'RPA diastolic area');
  paAreaFromDiameter('LPA systolic diameter', 'LPA systolic area');
  paAreaFromDiameter('LPA diastolic diameter', 'LPA diastolic area');

  // Distension = (systolic - diastolic) / diastolic * 100
  const calcDistension = (sysKey: string, diaKey: string, distKey: string) => {
    if (vals[sysKey] !== undefined && vals[diaKey] !== undefined && vals[diaKey] > 0) {
      vals[distKey] = roundTo(((vals[sysKey] - vals[diaKey]) / vals[diaKey]) * 100, 1);
    }
  };
  calcDistension('MPA systolic area', 'MPA diastolic area', 'MPA distension');
  calcDistension('RPA systolic area', 'RPA diastolic area', 'RPA distension');
  calcDistension('LPA systolic area', 'LPA diastolic area', 'LPA distension');

  // Aortic sinus area from diameter
  if (vals['Aortic sinus diameter'] !== undefined) {
    const rCm = vals['Aortic sinus diameter'] / 20;
    vals['Aortic sinus area'] = roundTo(Math.PI * rCm * rCm, 1);
  }

  // BSA-indexed values for all params that have indexing=BSA
  for (const [key, meta] of Object.entries(outputParams)) {
    if (meta.indexing === 'BSA' && key.includes('(i)')) {
      const baseKey = key.replace(' (i)', '').replace('(i)', '').trim();
      // Find the actual base key that exists
      const actualBase = Object.keys(vals).find(
        (k) => k === baseKey || k === key.replace(' (i)', ''),
      );
      if (actualBase && vals[actualBase] !== undefined && bsa > 0) {
        vals[key] = roundTo(vals[actualBase] / bsa, meta.decimal_places);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report text formatting (CVI42-style tab-separated with section headers)
// ---------------------------------------------------------------------------

function formatReportText(
  vals: Record<string, number>,
  outputParams: Record<string, OutputParam>,
  demographics: Demographics,
  pathologyLabel: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push('CMR REPORT');
  lines.push('==========');
  lines.push('');
  lines.push('PATIENT DEMOGRAPHICS');
  lines.push('--------------------');
  lines.push(`Sex\t${demographics.sex}`);
  lines.push(`Age\t${demographics.age} years`);
  lines.push(`Height\t${demographics.height} cm`);
  lines.push(`Weight\t${demographics.weight} kg`);
  lines.push(`BSA\t${demographics.bsa} m\u00B2`);
  lines.push(`Heart rate\t${demographics.hr} bpm`);
  lines.push('');

  // Group params by major_section then sub_section in order
  let currentMajor = '';
  let currentSub = '';

  const paramKeys = Object.keys(outputParams);

  for (const key of paramKeys) {
    const meta = outputParams[key];
    const major = meta.major_section;
    const sub = meta.sub_section ?? '';

    // Major section header
    if (major !== currentMajor) {
      currentMajor = major;
      currentSub = '';
      lines.push(major.toUpperCase());
      lines.push('-'.repeat(major.length));
    }

    // Sub section header
    if (sub !== currentSub) {
      currentSub = sub;
      if (sub) {
        lines.push(`  ${sub}`);
      }
    }

    // Value line
    const value = vals[key];
    const displayValue = value !== undefined ? String(value) : '';
    const unit = meta.unit || '';
    lines.push(`${key}\t${displayValue}\t${unit}`);
  }

  lines.push('');
  lines.push('---');
  lines.push(`Generated pathology profile: ${pathologyLabel}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateSyntheticReport(
  outputParams: Record<string, OutputParam>,
  refRanges: RefRange[],
  requestedProfile?: PathologyProfile,
): { text: string; pathology: string } {
  // Pick a profile
  const profile: PathologyProfile = requestedProfile ?? pickRandom(ALL_PROFILES);
  const pathologyLabel = PATHOLOGY_LABELS[profile];
  const overrides = getProfileOverrides(profile);
  const demographics = generateDemographics();

  // Generate initial values for every parameter
  const vals: Record<string, number> = {};
  const paramKeys = Object.keys(outputParams);

  for (const key of paramKeys) {
    const meta = outputParams[key];
    vals[key] = generateValue(key, meta, refRanges, demographics, overrides, vals);
  }

  // Enforce physiological consistency (recalculates derived values)
  enforceConsistency(vals, outputParams, demographics);

  // Format the report text
  const text = formatReportText(vals, outputParams, demographics, pathologyLabel);

  return { text, pathology: pathologyLabel };
}

// ---------------------------------------------------------------------------
// Convenience wrapper — loads reference data inline (for use from UI)
// ---------------------------------------------------------------------------

import refData from '@/data/cmr_reference_data.json'

/** Generate a synthetic report using the embedded reference data. */
export function generateSyntheticReportAuto(profile?: PathologyProfile): { text: string; pathology: string } {
  const outputParams = refData.output_params as unknown as Record<string, OutputParam>
  const refRanges = Object.values(refData.ref_ranges) as unknown as RefRange[]
  return generateSyntheticReport(outputParams, refRanges, profile)
}

export type { PathologyProfile, Demographics, OutputParam, RefRange };
export { ALL_PROFILES, PATHOLOGY_LABELS };
