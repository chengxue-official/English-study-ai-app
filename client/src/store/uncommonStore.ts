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
  scanProgress: number
  error: string | null
  enabled: boolean
  selectedWord: UncommonWord | null
  selectedSourceSentence: string | null
  selectedSourceTranslation: string | null
  currentScanId: number // 用于取消正在进行的扫描

  scanUncommonMeanings: (paragraphs: string[], translations: string[], forceRefresh?: boolean) => Promise<void>
  clearUncommon: () => void
  setEnabled: (enabled: boolean) => void
  selectWord: (word: UncommonWord, sentence: string, translation: string) => void
  clearSelection: () => void
}

/**
 * 简单的字符串哈希函数，用于生成较短的缓存键
 */
function generateHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // 强制转换为 32 位整数
  }
  // 使用无符号右移确保正数，并附加长度以减少碰撞
  return (hash >>> 0).toString(36) + str.length.toString(36)
}

export const useUncommonStore = create<UncommonState>((set, get) => ({
  results: [],
  scanning: false,
  scanProgress: 0,
  error: null,
  enabled: false,
  selectedWord: null,
  selectedSourceSentence: null,
  selectedSourceTranslation: null,
  currentScanId: 0,

  scanUncommonMeanings: async (paragraphs: string[], translations: string[], forceRefresh?: boolean) => {
    const scanId = Date.now()
    set({ currentScanId: scanId })

    if (get().scanning && !forceRefresh) {
      console.log('[Uncommon] 正在扫描中，忽略重复请求')
      return
    }

    console.log(`[Uncommon] 开始扫描: scanId=${scanId}, forceRefresh=${!!forceRefresh}, paragraphs=${paragraphs.length}`)
    const startTime = Date.now()

    // forceRefresh时先清除旧结果，让用户看到重新生成的过程
    set({ scanning: true, scanProgress: 0, error: null, ...(forceRefresh ? { results: [], enabled: false } : {}) })
    try {
      const { apiKey } = useConfigStore.getState().getConfig()
      if (!apiKey) {
        set({ scanning: false, error: '请先在设置中配置API Key' })
        return
      }

      const results: ParagraphUncommon[] = []
      let cacheHitCount = 0
      let llmCallCount = 0

      for (let i = 0; i < paragraphs.length; i++) {
        // 检查扫描是否已被取消
        if (get().currentScanId !== scanId) {
          console.log(`[Uncommon] 扫描已取消: scanId=${scanId}`)
          return
        }

        const text = paragraphs[i]
        if (!text || text.trim().length === 0) {
          set({ scanProgress: Math.round(((i + 1) / paragraphs.length) * 100) })
          continue
        }

        try {
          // 规范化文本以生成稳定的哈希
          const normalizedText = text.trim().toLowerCase().replace(/\s+/g, ' ')
          const textHash = generateHash(normalizedText)
          const cacheKey = `uncommon_v4:${textHash}` // 升级到 v4 确保使用新的哈希逻辑
          let wordsWithPosition: UncommonWord[] | null = null

          // 1. 查缓存
          if (!forceRefresh) {
            const cached = await dbService.getSentenceAnalysis(cacheKey)
            if (cached !== null && Array.isArray(cached)) {
              console.log(`[Uncommon] 命中缓存 [段落 ${i}]: key=${cacheKey}, 结果数=${cached.length}`)
              wordsWithPosition = cached
              cacheHitCount++
            } else {
              console.log(`[Uncommon] 缓存未命中 [段落 ${i}]: key=${cacheKey}`)
            }
          }

          // 2. 调用LLM
          if (wordsWithPosition === null) {
            console.log(`[Uncommon] 调用LLM [段落 ${i}]...`)
            llmCallCount++
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

            // 3. 写缓存 (批量扫描时先不保存到磁盘，最后统一保存)
            await dbService.saveSentenceAnalysis(cacheKey, text, wordsWithPosition, true)
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
        
        set({ scanProgress: Math.round(((i + 1) / paragraphs.length) * 100) })
      }

      // 扫描结束后统一保存数据库到磁盘
      if (llmCallCount > 0) {
        console.log(`[Uncommon] 扫描结束，正在持久化 ${llmCallCount} 个新结果到磁盘...`)
        await dbService.forceSaveCacheDb()
      }

      set({ results, scanning: false, scanProgress: 100, enabled: true })
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[Uncommon] 扫描完成: 耗时 ${duration}s, 缓存命中 ${cacheHitCount}, LLM调用 ${llmCallCount}, 发现 ${results.reduce((s, r) => s + r.words.length, 0)} 个熟词生义`)
    } catch (err) {
      console.error('[Uncommon] 扫描失败:', err)
      set({ scanning: false, error: '熟词生义扫描失败' })
    }
  },

  clearUncommon: () => {
    set({ results: [], enabled: false, scanning: false, currentScanId: 0 })
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