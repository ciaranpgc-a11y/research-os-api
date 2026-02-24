import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from '@/App'
import { AppErrorBoundary } from '@/components/layout/app-error-boundary'
import '@/index.css'

async function enableMocking() {
  // Safety guard: never register service-worker mocks in production bundles.
  if (import.meta.env.PROD) {
    return
  }

  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MSW !== 'true') {
    return
  }

  const { worker } = await import('@/mocks/browser')
  await worker.start({
    onUnhandledRequest: 'bypass',
  })
}

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </StrictMode>,
  )
}

enableMocking()
  .catch((error) => {
    console.warn('MSW startup failed, continuing without mocks.', error)
  })
  .finally(() => {
    renderApp()
  })
