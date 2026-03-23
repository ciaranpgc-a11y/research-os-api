import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DATA_FILE = path.resolve(__dirname, 'src/data/cmr_reference_data.json')
const DEFAULT_DEV_API_PROXY_TARGET = 'http://127.0.0.1:8000'

function resolveDevApiProxyTarget() {
  const raw = (
    process.env.VITE_API_PROXY_TARGET
    || process.env.VITE_API_BASE_URL
    || DEFAULT_DEV_API_PROXY_TARGET
  ).trim()
  if (!raw) return DEFAULT_DEV_API_PROXY_TARGET

  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`http://${raw}`)
    url.pathname = url.pathname.replace(/\/v1\/?$/i, '/')
    return url.toString().replace(/\/+$/, '')
  } catch {
    return DEFAULT_DEV_API_PROXY_TARGET
  }
}

function readJson() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
}

function writeJson(data: unknown) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
  })
}

function jsonRes(res: ServerResponse, data: unknown, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/** Dev-only middleware that lets the frontend write back to cmr_reference_data.json */
function cmrDevApi(): Plugin {
  return {
    name: 'cmr-dev-api',
    configureServer(server) {
      // Register specific routes BEFORE the catch-all
      // Order matters: more specific paths first

      // PUT /api/cmr-data/ranges → update specific ref_ranges
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-data/ranges' || req.method !== 'PUT') return next()

        try {
          const body = JSON.parse(await readBody(req))
          const updates = body.updates as Array<{
            parameter: string; sex: string; age_band: string
            ll?: number | null; mean?: number | null; ul?: number | null; sd?: number | null
            ll_mass?: number | null; mean_mass?: number | null; ul_mass?: number | null; sd_mass?: number | null
          }>

          const data = readJson()
          let updated = 0

          for (const u of updates) {
            const range = data.ref_ranges.find(
              (r: Record<string, unknown>) =>
                r.parameter === u.parameter && r.sex === u.sex && r.age_band === u.age_band,
            )
            if (range) {
              if (u.ll !== undefined) range.ll = u.ll
              if (u.mean !== undefined) range.mean = u.mean
              if (u.ul !== undefined) range.ul = u.ul
              if (u.sd !== undefined) range.sd = u.sd
              if (u.ll_mass !== undefined) range.ll_mass = u.ll_mass
              if (u.mean_mass !== undefined) range.mean_mass = u.mean_mass
              if (u.ul_mass !== undefined) range.ul_mass = u.ul_mass
              if (u.sd_mass !== undefined) range.sd_mass = u.sd_mass
              updated++
            }
          }

          writeJson(data)
          jsonRes(res, { updated })
        } catch (e) {
          jsonRes(res, { error: String(e) }, 400)
        }
      })

      // PUT /api/cmr-data/param-meta → update parameter metadata
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-data/param-meta' || req.method !== 'PUT') return next()

        try {
          const { parameter_key, unit, indexing, abnormal_direction, major_section, sub_section, pap_affected, sources,
            severity_label, severity_thresholds, severity_label_override, nested_under, decimal_places } =
            JSON.parse(await readBody(req))

          const data = readJson()

          // Update output_params
          if (data.output_params[parameter_key]) {
            if (unit !== undefined) data.output_params[parameter_key].unit = unit
            if (indexing !== undefined) data.output_params[parameter_key].indexing = indexing
            if (major_section !== undefined) data.output_params[parameter_key].major_section = major_section
            if (sub_section !== undefined) data.output_params[parameter_key].sub_section = sub_section
            if (pap_affected !== undefined) data.output_params[parameter_key].pap_affected = pap_affected
            if (sources !== undefined) data.output_params[parameter_key].sources = sources
            if (severity_label !== undefined) data.output_params[parameter_key].severity_label = severity_label
            if (severity_thresholds !== undefined) data.output_params[parameter_key].severity_thresholds = severity_thresholds
            if (severity_label_override !== undefined) data.output_params[parameter_key].severity_label_override = severity_label_override
            if (nested_under !== undefined) {
              if (nested_under) {
                data.output_params[parameter_key].nested_under = nested_under
              } else {
                delete data.output_params[parameter_key].nested_under
              }
            }
            if (decimal_places !== undefined) {
              if (decimal_places !== null && decimal_places >= 0) {
                data.output_params[parameter_key].decimal_places = decimal_places
              } else {
                delete data.output_params[parameter_key].decimal_places
              }
            }
          }

          // Update fields that are duplicated in ref_ranges
          for (const r of data.ref_ranges) {
            if (r.parameter === parameter_key) {
              if (unit !== undefined) r.unit = unit
              if (indexing !== undefined) r.indexing = indexing
              if (abnormal_direction !== undefined) r.abnormal_direction = abnormal_direction
            }
          }

          writeJson(data)
          jsonRes(res, { ok: true })
        } catch (e) {
          jsonRes(res, { error: String(e) }, 400)
        }
      })

      // PUT /api/cmr-data/sections → update sections config
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-data/sections' || req.method !== 'PUT') return next()

        try {
          const sections = JSON.parse(await readBody(req))
          const data = readJson()
          data.sections = sections
          writeJson(data)
          jsonRes(res, { ok: true })
        } catch (e) {
          jsonRes(res, { error: String(e) }, 400)
        }
      })

      // POST /api/cmr-extract → LLM extraction from report text
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-extract' || req.method !== 'POST') return next()

        try {
          const { report_text } = JSON.parse(await readBody(req))
          const data = readJson()

          // Build canonical parameter list with aliases
          const params = Object.entries(data.output_params as Record<string, { parameter: string; unit: string; indexing: string }>)
            .map(([name, p]) => ({ name, unit: p.unit, indexed: p.indexing === 'BSA' }))
          const aliases = data.aliases as Record<string, string>

          const paramList = params.map(p => `- "${p.name}" (unit: ${p.unit})${p.indexed ? ' [BSA-indexed]' : ''}`).join('\n')
          const aliasList = Object.entries(aliases).map(([ext, canon]) => `- "${ext}" → "${canon}"`).join('\n')

          const systemPrompt = `You are a CMR (Cardiac MR) report data extractor. You extract measured values from semi-structured text reports exported from cardiac imaging software (e.g. CVI42, Medis, TomTec).

TASK: Extract numeric values ONLY for the canonical parameters listed below. Do NOT invent values. If a parameter is not present in the report, omit it entirely.

CANONICAL PARAMETERS:
${paramList}

KNOWN ALIASES (report name → canonical name):
${aliasList}

EXTRACTION RULES:
1. Match report fields to canonical parameters by name, known aliases, or obvious equivalence.
2. For BSA-indexed parameters (marked [BSA-indexed]), extract the "Value / BSA" or "/BSA" column value, NOT the raw value.
3. For non-indexed parameters, extract the raw "Value" column.
4. Strip commas from numbers (e.g. "1,185" → 1185).
5. Extract only the numeric value, not the unit or ± SD.
6. For T1/T2 mapping values, use the GLOBAL value (not per-slice).
7. For MAPSE, if individual wall values are given (inferior, anterior, lateral, septal), extract each one separately AND compute the mean as "MAPSE".
8. For valve flow parameters, match the vessel name to the canonical parameter (e.g. "Aorta" section → AV parameters, "MPA" → PV parameters).
9. Also extract demographics: sex, age (numeric), height_cm, weight_kg, bsa, heart_rate. For heart_rate, if a range is given (e.g. "60-80 bpm"), extract the mean (e.g. 70).

Return ONLY valid JSON in this exact format:
{
  "demographics": {
    "sex": "Male" or "Female",
    "age": <number>,
    "height_cm": <number>,
    "weight_kg": <number>,
    "bsa": <number>,
    "heart_rate": <number>
  },
  "measurements": [
    { "parameter": "<exact canonical name>", "value": <number> },
    ...
  ]
}

Do not include any parameters not in the canonical list. Do not include parameters you cannot find a value for.`

          // Call OpenAI
          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) {
            jsonRes(res, { error: 'OPENAI_API_KEY not set' }, 500)
            return
          }

          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-5.4',
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Extract values from this CMR report:\n\n${report_text}` },
              ],
            }),
          })

          if (!openaiRes.ok) {
            const err = await openaiRes.text()
            jsonRes(res, { error: `OpenAI API error: ${err}` }, 500)
            return
          }

          const completion = await openaiRes.json() as {
            choices: Array<{ message: { content: string } }>
          }
          const extracted = JSON.parse(completion.choices[0].message.content)

          jsonRes(res, extracted)
        } catch (e) {
          jsonRes(res, { error: String(e) }, 500)
        }
      })

      // POST /api/cmr-import-previous → auto-detect CMR vs Echo, extract values
      // Supports text (report_text) and/or file uploads (file_data_url + file_name)
      // Files can be PDF, Word, images (screenshots), or text
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-import-previous' || req.method !== 'POST') return next()

        try {
          const body = JSON.parse(await readBody(req))
          const reportText: string | undefined = body.report_text
          const fileDataUrl: string | undefined = body.file_data_url
          const fileName: string | undefined = body.file_name

          if (!reportText?.trim() && !fileDataUrl) {
            jsonRes(res, { error: 'Provide report_text or file_data_url' }, 400)
            return
          }

          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) {
            jsonRes(res, { error: 'OPENAI_API_KEY not set' }, 500)
            return
          }

          // Build user message content parts for OpenAI (supports multimodal)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const userParts: any[] = []
          if (reportText?.trim()) {
            userParts.push({ type: 'text', text: reportText })
          }
          if (fileDataUrl) {
            const ext = (fileName ?? '').split('.').pop()?.toLowerCase() ?? ''
            const isImage = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'gif', 'bmp'].includes(ext)
            const isPdf = ext === 'pdf'
            if (isImage) {
              // Images: use image_url content type
              userParts.push({ type: 'image_url', image_url: { url: fileDataUrl } })
            } else if (isPdf) {
              // PDFs: use the file content type (supported by gpt-4o)
              userParts.push({ type: 'file', file: { filename: fileName ?? 'report.pdf', file_data: fileDataUrl } })
            } else {
              // For docx/txt/csv: decode base64 to text
              const base64 = fileDataUrl.split(',')[1] ?? ''
              const decoded = Buffer.from(base64, 'base64').toString('utf-8')
              userParts.push({ type: 'text', text: `[File: ${fileName}]\n${decoded}` })
            }
          }

          // --- Step 1: Auto-detect report type ---
          const detectPrompt = `You are a medical report classifier. Determine whether the following report is an echocardiography (Echo) report or a cardiac MRI (CMR) report.

