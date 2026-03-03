import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui'

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
    console.error('AAWE UI crash', error, info)
  }

  private onReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background p-6">
          <div className="mx-auto max-w-xl rounded-lg border border-[hsl(var(--tone-danger-200))] bg-card p-6 shadow-sm">
            <p className="house-h2 text-[hsl(var(--tone-danger-700))]">Application error</p>
            <h1 className="house-section-title mt-2">The page failed to render</h1>
            <p className="mt-2 text-sm text-[hsl(var(--tone-neutral-700))]">{this.state.message}</p>
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

