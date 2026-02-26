import { HttpResponse, http } from 'msw'

import {
  buildPublicationMetricDetailFixture,
  publicationsMetricsEmptyFixture,
  publicationsMetricsHappyFixture,
} from '@/mocks/fixtures/publications-metrics'

const metricsPath = '*/v1/publications/metrics'
const metricDetailPath = '*/v1/publications/metric/:metricId'

type MetricsMockMode = 'happy' | 'empty' | 'error'

function resolveMetricsMode(value: unknown): MetricsMockMode {
  const normalized = String(value || 'happy').trim().toLowerCase()
  if (normalized === 'empty' || normalized === 'error' || normalized === 'happy') {
    return normalized
  }
  return 'happy'
}

const metricsMode = resolveMetricsMode(import.meta.env.VITE_MSW_PUBLICATIONS_METRICS_MODE)

export const publicationsMetricsHandler = http.get(metricsPath, () => {
  if (metricsMode === 'empty') {
    return HttpResponse.json(publicationsMetricsEmptyFixture)
  }

  if (metricsMode === 'error') {
    return HttpResponse.json(
      {
        error: {
          message: 'Mocked metrics failure',
          detail: 'Simulated 500 response from /v1/publications/metrics',
        },
      },
      { status: 500 },
    )
  }

  return HttpResponse.json(publicationsMetricsHappyFixture)
})

export const publicationMetricDetailHandler = http.get(metricDetailPath, ({ params }) => {
  const metricId = String(params.metricId || '').trim()
  if (!metricId) {
    return HttpResponse.json(
      {
        error: {
          message: 'Metric id is required',
          detail: 'Missing metric id in mocked /v1/publications/metric route.',
        },
      },
      { status: 400 },
    )
  }
  return HttpResponse.json(buildPublicationMetricDetailFixture(metricId))
})

export const handlers = [publicationsMetricsHandler, publicationMetricDetailHandler]
