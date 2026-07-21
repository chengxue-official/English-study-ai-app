import { useEffect, useState } from 'react'
import {
  useConfigStore,
  API_PROVIDERS,
} from '../store/configStore'
import { useUpdateStore } from '../store/updateStore'
import { useLogStore } from '../store/logStore'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onOpenDictManager?: () => void
}

export default function SettingsModal({ open, onClose, onOpenDictManager }: SettingsModalProps) {
  const [clickCount, setClickCount] = useState(0)
  const [showDevTools, setShowDevTools] = useState(false)
  const { logs, clearLogs } = useLogStore()
  
  const {
    apiKey,
    apiUrl,
    model,
    providerName,
    availableModels,
    fetchingModels,
    connectionStatus,
    dictSource,
    setApiKey,
    setApiUrl,
    setModel,
    setProvider,
    setDictSource,
    fetchModels,
    loadFromStorage,
    saveToStorage,
  } = useConfigStore()

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
      <div className="relative w-[calc(100%-2rem)] md:w-[600px] max-h-[90vh] overflow-hidden bg-white rounded-[2.5rem] shadow-2xl flex flex-col border border-slate-100">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 md:px-8 py-5 md:py-6 border-b border-slate-50 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">AI 模型配置</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">AI Model Configuration</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-100 text-slate-400 hover:text-slate-600 hover:shadow-md transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 - 滚动区 */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 pb-20 space-y-8 custom-scrollbar">
          {/* 提示 */}
          <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl text-sm text-white shadow-lg shadow-blue-200/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700" />
            <div className="relative z-10 flex gap-3">
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium leading-relaxed">
                配置大模型 API 后即可使用翻译、长难句分析等功能。你的密钥仅保存在本地，安全无忧。
              </p>
            </div>
          </div>

          {/* 步骤1: 选择服务商 */}
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-black text-slate-800 uppercase tracking-wider">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-600 text-white text-xs shadow-lg shadow-blue-200">1</span>
              选择 API 服务商
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {API_PROVIDERS.map((provider) => (
                <button
                  key={provider.name}
                  onClick={() => setProvider(provider.name)}
                  className={`px-4 py-3 text-sm rounded-2xl border-2 transition-all duration-300 font-bold ${
                    providerName === provider.name
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md shadow-blue-100 scale-[1.02]'
                      : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* 步骤2: API地址 + Key */}
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-black text-slate-800 uppercase tracking-wider">
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-600 text-white text-xs shadow-lg shadow-indigo-200">2</span>
              填写连接信息
            </label>

            <div className="space-y-4">
              {/* API地址 */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API 地址 (Base URL)</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  disabled={!isCustom}
                  placeholder="https://api.openai.com"
                  className={`w-full px-5 py-4 text-sm border-2 rounded-[1.25rem] focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium ${
                    !isCustom
                      ? 'bg-slate-50 text-slate-400 border-slate-100'
                      : 'bg-white text-slate-800 border-slate-100 focus:border-blue-400'
                  }`}
                />
                {!isCustom && (
                  <p className="mt-1.5 text-[10px] font-bold text-blue-500 uppercase tracking-wider ml-1">选择"自定义"可修改地址</p>
                )}
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API Key</label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-5 py-4 text-sm border-2 border-slate-100 rounded-[1.25rem] bg-white text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all font-medium"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                  {providerName === 'OpenAI' && '在 platform.openai.com 获取'}
                  {providerName === 'DeepSeek' && '在 platform.deepseek.com 获取'}
                  {providerName === '通义千问' && '在 dashscope.aliyuncs.com 获取'}
                  {providerName === '智谱AI' && '在 open.bigmodel.cn 获取'}
                  {providerName === 'Moonshot' && '在 platform.moonshot.cn 获取'}
                </p>
              </div>
            </div>
          </div>

          {/* 连接按钮 - 更加醒目且具备兜底样式 */}
          <div className="pt-4 pb-2">
            <button
              onClick={handleConnect}
              disabled={!canConnect}
              className={`w-full py-5 text-lg font-black rounded-[1.5rem] transition-all flex items-center justify-center gap-3 group border-2 ${
                canConnect 
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white border-transparent shadow-xl shadow-indigo-200/50 hover:scale-[1.02] active:scale-[0.98]' 
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              style={canConnect ? { background: 'linear-gradient(to right, #2563eb, #4f46e5, #9333ea)', color: 'white' } : { backgroundColor: '#f3f4f6', color: '#9ca3af' }}
            >
              {fetchingModels ? (
                <>
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="uppercase tracking-widest">正在连接...</span>
                </>
              ) : (
                <>
                  <svg className={`w-6 h-6 ${canConnect ? 'group-hover:rotate-12 transition-transform' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="uppercase tracking-widest">{canConnect ? '连接并获取模型列表' : '请先填写 API Key'}</span>
                </>
              )}
            </button>
            
            {!canConnect && !fetchingModels && (
              <p className="mt-3 text-center text-[11px] font-bold text-red-500 bg-red-50 py-2 rounded-xl border border-red-100 animate-pulse">
                提示：必须填写 API Key 后才能点击此按钮
              </p>
            )}

            {/* 连接状态 */}
            {connectionStatus.message && (
              <div
                className={`mt-4 p-4 rounded-[1.25rem] text-sm font-bold flex items-start gap-3 border-2 transition-all animate-in fade-in slide-in-from-top-2 ${
                  connectionStatus.success === true
                    ? 'bg-green-50 text-green-700 border-green-100 shadow-sm shadow-green-100'
                    : connectionStatus.success === false
                      ? 'bg-red-50 text-red-700 border-red-100 shadow-sm shadow-red-100'
                      : 'bg-slate-50 text-slate-600 border-slate-100'
                }`}
              >
                {connectionStatus.success === true && (
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 text-white">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {connectionStatus.success === false && (
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 text-white">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
                <p className="leading-relaxed">{connectionStatus.message}</p>
              </div>
            )}
          </div>

          {/* 步骤3: 选择模型（连接成功后显示） */}
          {isConnected && (
            <div className="space-y-4 animate-in zoom-in-95 duration-300">
              <label className="flex items-center gap-2 text-sm font-black text-slate-800 uppercase tracking-wider">
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-purple-600 text-white text-xs shadow-lg shadow-purple-200">3</span>
                选择模型
              </label>
              <div className="relative">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-5 py-4 text-sm border-2 border-slate-100 rounded-[1.25rem] bg-white text-slate-800 focus:outline-none focus:ring-4 focus:ring-purple-100 focus:border-purple-400 transition-all font-bold appearance-none cursor-pointer"
                >
                  <option value="">-- 请选择模型 --</option>
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className="mt-1.5 text-[10px] font-bold text-purple-500 uppercase tracking-wider ml-1">
                共 {availableModels.length} 个可用模型
              </p>
            </div>
          )}

          {/* 查词设置 */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">查词设置</h3>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">查词来源优先级</label>
              <div className="flex gap-2">
                {['auto', 'local', 'online'].map((source) => (
                  <button
                    key={source}
                    onClick={() => setDictSource(source as any)}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl border-2 transition-all ${
                      dictSource === source
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-slate-100 bg-white text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {source === 'auto' ? '自动' : source === 'local' ? '仅本地' : '仅在线'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 词典管理 */}
          <div className="pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-3xl border border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">词典资源</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">管理本地离线词典库</p>
              </div>
              <button
                onClick={() => {
                  onClose()
                  onOpenDictManager?.()
                }}
                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-600 bg-white rounded-xl shadow-sm border border-blue-100 hover:bg-blue-50 transition-all"
              >
                管理词典
              </button>
            </div>
          </div>

          {/* 版本与更新 */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div 
                onClick={() => {
                  const newCount = clickCount + 1
                  setClickCount(newCount)
                  if (newCount >= 7) {
                    setShowDevTools(true)
                    setClickCount(0)
                  }
                }}
                className="cursor-pointer active:opacity-50"
              >
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">版本信息</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">当前版本: v{currentVersion}</p>
              </div>
              <button
                onClick={checkUpdate}
                disabled={isChecking}
                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all disabled:opacity-50"
              >
                {isChecking ? '正在检查...' : '检查更新'}
              </button>
            </div>

            {showDevTools && (
              <div className="p-4 bg-slate-900 rounded-3xl text-white space-y-4 animate-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">开发者工具 (Logs)</h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={clearLogs}
                      className="px-3 py-1 text-[10px] font-bold bg-slate-800 rounded-lg hover:bg-slate-700"
                    >
                      清除日志
                    </button>
                    <button 
                      onClick={() => setShowDevTools(false)}
                      className="px-3 py-1 text-[10px] font-bold bg-red-900/50 text-red-200 rounded-lg hover:bg-red-900"
                    >
                      关闭
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 font-mono text-[10px] custom-scrollbar bg-black/30 p-3 rounded-xl">
                  {logs.length === 0 ? (
                    <p className="text-slate-500 italic">暂无日志...</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className={`border-b border-white/5 pb-1 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-300' : 'text-slate-300'}`}>
                        <span className="opacity-40 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className="whitespace-pre-wrap break-all">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {hasUpdate && latestVersion && (
              <div className="p-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl text-white shadow-lg shadow-indigo-200/50 animate-in zoom-in-95">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest">发现新版本 v{latestVersion.version}</span>
                  <span className="text-[10px] font-bold opacity-70">{latestVersion.date}</span>
                </div>
                <p className="text-xs font-medium leading-relaxed mb-4 opacity-90">{latestVersion.notes}</p>
                <button
                  onClick={applyUpdate}
                  className="w-full py-3 bg-white text-indigo-600 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-50 transition-all shadow-md"
                >
                  立即更新并重启
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-4 px-6 md:px-8 py-6 md:py-8 border-t border-slate-50 bg-slate-50/30">
          <button
            onClick={onClose}
            className="flex-1 py-4 text-sm font-black uppercase tracking-widest bg-white text-slate-400 rounded-[1.25rem] border-2 border-slate-100 hover:bg-slate-50 hover:text-slate-600 transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!model}
            className="flex-1 py-4 text-sm font-black uppercase tracking-widest bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-[1.25rem] shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:shadow-none"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  )
}