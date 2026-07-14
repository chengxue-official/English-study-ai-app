import { create } from 'zustand'

// 预设的API提供商（url现在是base URL）
export interface APIProvider {
  name: string
  url: string // base URL，不含 /v1/chat/completions
}

export const API_PROVIDERS: APIProvider[] = [
  { name: 'OpenAI', url: 'https://api.openai.com' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com' },
  { name: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode' },
  { name: '智谱AI', url: 'https://open.bigmodel.cn/api/paas' },
  { name: 'Moonshot', url: 'https://api.moonshot.cn' },
  { name: '自定义', url: '' },
]

export interface ConnectionStatus {
  testing: boolean
  success: boolean | null
  message: string
}

interface ConfigState {
  apiKey: string
  apiUrl: string // base URL
  model: string
  providerName: string
  availableModels: string[] // 从API动态获取的模型列表
  fetchingModels: boolean
  connectionStatus: ConnectionStatus

  setApiKey: (key: string) => void
  setApiUrl: (url: string) => void
  setModel: (model: string) => void
  setProvider: (name: string) => void
  setAvailableModels: (models: string[]) => void
  setConnectionStatus: (status: Partial<ConnectionStatus>) => void
  fetchModels: () => Promise<boolean>
  loadFromStorage: () => void
  saveToStorage: () => void
  isConfigured: () => boolean
  getConfig: () => { apiKey: string; apiUrl: string; model: string }
}

const STORAGE_KEY = 'english-exam-app-config'

export const useConfigStore = create<ConfigState>((set, get) => ({
  apiKey: '',
  apiUrl: API_PROVIDERS[0].url,
  model: '',
  providerName: API_PROVIDERS[0].name,
  availableModels: [],
  fetchingModels: false,
  connectionStatus: {
    testing: false,
    success: null,
    message: '',
  },

  setApiKey: (apiKey) => set({ apiKey }),
  setApiUrl: (apiUrl) => set({ apiUrl }),
  setModel: (model) => set({ model }),
  setProvider: (name) => {
    const provider = API_PROVIDERS.find((p) => p.name === name)
    if (provider && provider.name !== '自定义') {
      set({
        providerName: name,
        apiUrl: provider.url,
        model: '', // 切换服务商时清空模型，等重新获取
        availableModels: [],
      })
    } else {
      set({ providerName: name, model: '', availableModels: [] })
    }
  },
  setAvailableModels: (availableModels) => set({ availableModels }),
  setConnectionStatus: (status) =>
    set((state) => ({
      connectionStatus: { ...state.connectionStatus, ...status },
    })),

  /**
   * 调用后端获取可用模型列表
   * 返回 true 表示成功
   */
  fetchModels: async () => {
    const { apiKey, apiUrl } = get()
    if (!apiKey || !apiUrl) return false

    set({
      fetchingModels: true,
      connectionStatus: { testing: true, success: null, message: '正在连接并获取模型列表...' },
    })

    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiUrl }),
      })

      const data = await res.json()

      if (data.success && Array.isArray(data.models) && data.models.length > 0) {
        set({
          availableModels: data.models,
          fetchingModels: false,
          connectionStatus: {
            testing: false,
            success: true,
            message: `连接成功，获取到 ${data.models.length} 个可用模型`,
          },
        })
        return true
      } else {
        set({
          fetchingModels: false,
          availableModels: [],
          connectionStatus: {
            testing: false,
            success: false,
            message: data.error || '未获取到可用模型',
          },
        })
        return false
      }
    } catch {
      set({
        fetchingModels: false,
        availableModels: [],
        connectionStatus: {
          testing: false,
          success: false,
          message: '无法连接到后端服务，请确认服务已启动',
        },
      })
      return false
    }
  },

  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        set({
          apiKey: data.apiKey || '',
          apiUrl: data.apiUrl || API_PROVIDERS[0].url,
          model: data.model || '',
          providerName: data.providerName || API_PROVIDERS[0].name,
        })
      }
    } catch {
      // 忽略解析错误
    }
  },

  saveToStorage: () => {
    const { apiKey, apiUrl, model, providerName } = get()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiKey, apiUrl, model, providerName })
    )
  },

  isConfigured: () => {
    const { apiKey, apiUrl, model } = get()
    return !!(apiKey && apiUrl && model)
  },

  getConfig: () => {
    const { apiKey, apiUrl, model } = get()
    return { apiKey, apiUrl, model }
  },
}))