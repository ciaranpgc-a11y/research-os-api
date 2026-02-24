import type { Preview } from '@storybook/react'
import { createElement, useEffect, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AppErrorBoundary } from '../src/components/layout/app-error-boundary'
import '../src/index.css'
import { useAaweStore } from '../src/store/use-aawe-store'

function ThemeBridge() {
  const theme = useAaweStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('aawe-theme', theme)
  }, [theme])

  return null
}

function AppProviders({ children }: { children: ReactNode }) {
  return createElement(
    AppErrorBoundary,
    null,
    createElement(
      MemoryRouter,
      null,
      createElement(ThemeBridge),
      createElement('div', { className: 'min-h-screen bg-background text-foreground' }, children),
    ),
  )
}

const preview: Preview = {
  decorators: [
    (Story) => createElement(AppProviders, null, createElement(Story)),
  ],
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
