import { useState, useEffect } from 'react'
import { dbService } from '../services/database'

interface DictionaryManagerProps {
  onComplete?: () => void
  forceShow?: boolean
  onClose?: () => void
}

export default function DictionaryManager({ onComplete, forceShow, onClose }: DictionaryManagerProps) {
  const [status, setStatus] = useState<'checking' | 'missing' | 'downloading' | 'ready' | 'error'>('checking')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<string>('未知')

  useEffect(() => {
    if (forceShow) {
      setStatus('missing')
    } else {
      checkStatus()
    }
  }, [forceShow])

  const checkStatus = async () => {
    try {
      console.log('[DictionaryManager] 正在检查词典状态...')
      
      // 尝试初始化数据库服务
      await dbService.init()
      
      if (dbService.isDictLoaded()) {
        console.log('[DictionaryManager] 词典已加载')
        setStatus('ready')
        onComplete?.()
        return
      }

      setStatus('missing')
    } catch (err) {
      console.error('[DictionaryManager] 检查词典状态失败:', err)
      setStatus('error')
      setError('数据库初始化失败，请检查网络或重试')
    }
  }

  const startDownload = async (type: 'lite' | 'full' = 'lite') => {
    setStatus('downloading')
    setProgress(0)
    setError(null)

    // 尝试多个下载地址
    const urls = [
      type === 'lite' ? '/stardict.db' : '/stardict_full.db', // 优先尝试本地打包的
      // 移除本地后端地址，确保 App 独立性
      // 如果未来有公网 CDN，可以在此添加
    ]

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
          try {
            await dbService.importDictDb(data)
            setStatus('ready')
            onComplete?.()
          } catch (err: any) {
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
        setError('词典资源加载失败。请确保应用安装完整，或检查网络连接。')
        setStatus('error')
      }
    }

    attemptDownload(urls[0])
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
        {/* 顶部关闭按钮 (仅在强制显示或就绪时显示) */}
        {(forceShow || status === 'ready') && (
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
            {status === 'missing' && '本地未发现词典文件。您可以下载精简版以支持离线查词，或直接使用在线查词功能。'}
            {status === 'downloading' && `正在从云端获取资源 (${fileSize})...`}
            {status === 'error' && '资源获取失败'}
          </p>
        </div>

        {status === 'missing' && (
          <div className="space-y-3">
            <button
              onClick={() => startDownload('lite')}
              className="w-full p-4 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-2xl text-left transition-all group"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-bold text-blue-900">下载精简版 (推荐)</h3>
                <span className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded-full">2.4MB</span>
              </div>
              <p className="text-xs text-blue-700/70">包含中高考、四六级核心词汇，支持离线使用。</p>
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-sm font-semibold transition-all"
            >
              暂不下载，使用在线查词
            </button>
            
            <div className="pt-2">
              <p className="text-[10px] text-gray-400">在线查词将使用有道词典接口</p>
            </div>
          </div>
        )}

        {status === 'downloading' && (
          <div className="space-y-4">
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>下载进度</span>
              <span className="font-mono font-bold text-blue-600">{progress}%</span>
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