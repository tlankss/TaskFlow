// Global polyfills for Electron / Chromium environment
if (typeof Uint8Array !== 'undefined') {
  if (!(Uint8Array.prototype as any).toHex) {
    ;(Uint8Array.prototype as any).toHex = function () {
      let hex = ''
      for (let i = 0; i < this.length; i++) {
        hex += this[i].toString(16).padStart(2, '0')
      }
      return hex
    }
  }
  if (!(Uint8Array as any).fromHex) {
    ;(Uint8Array as any).fromHex = function (hexString: string) {
      const cleanHex = (hexString || '').replace(/\s+/g, '')
      const bytes = new Uint8Array(Math.floor(cleanHex.length / 2))
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16)
      }
      return bytes
    }
  }
}

if (typeof Promise !== 'undefined' && !(Promise as any).try) {
  ;(Promise as any).try = function (fn: any, ...args: any[]) {
    return new Promise((resolve) => resolve(fn(...args)))
  }
}

import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('TaskFlow Uncaught Error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-500 bg-[#0f172a] h-screen overflow-auto font-sans">
          <h2 className="text-lg font-bold mb-3 text-red-400">⚠️ 界面渲染异常 (React Runtime Error)</h2>
          <div className="bg-[#1e293b] p-4 rounded-xl text-red-300 text-xs font-mono whitespace-pre-wrap mb-4 border border-red-500/20">
            {this.state.error?.toString()}
          </div>
          <div className="bg-[#1e293b] p-4 rounded-xl text-slate-400 text-[11px] font-mono whitespace-pre-wrap border border-slate-700/40">
            {this.state.errorInfo?.componentStack || this.state.error?.stack}
          </div>
          <div className="mt-4 flex space-x-3">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null })
                window.location.reload()
              }}
              className="px-4 py-2 bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-semibold rounded-xl"
            >
              刷新并重新加载
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('taskflow_reading_plans')
                localStorage.removeItem('taskflow_books')
                window.location.reload()
              }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl"
            >
              重置缓存
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
