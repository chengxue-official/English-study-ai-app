import { create } from 'zustand'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { Capacitor } from '@capacitor/core'

interface VersionInfo {
  version: string
  date: string
  notes: string
  url: string // 更新包的下载地址
}

interface UpdateState {
  currentVersion: string
  latestVersion: VersionInfo | null
  isChecking: boolean
  hasUpdate: boolean
  updateError: string | null
  isDownloading: boolean
  downloadProgress: number

  checkUpdate: () => Promise<void>
  applyUpdate: () => Promise<void>
}

// 当前版本号，应与 package.json 保持一致
const CURRENT_VERSION = '0.1.1'

// 远程更新服务器的基础地址
// Cloudflare Pages 格式: 'https://<project-name>.pages.dev'
const REMOTE_UPDATE_BASE_URL = 'https://english-exam-app-updates.pages.dev' 

export const useUpdateStore = create<UpdateState>((set, get) => ({
  currentVersion: CURRENT_VERSION,
  latestVersion: null,
  isChecking: false,
  hasUpdate: false,
  updateError: null,
  isDownloading: false,
  downloadProgress: 0,

  checkUpdate: async () => {
    console.log('[UpdateStore] Starting checkUpdate...')
    set({ isChecking: true, updateError: null })
    try {
      // 在 Capacitor 环境下，必须使用绝对路径请求远程服务器
      const updateUrl = `${REMOTE_UPDATE_BASE_URL}/version.json?t=${Date.now()}`
      console.log('[UpdateStore] Fetching version from:', updateUrl)
      const response = await fetch(updateUrl)
      if (!response.ok) {
        console.error('[UpdateStore] Fetch failed with status:', response.status)
        throw new Error(`无法获取版本信息 (${response.status})`)
      }
      
      const latest: VersionInfo = await response.json()
      console.log('[UpdateStore] Latest version info:', latest)
      
      const hasUpdate = compareVersions(CURRENT_VERSION, latest.version) < 0
      console.log(`[UpdateStore] Comparison: current=${CURRENT_VERSION}, latest=${latest.version}, hasUpdate=${hasUpdate}`)
      
      set({
        latestVersion: latest,
        hasUpdate,
        isChecking: false
      })
    } catch (err: any) {
      console.error('[UpdateStore] checkUpdate error:', err)
      set({
        isChecking: false,
        updateError: err.message || '检查更新失败'
      })
    }
  },

  applyUpdate: async () => {
    const { latestVersion } = get()
    if (!latestVersion?.url) {
      // 如果没有 URL，可能是 Web 环境下的简单刷新
      if (!Capacitor.isNativePlatform()) {
        window.location.reload()
      }
      return
    }

    if (Capacitor.isNativePlatform()) {
      try {
        set({ isDownloading: true, downloadProgress: 0, updateError: null })
        
        // 监听下载进度
        const listener = await CapacitorUpdater.addListener('download', (info: any) => {
          set({ downloadProgress: Math.round(info.percent) })
        })

        // 下载更新包
        const version = await CapacitorUpdater.download({
          url: latestVersion.url,
          version: latestVersion.version,
        })

        // 移除监听器
        listener.remove()

        // 应用更新并重启 WebView
        await CapacitorUpdater.set({ id: version.id })
      } catch (err: any) {
        set({ 
          isDownloading: false, 
          updateError: err.message || '下载更新失败' 
        })
      }
    } else {
      // Web 环境下直接打开链接
      window.open(latestVersion.url, '_blank')
    }
  }
}))

/**
 * 版本号比较函数
 * 返回 -1: v1 < v2
 * 返回 0: v1 == v2
 * 返回 1: v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 < p2) return -1
    if (p1 > p2) return 1
  }
  return 0
}