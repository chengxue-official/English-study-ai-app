import { useEffect } from 'react'
import { useUpdateStore } from '../store/updateStore'

export default function UpdateNotification() {
  const { hasUpdate, latestVersion, checkUpdate, applyUpdate } = useUpdateStore()

  // 自动检查更新（可选，比如每小时检查一次）
  useEffect(() => {
    checkUpdate()
  }, [checkUpdate])

  if (!hasUpdate || !latestVersion) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-white rounded-xl shadow-2xl border border-blue-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900">发现新版本 {latestVersion.version}</h3>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {latestVersion.description}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={applyUpdate}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                立即更新
              </button>
              <button
                onClick={() => useUpdateStore.setState({ hasUpdate: false })}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                稍后再说
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="h-1 bg-blue-600 w-full animate-progress"></div>
      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-progress {
          animation: progress 5s linear;
        }
      `}</style>
    </div>
  )
}