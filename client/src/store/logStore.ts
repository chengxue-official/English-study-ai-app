import { create } from 'zustand'

interface LogEntry {
  timestamp: number
  level: 'log' | 'error' | 'warn' | 'info'
  message: string
}

interface LogState {
  logs: LogEntry[]
  maxLogs: number
  addLog: (level: LogEntry['level'], ...args: any[]) => void
  clearLogs: () => void
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  maxLogs: 200,
  addLog: (level, ...args) => {
    const message = args
      .map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2)
          } catch (e) {
            return String(arg)
          }
        }
        return String(arg)
      })
      .join(' ')

    set((state) => ({
      logs: [
        { timestamp: Date.now(), level, message },
        ...state.logs.slice(0, state.maxLogs - 1)
      ]
    }))
  },
  clearLogs: () => set({ logs: [] })
}))

// 拦截控制台输出
if (typeof window !== 'undefined') {
  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn
  const originalInfo = console.info

  console.log = (...args) => {
    originalLog.apply(console, args)
    useLogStore.getState().addLog('log', ...args)
  }

  console.error = (...args) => {
    originalError.apply(console, args)
    useLogStore.getState().addLog('error', ...args)
  }

  console.warn = (...args) => {
    originalWarn.apply(console, args)
    useLogStore.getState().addLog('warn', ...args)
  }

  console.info = (...args) => {
    originalInfo.apply(console, args)
    useLogStore.getState().addLog('info', ...args)
  }
}