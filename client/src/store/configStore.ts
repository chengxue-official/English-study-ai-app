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
  
  // 有道词典 API 配置
  youdaoAppKey: string
  youdaoAppSecret: string

  setApiKey: (key: string) => void
  setApiUrl: (url: string) => void
  setModel: (model: string) => void
  setProvider: (name: string) => void
  setAvailableModels: (models: string[]) => void
  setConnectionStatus: (status: Partial<ConnectionStatus>) => void
  setYoudaoConfig: (appKey: string, appSecret: string) => void
  fetchModels: () => Promise<boolean>
  loadFromStorage: () => void
  saveToStorage: () => void
  isConfigured: () => boolean
  getConfig: () => { apiKey: string; apiUrl: string; model: string }
  getYoudaoConfig: () => { appKey: string; appSecret: string }
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
  youdaoAppKey: '',
  youdaoAppSecret: '',

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
  setYoudaoConfig: (youdaoAppKey, youdaoAppSecret) => set({ youdaoAppKey, youdaoAppSecret }),

  /**
   * 调用大模型 API 获取可用模型列表
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
      // 规范化 URL 并提取 base URL
      let baseUrl = apiUrl.trim().replace(/\/+$/, '')
      if (baseUrl.endsWith('/chat/completions')) {
        baseUrl = baseUrl.slice(0, -('/chat/completions').length)
      }
      // 去掉末尾的版本路径段如 /v1, /v4 等
      baseUrl = baseUrl.replace(/\/v\d+$/, '')
      
      const modelsUrl = `${baseUrl}/v1/models`

      console.log(`[Models] 请求: ${modelsUrl}`)

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        const errText = await response.text()
        let errMsg = `获取模型列表失败 (${response.status})`
        try {
          const errJson = JSON.parse(errText)
          errMsg = errJson.error?.message || errJson.message || errMsg
        } catch {
          // ignore
        }
        set({
          fetchingModels: false,
          availableModels: [],
          connectionStatus: {
            testing: false,
            success: false,
            message: errMsg,
          },
        })
        return false
      }

      const data = await response.json()
      // OpenAI 兼容格式: { data: [{ id: "model-name", ... }, ...] }
      const models: string[] = (data.data || [])
        .map((m: { id?: string }) => m.id)
        .filter(Boolean)
        .sort()

      if (models.length > 0) {
        set({
          availableModels: models,
          fetchingModels: false,
          connectionStatus: {
            testing: false,
            success: true,
            message: `连接成功，获取到 ${models.length} 个可用模型`,
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
            message: '未获取到可用模型',
          },
        })
        return false
      }
    } catch (err: any) {
      set({
        fetchingModels: false,
        availableModels: [],
        connectionStatus: {
          testing: false,
          success: false,
          message: `连接失败: ${err.message || err}`,
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
          youdaoAppKey: data.youdaoAppKey || '',
          youdaoAppSecret: data.youdaoAppSecret || '',
        })
      }
    } catch {
      // 忽略解析错误
    }
  },

  saveToStorage: () => {
    const { apiKey, apiUrl, model, providerName, youdaoAppKey, youdaoAppSecret } = get()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiKey, apiUrl, model, providerName, youdaoAppKey, youdaoAppSecret })
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

  getYoudaoConfig: () => {
    const { youdaoAppKey, youdaoAppSecret } = get()
    return { appKey: youdaoAppKey, appSecret: youdaoAppSecret }
  },
}))