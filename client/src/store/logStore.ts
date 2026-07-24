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
  loadLogs: () => void
}

const STORAGE_KEY = 'app_persistent_logs_v2'

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  maxLogs: 200,
  loadLogs: () => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        set({ logs: JSON.parse(saved) })
      } catch (e) {
        console.error('Failed to load logs', e)
      }
    }
  },
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

    const newLogs = [
      { timestamp: Date.now(), level, message },
      ...get().logs.slice(0, get().maxLogs - 1)
    ]
    set({ logs: newLogs })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLogs))
  },
  clearLogs: () => {
    set({ logs: [] })
    localStorage.removeItem(STORAGE_KEY)
  }
}))

// 初始化加载
if (typeof window !== 'undefined') {
  useLogStore.getState().loadLogs()
}

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