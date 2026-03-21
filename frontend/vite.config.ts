import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DATA_FILE = path.resolve(__dirname, 'src/data/cmr_reference_data.json')

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
          const { parameter_key, unit, indexing, abnormal_direction, major_section, sub_section, pap_affected, sources } =
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
9. Also extract demographics: sex, age (numeric), height_cm, weight_kg, bsa, heart_rate.

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
              model: 'gpt-4o',
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

          const systemPrompt = `You are an expert cardiac MRI reporting physician. Your task is to rewrite a structured LGE (Late Gadolinium Enhancement) summary into natural, fluent clinical prose suitable for an SCMR-style report.

RULES:
1. Use ONLY the findings present in the provided data. Never invent or infer findings.
2. Combine related findings into flowing sentences rather than listing them mechanically.
3. Use standard SCMR terminology: "late gadolinium enhancement", "transmurality", "subendocardial", "mid-wall", "subepicardial", "transmural".
4. For coronary territories, use full names: "left anterior descending", "right coronary artery", "left circumflex".
5. When describing transmurality ranges, use the percentage bands: 1-25%, 26-50%, 51-75%, 76-100%.
6. Viability language: >50% transmurality = "non-viable myocardium", <50% = "viable myocardium amenable to revascularisation".
7. For diffuse patterns, do NOT include viability statements.
8. Keep the LGE score index sentence at the end.
9. Output ONLY the rewritten summary text. No preamble, no markdown, no explanation.

You will receive a JSON object containing:
- "deterministicText": the current engine-generated summary (use as a starting point)
- "segments": array of enhanced segments with their metadata
- "territories": grouped ischaemic territory data
- "isDiffuse": boolean flag for diffuse enhancement patterns
- "nonIschaemicSegments": non-ischaemic pattern groups
- "viability": viable/non-viable segment classification (null if suppressed)`

          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              temperature: 0.3,
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
    headers: {
      'Cache-Control': 'no-store',
    },
    hmr: {
      overlay: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
