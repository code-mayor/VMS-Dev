import React from 'react'
import { Button } from '../ui/button'
import { Alert, AlertDescription } from '../ui/alert'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ProfileDialogErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ProfileDialogErrorBoundaryProps {
  children: React.ReactNode
}

export class ProfileDialogErrorBoundary extends React.Component<
  ProfileDialogErrorBoundaryProps,
  ProfileDialogErrorBoundaryState
> {
  constructor(props: ProfileDialogErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ProfileDialogErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ProfileDialog Error Boundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>

          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Profile Dialog Error
          </h3>

          <p className="text-sm text-gray-600 mb-4">
            An error occurred while loading the profile management dialog.
            This might be due to a network issue or temporary server problem.
          </p>

          <Alert variant="destructive" className="mb-4 text-left">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Error details:</strong> {this.state.error?.message || 'Unknown error'}
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Button onClick={this.handleReset} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>

            <Button
              variant="outline"
              onClick={this.handleReset}
              className="w-full"
            >
              Refresh Page
            </Button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            <details>
              <summary className="cursor-pointer hover:text-gray-700">
                Technical Details
              </summary>
              <pre className="mt-2 text-left bg-gray-100 p-2 rounded text-xs overflow-auto">
                {this.state.error?.stack || 'No stack trace available'}
              </pre>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}