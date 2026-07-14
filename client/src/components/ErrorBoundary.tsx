import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: string
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message || '未知错误' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('渲染错误:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">页面出了点问题</h2>
            <p className="text-sm text-gray-500 mb-4">{this.state.error}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload() }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}