Look for keywords: Echo reports typically mention 'transthoracic', 'TTE', 'echocardiogram', 'M-mode', 'Doppler', 'parasternal'. CMR reports typically mention 'MRI', 'CMR', 'cardiac MR', 'LGE', 'SSFP', 'cine', 'T1 mapping', 'T2 mapping', 'CVI42', 'Medis'.

If the input is an image/screenshot/PDF of a report, read the content and classify accordingly.

Return ONLY valid JSON: { "report_type": "cmr" } or { "report_type": "echo" }`

          const detectRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-5.4',
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: detectPrompt },
                { role: 'user', content: userParts },
              ],
            }),
          })

          if (!detectRes.ok) {
            const err = await detectRes.text()
            jsonRes(res, { error: `OpenAI API error (detect): ${err}` }, 500)
            return
          }

          const detectCompletion = await detectRes.json() as {
            choices: Array<{ message: { content: string } }>
          }
          const { report_type } = JSON.parse(detectCompletion.choices[0].message.content) as { report_type: string }

          if (report_type === 'cmr') {
            // --- CMR path: reuse same extraction logic as /api/cmr-extract ---
            const data = readJson()
            const params = Object.entries(data.output_params as Record<string, { parameter: string; unit: string; indexing: string }>)
              .map(([name, p]) => ({ name, unit: p.unit, indexed: p.indexing === 'BSA' }))
            const aliases = data.aliases as Record<string, string>

            const paramList = params.map(p => `- "${p.name}" (unit: ${p.unit})${p.indexed ? ' [BSA-indexed]' : ''}`).join('\n')
            const aliasList = Object.entries(aliases).map(([ext, canon]) => `- "${ext}" → "${canon}"`).join('\n')

            const cmrSystemPrompt = `You are a CMR (Cardiac MR) report data extractor. You extract measured values from semi-structured text reports exported from cardiac imaging software (e.g. CVI42, Medis, TomTec).

