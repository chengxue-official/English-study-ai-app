import { useEffect, useState } from 'react'
import {
  useConfigStore,
  API_PROVIDERS,
} from '../store/configStore'
import { useUpdateStore } from '../store/updateStore'
import { YoudaoService } from '../services/youdao'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onOpenDictManager?: () => void
}

export default function SettingsModal({ open, onClose, onOpenDictManager }: SettingsModalProps) {
  const {
    apiKey,
    apiUrl,
    model,
    providerName,
    availableModels,
    fetchingModels,
    connectionStatus,
    setApiKey,
    setApiUrl,
    setModel,
    setProvider,
    fetchModels,
    loadFromStorage,
    saveToStorage,
    youdaoAppKey,
    youdaoAppSecret,
    setYoudaoConfig,
  } = useConfigStore()

  const [youdaoStatus, setYoudaoStatus] = useState<{ success?: boolean; message: string }>({ message: '' })
  const [testingYoudao, setTestingYoudao] = useState(false)

  const {
    currentVersion,
    latestVersion,
    isChecking,
    hasUpdate,
    checkUpdate,
    applyUpdate,
  } = useUpdateStore()

  // 打开时加载存储的配置
  useEffect(() => {
    if (open) {
      loadFromStorage()
    }
  }, [open, loadFromStorage])

  const isCustom = providerName === '自定义'
  const canConnect = !!(apiKey && apiUrl) && !fetchingModels
  const isConnected = connectionStatus.success === true && availableModels.length > 0

  // 连接并获取模型列表
  const handleConnect = async () => {
    await fetchModels()
  }

  // 测试有道连接
  const handleTestYoudao = async () => {
    if (!youdaoAppKey || !youdaoAppSecret) return
    setTestingYoudao(true)
    const result = await YoudaoService.testConnection(youdaoAppKey, youdaoAppSecret)
    setYoudaoStatus(result)
    setTestingYoudao(false)
  }

  // 保存配置
  const handleSave = () => {
    saveToStorage()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗 */}
      <div className="relative w-[calc(100%-2rem)] md:w-[560px] max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-100">
          <h2 className="text-base md:text-lg font-semibold text-gray-800">模型配置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-4 md:px-6 py-4 md:py-5 space-y-4 md:space-y-5">
          {/* 提示 */}
          <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
            配置大模型API后即可使用翻译、长难句分析等功能。你的密钥仅保存在本地浏览器中，不会上传到任何第三方服务器。
          </div>

          {/* 步骤1: 选择服务商 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs mr-1.5">1</span>
              选择 API 服务商
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {API_PROVIDERS.map((provider) => (
                <button
                  key={provider.name}
                  onClick={() => setProvider(provider.name)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                    providerName === provider.name
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* 步骤2: API地址 + Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs mr-1.5">2</span>
              填写连接信息
            </label>

            <div className="space-y-3">
              {/* API地址 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">API 地址（Base URL）</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  disabled={!isCustom}
                  placeholder="https://api.openai.com"
                  className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent ${
                    !isCustom
                      ? 'bg-gray-50 text-gray-500 border-gray-200'
                      : 'bg-white text-gray-800 border-gray-300'
                  }`}
                />
                {!isCustom && (
                  <p className="mt-1 text-xs text-gray-400">选择"自定义"可修改API地址</p>
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {providerName === 'OpenAI' && '在 platform.openai.com 获取'}
                  {providerName === 'DeepSeek' && '在 platform.deepseek.com 获取'}
                  {providerName === '通义千问' && '在 dashscope.aliyuncs.com 获取'}
                  {providerName === '智谱AI' && '在 open.bigmodel.cn 获取'}
                  {providerName === 'Moonshot' && '在 platform.moonshot.cn 获取'}
                </p>
              </div>
            </div>
          </div>

          {/* 连接按钮 */}
          <div>
            <button
              onClick={handleConnect}
              disabled={!canConnect}
              className="w-full py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              {fetchingModels ? '正在连接...' : '连接并获取模型列表'}
            </button>

            {/* 连接状态 */}
            {connectionStatus.message && (
              <div
                className={`mt-3 p-3 rounded-xl text-sm flex items-start gap-2 ${
                  connectionStatus.success === true
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : connectionStatus.success === false
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                }`}
              >
                {connectionStatus.success === true && (
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {connectionStatus.success === false && (
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <p>{connectionStatus.message}</p>
              </div>
            )}
          </div>

          {/* 步骤3: 选择模型（连接成功后显示） */}
          {isConnected && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs mr-1.5">3</span>
                选择模型
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              >
                <option value="">-- 请选择模型 --</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                共 {availableModels.length} 个可用模型
              </p>
            </div>
          )}

          {/* 有道词典 API 配置 */}
          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              有道智云 API 配置 (可选)
            </label>
            <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-700 mb-3">
              配置有道官方 API 后，查词将更稳定且支持发音。请在 <a href="https://ai.youdao.com/" target="_blank" rel="noreferrer" className="underline font-bold">有道智云控制台</a> 申请“自然语言翻译服务”。
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">App Key</label>
                <input
                  type="text"
                  value={youdaoAppKey}
                  onChange={(e) => setYoudaoConfig(e.target.value, youdaoAppSecret)}
                  placeholder="您的 App Key"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">App Secret</label>
                <input
                  type="password"
                  value={youdaoAppSecret}
                  onChange={(e) => setYoudaoConfig(youdaoAppKey, e.target.value)}
                  placeholder="您的 App Secret"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleTestYoudao}
                disabled={!youdaoAppKey || !youdaoAppSecret || testingYoudao}
                className="w-full py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-100 text-amber-700 hover:bg-amber-200"
              >
                {testingYoudao ? '正在测试...' : '测试有道连接'}
              </button>

              {youdaoStatus.message && (
                <div
                  className={`p-2 rounded-lg text-[10px] md:text-xs flex items-start gap-1.5 ${
                    youdaoStatus.success === true
                      ? 'bg-green-50 text-green-700 border border-green-100'
                      : 'bg-red-50 text-red-700 border border-red-100'
                  }`}
                >
                  <p>{youdaoStatus.message}</p>
                </div>
              )}
            </div>
          </div>

          {/* 词典管理 */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-700">词典资源</h3>
                <p className="text-xs text-gray-400 mt-0.5">管理本地离线词典库</p>
              </div>
              <button
                onClick={() => {
                  onClose()
                  onOpenDictManager?.()
                }}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                管理词典
              </button>
            </div>
          </div>

          {/* 版本与更新 */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-700">版本信息</h3>
                <p className="text-xs text-gray-400 mt-0.5">当前版本: v{currentVersion}</p>
              </div>
              <button
                onClick={checkUpdate}
                disabled={isChecking}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {isChecking ? '正在检查...' : '检查更新'}
              </button>
            </div>

            {hasUpdate && latestVersion && (
              <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-blue-700">发现新版本 v{latestVersion.version}</span>
                  <span className="text-[10px] text-blue-500">{latestVersion.releaseDate}</span>
                </div>
                <p className="text-xs text-blue-600 mb-2">{latestVersion.description}</p>
                <button
                  onClick={applyUpdate}
                  className="w-full py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  立即更新并重启
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 px-4 md:px-6 py-3 md:py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!model}
            className="flex-1 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  )
}