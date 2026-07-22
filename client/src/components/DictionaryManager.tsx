import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { dbService } from '../services/database'

interface DictionaryManagerProps {
  onComplete?: () => void
  forceShow?: boolean
  onClose?: () => void
}

export default function DictionaryManager({ onComplete, forceShow, onClose }: DictionaryManagerProps) {
  const [status, setStatus] = useState<'checking' | 'missing' | 'downloading' | 'importing' | 'ready' | 'error'>('checking')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<string>('未知')
  const [currentDictInfo, setCurrentDictInfo] = useState<string>('')
  const [installedType, setInstalledType] = useState<'lite' | 'full' | null>(null)
  const [customUrl, setCustomUrl] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  useEffect(() => {
    if (forceShow) {
      checkCurrentDict()
      setStatus('missing')
    } else {
      checkStatus()
    }
  }, [forceShow])

  const checkCurrentDict = async () => {
    if (dbService.isDictLoaded()) {
      const size = await dbService.getDictSize()
      if (size > 0) {
        const mb = (size / 1024 / 1024).toFixed(1)
        const isFull = size > 50 * 1024 * 1024
        const type = isFull ? 'Ultimate 版' : '精简版'
        setInstalledType(isFull ? 'full' : 'lite')
        setCurrentDictInfo(`当前已安装: ${type} (${mb} MB)`)
      }
    }
  }

  const checkStatus = async () => {
    try {
      console.log('[DictionaryManager] 正在检查词典状态...')
      setStatus('checking')
      
      // 尝试初始化数据库服务
      await dbService.init()
      
      if (dbService.isDictLoaded()) {
        console.log('[DictionaryManager] 词典已加载')
        setStatus('ready')
        onComplete?.()
        return
      }

      console.log('[DictionaryManager] 词典未加载，显示下载选项')
      setStatus('missing')
    } catch (err: any) {
      console.error('[DictionaryManager] 检查词典状态失败:', err)
      setStatus('error')
      setError(`初始化失败: ${err?.message || '未知错误'}`)
    }
  }

  const isSqlite = (data: Uint8Array): boolean => {
    if (data.length < 16) return false
    const magic = Array.from(data.slice(0, 15)).map(ch => String.fromCharCode(ch)).join('')
    return magic === 'SQLite format 3'
  }

  const startDownload = async (type: 'lite' | 'full' = 'lite') => {
    // 查重检查
    if (dbService.isDictLoaded()) {
      const confirm = window.confirm("本地已存在词典文件，重新下载将覆盖现有词典。是否继续？");
      if (!confirm) return;
    }

    setStatus('downloading')
    setProgress(0)
    setError(null)

    const isNative = Capacitor.isNativePlatform()
    const baseUrl = window.location.origin
    const urls: string[] = []

    if (isNative) {
      // 原生平台：优先使用云端更新站点，因为 localhost 在手机上指向手机自身，无法下载
      urls.push(type === 'lite' 
        ? 'https://english-exam-app-updates.pages.dev/stardict.db' 
        : 'https://english-exam-app-updates.pages.dev/stardict_full.db'
      )
    } else {
      // Web 平台：优先尝试当前域名下的资源
      urls.push(type === 'lite' 
        ? `${baseUrl}/stardict.db` 
        : `${baseUrl}/stardict_full.db`
      )
      // 其次尝试云端更新站点
      urls.push(type === 'lite' 
        ? 'https://english-exam-app-updates.pages.dev/stardict.db' 
        : 'https://english-exam-app-updates.pages.dev/stardict_full.db'
      )
    }

    // 无论什么平台，都可以把本地开发后端作为最后的备用（如果是 Web 平台或者局域网模拟器调试）
    if (!isNative) {
      urls.push(type === 'lite' 
        ? 'http://localhost:3001/data/stardict.db' 
        : 'http://localhost:3001/data/stardict_full.db'
      )
    }

    let currentUrlIndex = 0

    const attemptDownload = (url: string) => {
      console.log(`[DictionaryManager] 尝试从 URL 下载: ${url}`)
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.responseType = 'arraybuffer'

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          setProgress(percent)
          setFileSize(`${(event.total / 1024 / 1024).toFixed(1)} MB`)
        }
      }

      xhr.onload = async () => {
        const isSuccess = xhr.status === 200 || (xhr.status === 0 && xhr.response?.byteLength > 0)
        
        if (isSuccess) {
          const buffer = xhr.response
          if (!buffer || buffer.byteLength === 0) {
            tryNextUrl('下载的文件为空')
            return
          }

          const data = new Uint8Array(buffer)
          
          // 关键修复：在导入前先验证是否为合法的 SQLite 数据库
          if (!isSqlite(data)) {
            tryNextUrl('下载的文件不是有效的 SQLite 数据库格式（可能是 404 页面）')
            return
          }

          try {
            console.log('[DictionaryManager] 下载完成，开始导入数据库...')
            setStatus('importing')
            await dbService.importDictDb(data)
            console.log('[DictionaryManager] 数据库导入成功')
            setStatus('ready')
            checkCurrentDict()
            onComplete?.()
          } catch (err: any) {
            console.error('[DictionaryManager] 导入失败:', err)
            setError(`导入失败: ${err?.message || '未知错误'}`)
            setStatus('error')
          }
        } else {
          tryNextUrl(`HTTP ${xhr.status}`)
        }
      }

      xhr.onerror = () => tryNextUrl('网络连接错误')
      xhr.send()
    }

    const tryNextUrl = (reason: string) => {
      console.warn(`[DictionaryManager] 从 ${urls[currentUrlIndex]} 下载失败: ${reason}`)
      currentUrlIndex++
      if (currentUrlIndex < urls.length) {
        attemptDownload(urls[currentUrlIndex])
      } else {
        if (type === 'full') {
          setError('Ultimate 版词典文件较大 (616MB)，无法直接从云端下载。建议点击下方“手动导入”，或在电脑上下载后传输到手机导入。')
        } else {
          setError('精简版词典下载失败。请检查网络连接，或尝试手动导入。')
        }
        setStatus('error')
      }
    }

    attemptDownload(urls[0])
  }

  const startCustomDownload = async () => {
    if (!customUrl.trim()) {
      alert('请输入有效的下载链接')
      return
    }
    
    setStatus('downloading')
    setProgress(0)
    setError(null)
    
    const attemptDownload = (url: string) => {
      console.log(`[DictionaryManager] 尝试从自定义 URL 下载: ${url}`)
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.responseType = 'arraybuffer'

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          setProgress(percent)
          setFileSize(`${(event.total / 1024 / 1024).toFixed(1)} MB`)
        }
      }

      xhr.onload = async () => {
        const isSuccess = xhr.status === 200 || (xhr.status === 0 && xhr.response?.byteLength > 0)
        
        if (isSuccess) {
          const buffer = xhr.response
          if (!buffer || buffer.byteLength === 0) {
            setError('下载的文件为空')
            setStatus('error')
            return
          }

          const data = new Uint8Array(buffer)
          
          if (!isSqlite(data)) {
            setError('下载的文件不是有效的 SQLite 数据库格式（可能是 404 页面或网页）')
            setStatus('error')
            return
          }

          try {
            console.log('[DictionaryManager] 下载完成，开始导入数据库...')
            setStatus('importing')
            await dbService.importDictDb(data)
            console.log('[DictionaryManager] 数据库导入成功')
            setStatus('ready')
            checkCurrentDict()
            onComplete?.()
          } catch (err: any) {
            console.error('[DictionaryManager] 导入失败:', err)
            setError(`导入失败: ${err?.message || '未知错误'}`)
            setStatus('error')
          }
        } else {
          setError(`下载失败: HTTP ${xhr.status}`)
          setStatus('error')
        }
      }

      xhr.onerror = () => {
        setError('网络连接错误，请检查链接是否支持跨域(CORS)或网络是否正常')
        setStatus('error')
      }
      xhr.send()
    }

    attemptDownload(customUrl.trim())
  }

  const handleManualImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setStatus('importing')
    setError(null)
    
    try {
      console.log(`[DictionaryManager] 开始手动导入文件: ${file.name}, 大小: ${file.size}`)
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer
          if (!buffer) throw new Error('读取文件失败')
          
          const data = new Uint8Array(buffer)
          await dbService.importDictDb(data)
          console.log('[DictionaryManager] 手动导入成功')
          setStatus('ready')
          checkCurrentDict()
          onComplete?.()
        } catch (err: any) {
          console.error('[DictionaryManager] 手动导入失败:', err)
          setError(`导入失败: ${err?.message || '未知错误'}`)
          setStatus('error')
        }
      }
      reader.onerror = () => {
        setError('读取文件出错')
        setStatus('error')
      }
      reader.readAsArrayBuffer(file)
    } catch (err: any) {
      setError(`导入失败: ${err?.message || '未知错误'}`)
      setStatus('error')
    }
  }

  const handleClose = () => {
    if (status === 'ready' || status === 'error' || status === 'missing') {
      onClose?.()
    }
  }

  if (status === 'ready' && !forceShow) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" onClick={handleClose}>
      <div 
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 text-center border border-gray-100 animate-in fade-in slide-in-from-bottom-10 duration-300 relative"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部关闭按钮 (仅在强制显示或就绪或错误时显示) */}
        {(forceShow || status === 'ready' || status === 'error' || status === 'missing') && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className="mb-6">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3 shadow-inner">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">词典资源管理</h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            {status === 'checking' && '正在检查本地资源，请稍候...'}
            {status === 'missing' && (dbService.isDictLoaded() 
              ? (currentDictInfo || '您已安装词典，可以在此切换版本或重新下载。')
              : '本地未发现词典文件。您可以从云端下载精简版以支持离线查词，或直接使用在线查词功能。')}
            {status === 'downloading' && `正在从云端获取资源 (${fileSize})...`}
            {status === 'importing' && '正在处理词典数据库，请勿关闭应用...'}
            {status === 'ready' && '词典资源已就绪，您可以开始使用了。'}
            {status === 'error' && '资源获取失败'}
          </p>
        </div>

        {status === 'ready' && (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <button
              onClick={handleClose}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all transform active:scale-[0.98]"
            >
              开始使用
            </button>
          </div>
        )}

        {status === 'missing' && (
          <div className="space-y-3">
            <button
              onClick={() => startDownload('lite')}
              className={`w-full p-4 border rounded-2xl text-left transition-all group ${installedType === 'lite' ? 'bg-blue-100 border-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-100'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-bold text-blue-900">
                  {installedType === 'lite' ? '重新下载' : '下载'}精简版 (推荐)
                  {installedType === 'lite' && <span className="ml-2 text-[10px] text-blue-600 font-normal">(已安装)</span>}
                </h3>
                <span className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded-full">2.4MB</span>
              </div>
              <p className="text-xs text-blue-700/70">包含中高考、四六级核心词汇（约7400词），支持离线使用。</p>
            </button>

            <button
              onClick={() => startDownload('full')}
              className={`w-full p-4 border rounded-2xl text-left transition-all group ${installedType === 'full' ? 'bg-purple-100 border-purple-300' : 'bg-purple-50 hover:bg-purple-100 border-purple-100'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-bold text-purple-900">
                  {installedType === 'full' ? '重新下载' : '下载'} Ultimate 版
                  {installedType === 'full' && <span className="ml-2 text-[10px] text-purple-600 font-normal">(已安装)</span>}
                </h3>
                <span className="text-[10px] px-2 py-0.5 bg-purple-600 text-white rounded-full">616MB</span>
              </div>
              <p className="text-xs text-purple-700/70">包含 432万 词条，涵盖所有生僻词。建议在 Wi-Fi 环境下下载。</p>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => window.open('https://github.com/skywind3000/ECDICT-ultimate/releases', '_blank')}
                className="p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-2xl text-left transition-all group"
              >
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs font-bold text-indigo-900">Ultimate (GitHub)</h3>
                </div>
                <p className="text-[10px] text-indigo-700/70 leading-tight">从 GitHub 获取最新 Ultimate 版资源。</p>
              </button>

              <label className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-2xl text-left transition-all cursor-pointer group">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs font-bold text-emerald-900">手动导入</h3>
                </div>
                <p className="text-[10px] text-emerald-700/70 leading-tight">选择本地 .db 文件导入词典数据库。</p>
                <input 
                  type="file" 
                  accept=".db" 
                  className="hidden" 
                  onChange={handleManualImport}
                />
              </label>
            </div>

            <div className="mt-1">
              <button
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center justify-center gap-1 mx-auto py-1"
              >
                <svg className={`w-3 h-3 transition-transform ${showCustomInput ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
                {showCustomInput ? '收起自定义下载' : '使用自定义链接下载'}
              </button>
              
              {showCustomInput && (
                <div className="mt-2 p-3 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <input
                    type="text"
                    placeholder="请输入 .db 文件的直链下载地址"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={startCustomDownload}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    开始下载
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-sm font-semibold transition-all"
            >
              暂不下载，使用在线查词
            </button>
          </div>
        )}

        {(status === 'downloading' || status === 'importing') && (
          <div className="space-y-4">
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ease-out ${status === 'importing' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-600'}`}
                style={{ width: `${status === 'importing' ? 100 : progress}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>{status === 'importing' ? '正在导入并保存到本地...' : '下载进度'}</span>
              <span className="font-mono font-bold text-blue-600">{status === 'importing' ? '请稍候' : `${progress}%`}</span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-xl text-red-600 text-sm">
              {error || '未知错误'}
            </div>
            <button
              onClick={checkStatus}
              className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-semibold transition-colors"
            >
              重试
            </button>
          </div>
        )}

        {status === 'checking' && (
          <div className="flex justify-center py-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