TASK: Extract numeric values ONLY for the canonical parameters listed below. Do NOT invent values. If a parameter is not present in the report, omit it entirely.

CANONICAL PARAMETERS:
${paramList}

KNOWN ALIASES (report name → canonical name):
${aliasList}

EXTRACTION RULES:
1. Match report fields to canonical parameters by name, known aliases, or obvious equivalence.
2. For BSA-indexed parameters (marked [BSA-indexed]), extract the "Value / BSA" or "/BSA" column value, NOT the raw value.
3. For non-indexed parameters, extract the raw "Value" column.
4. Strip commas from numbers (e.g. "1,185" → 1185).
5. Extract only the numeric value, not the unit or ± SD.
6. For T1/T2 mapping values, use the GLOBAL value (not per-slice).
7. For MAPSE, if individual wall values are given (inferior, anterior, lateral, septal), extract each one separately AND compute the mean as "MAPSE".
8. For valve flow parameters, match the vessel name to the canonical parameter (e.g. "Aorta" section → AV parameters, "MPA" → PV parameters).
9. Also extract demographics: sex, age (numeric), height_cm, weight_kg, bsa, heart_rate. For heart_rate, if a range is given (e.g. "60-80 bpm"), extract the mean (e.g. 70).

Return ONLY valid JSON in this exact format:
{
  "demographics": {
    "sex": "Male" or "Female",
    "age": <number>,
    "height_cm": <number>,
    "weight_kg": <number>,
    "bsa": <number>,
    "heart_rate": <number>
  },
  "measurements": [
    { "parameter": "<exact canonical name>", "value": <number> },
    ...
  ]
}

