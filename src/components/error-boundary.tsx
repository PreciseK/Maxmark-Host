import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { failed: boolean }

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#121214] p-6 text-white">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-white/60">Your account data was not changed. Reload the page to try again.</p>
            <button className="rounded-md bg-white px-4 py-2 font-medium text-black" onClick={() => window.location.reload()} type="button">Reload</button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
