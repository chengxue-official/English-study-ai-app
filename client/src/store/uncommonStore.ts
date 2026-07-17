import { create } from 'zustand'
import { useConfigStore } from './configStore'
import { dbService } from '../services/database'
import { llmService } from '../services/llm'

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
      const { apiKey } = useConfigStore.getState().getConfig()
      if (!apiKey) {
        set({ scanning: false, error: '请先在设置中配置API Key' })
        return
      }

      const results: ParagraphUncommon[] = []

      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i]
        if (!text || text.trim().length === 0) continue

        try {
          const textHash = text.trim().toLowerCase().replace(/\s+/g, ' ')
          const cacheKey = `uncommon_v2:${textHash}`
          let wordsWithPosition: UncommonWord[] = []

          // 1. 查缓存
          if (!forceRefresh) {
            const cached = await dbService.getSentenceAnalysis(cacheKey)
            if (cached && Array.isArray(cached)) {
              console.log(`[Cache] 命中熟词生义缓存: ${textHash.slice(0, 30)}...`)
              wordsWithPosition = cached
            }
          }

          // 2. 调用LLM
          if (wordsWithPosition.length === 0) {
            const words = await llmService.scanUncommonMeanings(text, translations[i])
            
            // 在原文中定位每个熟词生义的位置
            const cleanText = text.replace(/[^a-zA-Z\s'-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
            const allWords = cleanText.split(' ').filter(w => w.length > 0)
            
            wordsWithPosition = words.map(w => {
              const wordLower = w.word.toLowerCase()
              // 在cleanText的单词数组中查找匹配位置
              const wordIdx = allWords.indexOf(wordLower)
              if (wordIdx >= 0) {
                return {
                  ...w,
                  startIndex: wordIdx,
                  endIndex: wordIdx + 1,
                }
              }
              // 尝试词形匹配
              for (let j = 0; j < allWords.length; j++) {
                const aw = allWords[j]
                if (aw === wordLower ||
                    aw.replace(/(?:ed|es|s|ing|ly|er|est)$/, '') === wordLower.replace(/(?:ed|es|s|ing|ly|er|est)$/, '') ||
                    aw.replace(/ied$/, 'y') === wordLower.replace(/ied$/, 'y')) {
                  return {
                    ...w,
                    startIndex: j,
                    endIndex: j + 1,
                  }
                }
              }
              return null
            }).filter((w): w is UncommonWord => w !== null)

            // 3. 写缓存
            if (wordsWithPosition.length > 0) {
              await dbService.saveSentenceAnalysis(cacheKey, text, wordsWithPosition)
            }
          }

          if (wordsWithPosition.length > 0) {
            results.push({
              paragraphIndex: i,
              words: wordsWithPosition,
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