Do not include any parameters not in the canonical list. Do not include parameters you cannot find a value for.`

            const cmrRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: 'gpt-5.4',
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: cmrSystemPrompt },
                  { role: 'user', content: [{ type: 'text', text: 'Extract values from this CMR report:' }, ...userParts] },
                ],
              }),
            })

            if (!cmrRes.ok) {
              const err = await cmrRes.text()
              jsonRes(res, { error: `OpenAI API error (CMR extract): ${err}` }, 500)
              return
            }

            const cmrCompletion = await cmrRes.json() as {
              choices: Array<{ message: { content: string } }>
            }
            const extracted = JSON.parse(cmrCompletion.choices[0].message.content)

            jsonRes(res, { source: 'cmr', demographics: extracted.demographics, measurements: extracted.measurements })
          } else {
            // --- Echo path: extract only numeric fields that map to CMR canonical params ---
            const echoSystemPrompt = `You are an echocardiography report data extractor. Extract ONLY the following numeric fields from the echo report. If a field is not present, omit it entirely. Do NOT invent values.

FIELDS TO EXTRACT:
- lvef_percent: LV ejection fraction (%)
- lvedv_index_ml_m2: LV end-diastolic volume index (ml/m2)
- lvesv_index_ml_m2: LV end-systolic volume index (ml/m2)
- lv_mass_index_g_m2: LV mass index (g/m2)
- mapse_mm: Mitral annular plane systolic excursion (mm)
- lvidd_mm: LV internal diameter in diastole (mm)
- lvids_mm: LV internal diameter in systole (mm)
- tapse_mm: Tricuspid annular plane systolic excursion (mm)
- fac_percent: Fractional area change (%)
- la_volume_ml: Left atrial volume (ml)
- la_volume_index_ml_m2: Left atrial volume index (ml/m2)
- la_diameter_mm: Left atrial diameter (mm)
- ra_area_cm2: Right atrial area (cm2)
- ao_annulus_mm: Aortic annulus diameter (mm)
- ao_sinus_mm: Aortic sinus diameter (mm)
- sino_tubular_junction_mm: Sino-tubular junction diameter (mm)
- proximal_ascending_aorta_mm: Proximal ascending aorta diameter (mm)
- main_pulmonary_artery_diameter_mm: Main pulmonary artery diameter (mm)
- aortic_vmax_m_s: Aortic valve peak velocity (m/s)
- aortic_peak_gradient_mmhg: Aortic valve peak gradient (mmHg)
- aortic_mean_gradient_mmhg: Aortic valve mean gradient (mmHg)
- pulmonary_valve_vmax_m_s: Pulmonary valve peak velocity (m/s)
- study_date: Date of the study (string, any format found in report)
- patient_name: Patient name (string)

