import { create } from 'zustand'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { Capacitor } from '@capacitor/core'
import { logger } from '../services/logger'

// 声明全局变量
declare const __APP_VERSION__: string;

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

// 当前版本号，从 Vite define 中获取
const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.1'

// 远程更新服务器的基础地址
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
    logger.info('[UpdateStore] Starting checkUpdate...');
    set({ isChecking: true, updateError: null })
    try {
      const updateUrl = `${REMOTE_UPDATE_BASE_URL}/version.json?t=${Date.now()}`
      logger.info('[UpdateStore] Fetching version from:', updateUrl)
      const response = await fetch(updateUrl)
      if (!response.ok) {
        throw new Error(`无法获取版本信息 (${response.status})`)
      }
      
      const latest: VersionInfo = await response.json()
      logger.info('[UpdateStore] Latest version info:', latest)
      
      const hasUpdate = compareVersions(CURRENT_VERSION, latest.version) < 0
      logger.info(`[UpdateStore] Comparison: current=${CURRENT_VERSION}, latest=${latest.version}, hasUpdate=${hasUpdate}`)
      
      set({
        latestVersion: latest,
        hasUpdate,
        isChecking: false
      })
    } catch (err: any) {
      logger.error('[UpdateStore] checkUpdate error:', err)
      set({
        isChecking: false,
        updateError: err.message || '检查更新失败'
      })
    }
  },

  applyUpdate: async () => {
    const { latestVersion } = get()
    if (!latestVersion?.url) {
      if (!Capacitor.isNativePlatform()) {
        window.location.reload()
      }
      return
    }

    if (Capacitor.isNativePlatform()) {
      try {
        logger.info('[UpdateStore] Applying update for version:', latestVersion.version);
        set({ isDownloading: true, downloadProgress: 0, updateError: null })
        
        const listener = await CapacitorUpdater.addListener('download', (info: any) => {
          set({ downloadProgress: Math.round(info.percent) })
        })

        logger.info('[UpdateStore] Downloading update from:', latestVersion.url);
        const version = await CapacitorUpdater.download({
          url: latestVersion.url,
          version: latestVersion.version,
        })

        listener.remove()
        logger.info('[UpdateStore] Download complete, version id:', version.id);

        // 应用更新并重启 WebView
        logger.info('[UpdateStore] Calling CapacitorUpdater.set...');
        await CapacitorUpdater.set({ id: version.id })
        logger.info('[UpdateStore] CapacitorUpdater.set finished, app should reload now');
      } catch (err: any) {
        logger.error('[UpdateStore] applyUpdate error:', err);
        set({ 
          isDownloading: false, 
          updateError: err.message || '下载更新失败' 
        })
      }
    } else {
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