const http = require('http')
const { URL } = require('url')

const LISTEN_PORT = 8000
const UPSTREAM_HOST = '127.0.0.1'
const UPSTREAM_PORT = 8001

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function requestUpstream({ method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const upstreamReq = http.request(
      {
        hostname: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        path,
        method,
        headers,
      },
      (upstreamRes) => {
        const chunks = []
        upstreamRes.on('data', (chunk) => chunks.push(chunk))
        upstreamRes.on('end', () => {
          resolve({
            statusCode: upstreamRes.statusCode || 502,
            headers: upstreamRes.headers || {},
            body: Buffer.concat(chunks),
          })
        })
      },
    )
    upstreamReq.on('error', reject)
    if (body && body.length) {
      upstreamReq.write(body)
    }
    upstreamReq.end()
  })
}

function resolvePublicationYear(record) {
  if (!record || typeof record !== 'object') {
    return null
  }
  const year = Number(record.year)
  if (Number.isInteger(year) && year >= 1900 && year <= 3000) {
    return year
  }
  const dateCandidate = String(record.publication_date || record.publication_month_start || '').trim()
  if (/^\d{4}/.test(dateCandidate)) {
    const parsed = Number(dateCandidate.slice(0, 4))
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return 0
  }
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function calculateMean(values) {
  if (!values.length) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function calculatePopulationSd(values, mean) {
  if (!values.length) {
    return 0
  }
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function classifyYearPosition(years, allYears) {
  if (!years.length || !allYears.length) {
    return 'mixed'
  }
  const first = allYears[0]
  const last = allYears[allYears.length - 1]
  const span = Math.max(1, last - first)
  const average = years
    .map((year) => (year - first) / span)
    .reduce((sum, value) => sum + value, 0) / years.length
  if (average <= 0.33) {
    return 'early'
  }
  if (average >= 0.67) {
    return 'recent'
  }
  return years.length === 1 ? 'middle' : 'mixed'
}

function buildPublicationOutputPatternPayload(metricPayload) {
  const tile = metricPayload && typeof metricPayload === 'object'
    ? metricPayload.tile || {}
    : {}
  const drilldown = tile && typeof tile.drilldown === 'object' && tile.drilldown
    ? tile.drilldown
    : {}
  const records = Array.isArray(drilldown.publications) ? drilldown.publications : []
  const asOfRaw = String(drilldown.as_of_date || '').trim()
  const asOfDate = asOfRaw ? new Date(asOfRaw) : new Date()
  const currentYear = Number.isInteger(asOfDate.getUTCFullYear()) ? asOfDate.getUTCFullYear() : new Date().getUTCFullYear()

  const countsByYear = new Map()
  for (const record of records) {
    const year = resolvePublicationYear(record)
    if (!Number.isInteger(year) || year >= currentYear) {
      continue
    }
    countsByYear.set(year, (countsByYear.get(year) || 0) + 1)
  }

  const years = Array.from(countsByYear.keys()).sort((left, right) => left - right)
  if (!years.length) {
    return {
      agent_name: 'Publication insights agent',
      status: 'draft',
      window_id: 'all',
      window_label: 'All',
      overall_summary: 'There is not yet enough completed publication history to interpret an output pattern.',
      sections: [
        {
          key: 'publication_output_pattern',
          title: 'Publication output pattern',
          headline: 'Output pattern',
          body: 'There is not yet enough completed publication history to interpret an output pattern.',
          consideration_label: null,
          consideration: null,
          evidence: {
            active_span: 0,
            years_with_output: 0,
            peak_years: [],
            low_year_position: 'mixed',
          },
        },
      ],
      provenance: {
        source: 'dev-backend-proxy',
        data_sources: Array.isArray(metricPayload?.data_sources) ? metricPayload.data_sources : [],
        generated_at: new Date().toISOString(),
        generation_mode: 'deterministic_proxy',
      },
    }
  }

  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  const spanYears = []
  for (let year = firstYear; year <= lastYear; year += 1) {
    spanYears.push(year)
  }
  const series = spanYears.map((year) => Number(countsByYear.get(year) || 0))
  const activeSpan = spanYears.length
  const yearsWithOutput = series.filter((value) => value >= 1).length
  const totalPublications = series.reduce((sum, value) => sum + value, 0)
  const mean = calculateMean(series)
  const sd = calculatePopulationSd(series, mean)
  const cv = mean > 0 ? sd / mean : 0
  const consistency = clamp(1 - cv, 0, 1)
  const burstiness = clamp(cv / (1 + cv), 0, 1)
  const peakCount = Math.max(...series)
  const lowCount = Math.min(...series)
  const peakShare = totalPublications > 0 ? peakCount / totalPublications : 0
  const peakYears = spanYears.filter((year, index) => series[index] === peakCount)
  const lowYears = spanYears.filter((year, index) => series[index] === lowCount)
  const lowYearPosition = classifyYearPosition(lowYears, spanYears)

  let body = ''
  let considerationLabel = null
  let consideration = null

  if (activeSpan <= 1) {
    body = 'There is not yet enough completed publication history to interpret an output pattern.'
  } else if (consistency >= 0.55 && burstiness <= 0.4 && yearsWithOutput / activeSpan >= 0.8) {
    body = `Your publication output is fairly steady across a ${activeSpan}-year span, with publications appearing in ${yearsWithOutput} of those years and no single year dominating the record.`
  } else if (peakShare >= 0.3 || burstiness >= 0.55) {
    body = `Your publication output is concentrated in a smaller set of stronger years rather than being spread evenly across the full ${activeSpan}-year span.`
  } else {
    body = `Your publication output is active across a ${activeSpan}-year span, but stronger and quieter years still create a moderately uneven pattern overall.`
  }

  if (lowYearPosition === 'early') {
    considerationLabel = 'Career timing'
    consideration = 'The quietest years sit early in your publication span, so some unevenness reflects earlier build-up rather than a recent fall-off.'
  } else if (lowYearPosition === 'recent') {
    considerationLabel = 'Recent signal'
    consideration = 'The quietest years sit toward the recent end of your span, so check whether output has flattened after earlier stronger years.'
  } else if (peakYears.length > 1) {
    considerationLabel = 'How to read it'
    consideration = 'Several peak years share the top output, so the pattern is not being driven by one isolated year alone.'
  }

  return {
    agent_name: 'Publication insights agent',
    status: 'draft',
    window_id: 'all',
    window_label: 'All',
    overall_summary: body,
    sections: [
      {
        key: 'publication_output_pattern',
        title: 'Publication output pattern',
        headline: 'Output pattern',
        body,
        consideration_label: considerationLabel,
        consideration,
        evidence: {
          active_span: activeSpan,
          years_with_output: yearsWithOutput,
          peak_years: peakYears,
          peak_count: peakCount,
          peak_year_share_pct: round(peakShare * 100, 1),
          consistency_index: round(consistency, 2),
          burstiness_score: round(burstiness, 2),
          low_year_position: lowYearPosition,
        },
      },
    ],
    provenance: {
      source: 'dev-backend-proxy',
      data_sources: Array.isArray(metricPayload?.data_sources) ? metricPayload.data_sources : [],
      generated_at: new Date().toISOString(),
      generation_mode: 'deterministic_proxy',
    },
  }
}

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': String(body.length),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      })
      res.end()
      return
    }

    if (
      req.method === 'GET'
      && url.pathname === '/v1/publications/ai/insights'
      && url.searchParams.get('section_key') === 'publication_output_pattern'
    ) {
      const metricResponse = await requestUpstream({
        method: 'GET',
        path: '/v1/publications/metric/this_year_vs_last',
        headers: req.headers,
        body: Buffer.alloc(0),
      })
      if (metricResponse.statusCode >= 400) {
        res.writeHead(metricResponse.statusCode, metricResponse.headers)
        res.end(metricResponse.body)
        return
      }
      const metricPayload = JSON.parse(metricResponse.body.toString('utf8'))
      sendJson(res, 200, buildPublicationOutputPatternPayload(metricPayload))
      return
    }

    const body = await readRequestBody(req)
    const upstreamResponse = await requestUpstream({
      method: req.method || 'GET',
      path: `${url.pathname}${url.search}`,
      headers: req.headers,
      body,
    })
    res.writeHead(upstreamResponse.statusCode, upstreamResponse.headers)
    res.end(upstreamResponse.body)
  } catch (error) {
    sendJson(res, 502, {
      detail: error instanceof Error ? error.message : 'Proxy request failed.',
    })
  }
})

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  process.stdout.write(`Dev backend proxy listening on http://127.0.0.1:${LISTEN_PORT}\n`)
})