Return ONLY valid JSON in this exact format:
{
  "demographics": {
    "study_date": "<string or null>",
    "patient_name": "<string or null>"
  },
  "echo_values": {
    "<field_name>": <number>,
    ...
  }
}

Only include fields you can find a value for. Do not include null numeric values.`

            const echoRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: 'gpt-5.4',
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: echoSystemPrompt },
                  { role: 'user', content: [{ type: 'text', text: 'Extract values from this echocardiography report:' }, ...userParts] },
                ],
              }),
            })

            if (!echoRes.ok) {
              const err = await echoRes.text()
              jsonRes(res, { error: `OpenAI API error (Echo extract): ${err}` }, 500)
              return
            }

            const echoCompletion = await echoRes.json() as {
              choices: Array<{ message: { content: string } }>
            }
            const echoExtracted = JSON.parse(echoCompletion.choices[0].message.content)

            jsonRes(res, { source: 'echo', demographics: echoExtracted.demographics, echo_values: echoExtracted.echo_values })
          }
        } catch (e) {
          jsonRes(res, { error: String(e) }, 500)
        }
      })

      // POST /api/cmr-lge-prose → LLM prose rewrite of LGE summary
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-lge-prose' || req.method !== 'POST') return next()

        try {
          const summaryData = JSON.parse(await readBody(req))

          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) {
            jsonRes(res, { error: 'OPENAI_API_KEY not set' }, 500)
            return
          }

          const systemPrompt = `You are writing the LGE (Late Gadolinium Enhancement) section of a structured cardiac MRI report. This is one section within a larger CMR study.

AUDIENCE: Cardiologists and radiologists.

SENTENCE STRUCTURE — critical:
- Build proper flowing sentences. Do NOT chain comma-separated clauses.
- BANNED PHRASES: Never use "is observed", "is noted", "are observed", "are noted".
- Good openers to rotate between:
  - "There is [extent] [pattern] enhancement of the..."
  - "The [walls] demonstrate [pattern] enhancement with..."
  - "[Extent] [pattern] enhancement involves the..."
  - "[Extent] [pattern] enhancement of the [walls] in the [territory] territory..."
- Territory, transmurality, and viability should be woven into the sentence — not appended.
- Vary sentence structure naturally. Never start consecutive sentences the same way.

STYLE:
- Write as a senior CMR-trained cardiologist would dictate
- Use LAD, RCA, LCx for coronary territories
- SCMR terminology: subendocardial, mid-wall, subepicardial, transmural

TERRITORY AND VIABILITY RULES (evidence-based, per SCMR guidelines and Kim et al. 2000):

1. SINGLE ISCHAEMIC SEGMENT (1 segment with subendocardial or transmural pattern):
   - Describe location, pattern, and transmurality only
   - Do NOT attribute to a coronary territory
   - Do NOT comment on viability
   - Example: "There is focal subendocardial enhancement of the basal anterior wall (1–25% transmurality)."

