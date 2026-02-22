import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  message: string
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Unexpected UI error.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('AAWE UI crash', error, info)
  }

  private onReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 p-6">
          <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-red-700">Application error</p>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">The page failed to render</h1>
            <p className="mt-2 text-sm text-slate-700">{this.state.message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={this.onReload}>Reload page</Button>
              <Button variant="outline" onClick={() => (window.location.href = '/auth')}>
                Open sign-in
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

