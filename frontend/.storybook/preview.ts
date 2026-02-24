import type { Preview } from '@storybook/react'
import { Fragment, createElement, useEffect, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AppErrorBoundary } from '../src/components/layout/app-error-boundary'
import '../src/index.css'
import { useAaweStore } from '../src/store/use-aawe-store'
import type { UiTheme } from '../src/store/use-aawe-store'

function getStoredTheme(): UiTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const stored = window.localStorage.getItem('aawe-theme')
  return stored === 'dark' ? 'dark' : 'light'
}

function normalizeTheme(value: unknown): UiTheme {
  return value === 'dark' ? 'dark' : 'light'
}

function ThemeBridge() {
  const theme = useAaweStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('aawe-theme', theme)
  }, [theme])

  return null
}

function StorybookThemeSync({ theme, children }: { theme: UiTheme; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('aawe-theme', theme)
    const state = useAaweStore.getState()
    if (state.theme !== theme) {
      state.setTheme(theme)
    }
  }, [theme])

  return createElement(Fragment, null, children)
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

const defaultTheme = getStoredTheme()

const preview: Preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global UI theme',
      defaultValue: defaultTheme,
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        showName: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const selectedTheme = normalizeTheme(context.globals.theme ?? defaultTheme)
      const state = useAaweStore.getState()
      if (state.theme !== selectedTheme) {
        state.setTheme(selectedTheme)
      }
      return createElement(
        AppProviders,
        null,
        createElement(
          StorybookThemeSync,
          { theme: selectedTheme },
          createElement(Story),
        ),
      )
    },
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
