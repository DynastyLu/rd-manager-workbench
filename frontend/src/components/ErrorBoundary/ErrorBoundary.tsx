import { Component, type ReactNode, type ErrorInfo } from 'react'
import '@/components/ErrorBoundary/ErrorBoundary.less'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, send to monitoring service here
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="error-boundary">
        <div className="error-boundary__card">
          <div className="error-boundary__code">500</div>
          <h1 className="error-boundary__title">SYSTEM ERROR</h1>
          <p className="error-boundary__message">
            {this.state.error?.message || '发生未知错误，请刷新页面重试'}
          </p>
          <button
            className="error-boundary__btn"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试
          </button>
          <button
            className="error-boundary__btn error-boundary__btn--secondary"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