2. MULTIPLE ISCHAEMIC SEGMENTS (2+ segments with subendocardial/transmural pattern in same territory):
   - Attribute to coronary territory (LAD, RCA, LCx per Cerqueira et al. 2002)
   - Comment on viability at the territory level
   - Integrate viability into the finding — do not re-list walls
   - Example: "Regional subendocardial enhancement of the anterior and anteroseptal walls in the LAD territory with <50% transmurality, consistent with viable myocardium."

3. MULTI-VESSEL (ONLY when territoryCount >= 2 in the data):
   - Check the "territoryCount" field. If it is 1, this is NOT multi-vessel — use rule 2 instead.
   - NEVER say "multi-vessel" when territoryCount is 1, even if there are many segments.
   - Open with headline: "There is extensive multi-vessel ischaemic enhancement (N segments) involving the [territories]."
   - Describe each territory separately with integrated viability
   - Per-territory viability: can have both viable and non-viable within a single territory

4. DIFFUSE (3 territories, 12+ ischaemic segments):
   - No territory attribution, no viability assessment
   - Describe as diffuse pattern

5. NON-ISCHAEMIC (mid-wall, subepicardial — any segment count):
   - Never attribute coronary territories
   - Never comment on viability
   - State "consistent with a non-ischaemic pattern" once

6. MIXED ISCHAEMIC + NON-ISCHAEMIC:
   - Describe each as a separate finding
   - Use transition: "In addition to the ischaemic pattern, there is..." or "Separately, there is..."

7. UNSPECIFIED PATTERN (segments in "unspecifiedSegments" — transmurality set but no pattern assigned):
   - Describe location and transmurality only
   - Do NOT attribute to a coronary territory
   - Do NOT comment on viability or pattern type
   - Example: "There is enhancement of the basal inferior and mid inferior walls (1–25% transmurality)."
   - If ALL segments are unspecified, describe them as the sole finding
   - If mixed with patterned segments, describe separately after the patterned findings

TRANSMURALITY — simplify where possible:
- All >50% (51-75% + 76-100%) -> ">50% transmurality"
- All <50% (1-25% + 26-50%) -> "<50% transmurality"
- Only spell out specific bands when there is a single band or the range crosses 50%
- For 6+ segments include count in headline

VIABILITY PHRASING — vary naturally:
- "consistent with viable myocardium"
- "suggesting viable myocardium"
- "indicating non-viable myocardium"
- "in keeping with viable myocardium"
- parenthetical "(non-viable)" or "(viable)" when context is clear

CONTRADICTION PREVENTION:
- >50% = non-viable ALWAYS
- <50% = viable ALWAYS

QUANTIFICATION:
- Use the "scoreIndex" and "enhancedCount" fields from the data — do NOT calculate your own.
- End with: "LGE score index {scoreIndex} ({enhancedCount}/17 segments)."

DATA FIELD REFERENCE:
- "deterministicText": a structured draft summary — use this as your primary reference for content and structure. Rewrite it into polished clinical prose following all the rules above. Do NOT copy it verbatim.
- pattern codes: 0 = unspecified, 1 = subendocardial, 2 = mid-wall, 3 = subepicardial, 4 = transmural
- "unspecifiedSegments": array of segment names where pattern is unspecified (pattern=0) but transmurality is set
- transmurality codes: 1 = 1–25%, 2 = 26–50%, 3 = 51–75%, 4 = 76–100%
- Always include transmurality in the description, even for single segments

