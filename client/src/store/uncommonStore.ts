import { create } from 'zustand'
import { useConfigStore } from './configStore'

// 熟词生义扫描结果
export interface UncommonWord {
  word: string
  commonMeaning: string
  contextMeaning: string
  reason: string
  startIndex: number
  endIndex: number
}

export interface ParagraphUncommon {
  paragraphIndex: number
  words: UncommonWord[]
}

interface UncommonState {
  results: ParagraphUncommon[]
  scanning: boolean
  error: string | null
  enabled: boolean
  selectedWord: UncommonWord | null
  selectedSourceSentence: string | null
  selectedSourceTranslation: string | null

  scanUncommonMeanings: (paragraphs: string[], translations: string[], forceRefresh?: boolean) => Promise<void>
  clearUncommon: () => void
  setEnabled: (enabled: boolean) => void
  selectWord: (word: UncommonWord, sentence: string, translation: string) => void
  clearSelection: () => void
}

const API_BASE = import.meta.env.VITE_API_BASE || ''

export const useUncommonStore = create<UncommonState>((set, get) => ({
  results: [],
  scanning: false,
  error: null,
  enabled: false,
  selectedWord: null,
  selectedSourceSentence: null,
  selectedSourceTranslation: null,

  scanUncommonMeanings: async (paragraphs: string[], translations: string[], forceRefresh?: boolean) => {
    console.log(`[scanUncommonMeanings] forceRefresh=${forceRefresh}, paragraphs=${paragraphs.length}`)
    // forceRefresh时先清除旧结果，让用户看到重新生成的过程
    set({ scanning: true, error: null, ...(forceRefresh ? { results: [], enabled: false } : {}) })
    try {
      const { apiKey, apiUrl, model } = useConfigStore.getState().getConfig()
      if (!apiKey) {
        set({ scanning: false, error: '请先在设置中配置API Key' })
        return
      }

      const results: ParagraphUncommon[] = []

      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i]
        if (!text || text.trim().length === 0) continue

        try {
          const res = await fetch(`${API_BASE}/api/scan-uncommon-meanings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              translation: translations[i] || '',
              apiKey,
              apiUrl,
              model,
              forceRefresh: !!forceRefresh,
            }),
          })

          if (!res.ok) {
            console.warn(`[Uncommon] 段落${i}扫描失败: ${res.status}`)
            continue
          }

          const data = await res.json()
          console.log(`[Uncommon] 段落${i}响应: found=${data.found}, cached=${data.cached}, words=${data.words?.length || 0}`)
          if (data.found && data.words.length > 0) {
            results.push({
              paragraphIndex: i,
              words: data.words,
            })
          }
        } catch (err) {
          console.warn(`[Uncommon] 段落${i}扫描错误:`, err)
        }
      }

      set({ results, scanning: false, enabled: true })
      console.log(`[Uncommon] 扫描完成，发现 ${results.reduce((s, r) => s + r.words.length, 0)} 个熟词生义`)
    } catch (err) {
      console.error('[Uncommon] 扫描失败:', err)
      set({ scanning: false, error: '熟词生义扫描失败' })
    }
  },

  clearUncommon: () => {
    set({ results: [], enabled: false })
  },

  setEnabled: (enabled: boolean) => {
    const state = get()
    if (!enabled) {
      set({ enabled: false })
    } else if (state.results.length > 0) {
      set({ enabled: true })
    }
  },

  selectWord: (word: UncommonWord, sentence: string, translation: string) => {
    set({
      selectedWord: word,
      selectedSourceSentence: sentence,
      selectedSourceTranslation: translation,
    })
  },

  clearSelection: () => {
    set({
      selectedWord: null,
      selectedSourceSentence: null,
      selectedSourceTranslation: null,
    })
  },
}))