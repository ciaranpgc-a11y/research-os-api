import type { Preview } from '@storybook/react'
import { Fragment, createElement, useEffect, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AppErrorBoundary } from '../src/components/layout/app-error-boundary'
import '../src/index.css'
import { installHouseElementTagging } from '../src/lib/house-element-tagging'
import { installHouseTableResize } from '../src/lib/house-table-resize'
import { useAaweStore } from '../src/store/use-aawe-store'
import type { UiTheme } from '../src/store/use-aawe-store'

declare global {
  interface Window {
    __aaweStorybookMswReady?: Promise<void>
  }
}

if (typeof window !== 'undefined') {
  window.__aaweStorybookMswReady ??= import('../src/mocks/browser')
    .then(({ worker }) =>
      worker.start({
        onUnhandledRequest: 'bypass',
      }),
    )
    .catch(() => undefined)
}

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

function StorybookHouseRuntime() {
  useEffect(() => {
    const disposeTagging = installHouseElementTagging()
    const disposeTableResize = installHouseTableResize()

    return () => {
      disposeTagging()
      disposeTableResize()
    }
  }, [])

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

function AppProviders({
  children,
  withRouter = true,
}: {
  children: ReactNode
  withRouter?: boolean
}) {
  const content = createElement(
    Fragment,
    null,
    createElement(ThemeBridge),
    createElement(StorybookHouseRuntime),
    createElement('div', { className: 'min-h-screen bg-background text-foreground' }, children),
  )

  return createElement(
    AppErrorBoundary,
    null,
    withRouter ? createElement(MemoryRouter, null, content) : content,
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
      const withRouter = context.parameters?.withRouter !== false
      const state = useAaweStore.getState()
      if (state.theme !== selectedTheme) {
        state.setTheme(selectedTheme)
      }
      return createElement(
        AppProviders,
        { withRouter },
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