RULES:
1. Use ONLY findings from the provided data. Never invent or infer.
2. Output ONLY the summary text. No preamble, no markdown, no labels.
3. Descriptive only — no clinical interpretation or outcome prediction.
4. The "deterministicText" gives you the factual content — your job is to rewrite it as polished prose.`

          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-5.4',
              temperature: 0.5,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(summaryData) },
              ],
            }),
          })

          if (!openaiRes.ok) {
            const err = await openaiRes.text()
            jsonRes(res, { error: `OpenAI API error: ${err}` }, 500)
            return
          }

          const completion = await openaiRes.json() as {
            choices: Array<{ message: { content: string } }>
          }
          const prose = completion.choices[0].message.content.trim()

          jsonRes(res, { prose })
        } catch (e) {
          jsonRes(res, { error: String(e) }, 500)
        }
      })

      // PUT /api/cmr-data/edit-mode → bulk save from edit mode (reorder + rename)
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-data/edit-mode' || req.method !== 'PUT') return next()

        try {
          const body = JSON.parse(await readBody(req)) as {
            sections?: Record<string, string[]>
            section_renames?: Array<{ old_name: string; new_name: string }>
            sub_section_renames?: Array<{ section: string; old_name: string; new_name: string }>
            param_order?: string[]
          }

          const data = readJson()

          // 1. Apply section renames (cascade to output_params + ref_ranges)
          if (body.section_renames) {
            for (const r of body.section_renames) {
              for (const key of Object.keys(data.output_params)) {
                if (data.output_params[key].major_section === r.old_name) {
                  data.output_params[key].major_section = r.new_name
                }
              }
              for (const rr of data.ref_ranges) {
                if ((rr as Record<string, unknown>).major_section === r.old_name) {
                  (rr as Record<string, unknown>).major_section = r.new_name
                }
              }
            }
          }

          // 2. Apply sub-section renames (cascade to output_params + ref_ranges)
          if (body.sub_section_renames) {
            for (const r of body.sub_section_renames) {
              for (const key of Object.keys(data.output_params)) {
                const op = data.output_params[key]
                if (op.major_section === r.section && op.sub_section === r.old_name) {
                  op.sub_section = r.new_name
                }
              }
            }
          }

          // 3. Apply new sections config
          if (body.sections) {
            data.sections = body.sections
          }

          // 4. Reorder output_params by key order
          if (body.param_order) {
            const oldParams = data.output_params as Record<string, unknown>
            const newParams: Record<string, unknown> = {}
            for (const key of body.param_order) {
              if (oldParams[key]) newParams[key] = oldParams[key]
            }
            // Append any params not in the order list
            for (const key of Object.keys(oldParams)) {
              if (!newParams[key]) newParams[key] = oldParams[key]
            }
            data.output_params = newParams
          }

          writeJson(data)
          jsonRes(res, { ok: true })
        } catch (e) {
          jsonRes(res, { error: String(e) }, 400)
        }
      })

      // PUT /api/cmr-data/config → update config settings (e.g. papillary mode)
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-data/config' || req.method !== 'PUT') return next()

        try {
          const updates = JSON.parse(await readBody(req)) as Record<string, unknown>
          const data = readJson()
          if (!data.config) data.config = {}
          Object.assign(data.config, updates)
          writeJson(data)
          jsonRes(res, { ok: true })
        } catch (e) {
          jsonRes(res, { error: String(e) }, 400)
        }
      })

      // GET /api/cmr-data → returns full JSON (for reloading)
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-data' || req.method !== 'GET') return next()

        try {
          const data = readJson()
          jsonRes(res, data)
        } catch (e) {
          jsonRes(res, { error: String(e) }, 400)
        }
      })

      // PUT /api/cmr-data → full replace
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/cmr-data' || req.method !== 'PUT') return next()

        try {
          const parsed = JSON.parse(await readBody(req))
          writeJson(parsed)
          jsonRes(res, { ok: true })
        } catch (e) {
          jsonRes(res, { error: String(e) }, 400)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cmrDevApi()],
  server: {
    host: '127.0.0.1',
    headers: {
      'Cache-Control': 'no-store',
    },
    hmr: {
      overlay: false,
    },
    proxy: {
      '/v1': {
        target: resolveDevApiProxyTarget(),
        changeOrigin: true,
      },
      '/health': {
        target: resolveDevApiProxyTarget(),
        changeOrigin: true,
      },
      '/draft': {
        target: resolveDevApiProxyTarget(),
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
