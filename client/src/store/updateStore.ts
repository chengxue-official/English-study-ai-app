import { create } from 'zustand'

interface VersionInfo {
  version: string
  releaseDate: string
  description: string
  downloadUrl?: string
}

interface UpdateState {
  currentVersion: string
  latestVersion: VersionInfo | null
  isChecking: boolean
  hasUpdate: boolean
  updateError: string | null

  checkUpdate: () => Promise<void>
  applyUpdate: () => void
}

// 当前硬编码的版本号，实际构建时可以通过环境变量注入
const CURRENT_VERSION = '0.1.0'

export const useUpdateStore = create<UpdateState>((set, get) => ({
  currentVersion: CURRENT_VERSION,
  latestVersion: null,
  isChecking: false,
  hasUpdate: false,
  updateError: null,

  checkUpdate: async () => {
    set({ isChecking: true, updateError: null })
    try {
      // 在实际发布时，这里应该指向 GitHub Pages 或 CDN 上的 version.json
      // 开发环境下我们先请求本地的，模拟检查过程
      const response = await fetch('/version.json?t=' + Date.now())
      if (!response.ok) throw new Error('无法获取版本信息')
      
      const latest: VersionInfo = await response.json()
      
      const hasUpdate = compareVersions(CURRENT_VERSION, latest.version) < 0
      
      set({
        latestVersion: latest,
        hasUpdate,
        isChecking: false
      })
    } catch (err: any) {
      set({
        isChecking: false,
        updateError: err.message || '检查更新失败'
      })
    }
  },

  applyUpdate: () => {
    const { latestVersion } = get()
    if (latestVersion?.downloadUrl) {
      window.open(latestVersion.downloadUrl, '_blank')
    } else {
      // 对于 Web 应用，最简单的热更新就是强制刷新页面
      window.location.reload()
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