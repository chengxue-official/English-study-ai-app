import { create } from 'zustand'
import { dbService } from '../services/database'
import { llmService } from '../services/llm'
import { useConfigStore } from './configStore'

export interface PhraseMatch {
  phrase: string
  translation: string
  startIndex: number
  endIndex: number
  words: string[]
}

export interface ParagraphPhrases {
  paragraphIndex: number
  phrases: PhraseMatch[]
}

interface PhraseState {
  phraseResults: ParagraphPhrases[]
  scanning: boolean
  scanProgress: number
  error: string | null
  enabled: boolean
  selectedPhrase: PhraseMatch | null
  selectedSourceSentence: string | null
  selectedSourceTranslation: string | null

  scanPhrases: (paragraphs: string[], translations: string[], forceRefresh?: boolean) => Promise<void>
  clearPhrases: () => void
  setEnabled: (enabled: boolean) => void
  selectPhrase: (phrase: PhraseMatch, sentence: string, translation: string) => void
  clearSelection: () => void
}

/**
 * 简单的字符串哈希函数
 */
function generateHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return (hash >>> 0).toString(36) + str.length.toString(36)
}

export const usePhraseStore = create<PhraseState>((set, get) => ({
  phraseResults: [],
  scanning: false,
  scanProgress: 0,
  error: null,
  enabled: false,
  selectedPhrase: null,
  selectedSourceSentence: null,
  selectedSourceTranslation: null,

  scanPhrases: async (paragraphs: string[], translations: string[], forceRefresh?: boolean) => {
    console.log(`[Phrases] 开始扫描词组, 段落数: ${paragraphs.length}, forceRefresh: ${!!forceRefresh}`)
    
    if (get().scanning && !forceRefresh) return
    
    set({ scanning: true, scanProgress: 0, error: null, ...(forceRefresh ? { phraseResults: [], enabled: false } : {}) })
    
    try {
      const results: ParagraphPhrases[] = []
      let llmCallCount = 0

      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i]
        if (!text || text.trim().length === 0) {
          set({ scanProgress: Math.round(((i + 1) / paragraphs.length) * 100) })
          continue
        }

        try {
          console.log(`[Phrases] 正在扫描段落 ${i}...`)
          
          // 1. 首先尝试本地数据库扫描
          let phrases = await dbService.scanPhrases(text)
          
          // 2. 如果强制刷新，或者本地没搜到，且配置了API Key，则尝试LLM扫描
          const { apiKey } = useConfigStore.getState().getConfig()
          if ((forceRefresh || phrases.length === 0) && apiKey) {
            const normalizedText = text.trim().toLowerCase().replace(/\s+/g, ' ')
            const textHash = generateHash(normalizedText)
            const cacheKey = `phrases_v1:${textHash}`
            
            let llmPhrases: any[] | null = null
            
            // 检查缓存
            if (!forceRefresh) {
              const cached = await dbService.getSentenceAnalysis(cacheKey)
              if (cached && Array.isArray(cached)) {
                llmPhrases = cached
              }
            }
            
            if (llmPhrases === null) {
              console.log(`[Phrases] 调用LLM扫描段落 ${i}...`)
              llmCallCount++
              const rawLlmPhrases = await llmService.scanPhrases(text, translations[i])
              
              // 在原文中定位LLM发现的词组
              const cleanText = text.replace(/[^a-zA-Z\s'-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
              const allWords = cleanText.split(' ').filter((w: string) => w.length > 0)
              
              llmPhrases = rawLlmPhrases.map(p => {
                const phraseWords = p.phrase.toLowerCase().split(' ').filter((w: string) => w.length > 0)
                if (phraseWords.length === 0) return null
                
                // 简单的滑动窗口匹配
                for (let j = 0; j <= allWords.length - phraseWords.length; j++) {
                  let match = true
                  for (let k = 0; k < phraseWords.length; k++) {
                    if (allWords[j + k] !== phraseWords[k]) {
                      // 尝试模糊匹配（处理复数、时态等）
                      const w1 = allWords[j + k].replace(/(?:ed|es|s|ing|ly|er|est)$/, '')
                      const w2 = phraseWords[k].replace(/(?:ed|es|s|ing|ly|er|est)$/, '')
                      if (w1 !== w2) {
                        match = false
                        break
                      }
                    }
                  }
                  
                  if (match) {
                    return {
                      phrase: p.phrase,
                      translation: p.meaning,
                      startIndex: j,
                      endIndex: j + phraseWords.length,
                      words: allWords.slice(j, j + phraseWords.length)
                    }
                  }
                }
                return null
              }).filter(p => p !== null)
              
              // 保存到缓存
              await dbService.saveSentenceAnalysis(cacheKey, text, llmPhrases, true)
            }
            
            // 合并本地和LLM结果，去重
            const existingPhrases = new Set(phrases.map(p => `${p.startIndex}-${p.endIndex}`))
            for (const lp of llmPhrases) {
              if (!existingPhrases.has(`${lp.startIndex}-${lp.endIndex}`)) {
                phrases.push(lp)
              }
            }
            phrases.sort((a, b) => a.startIndex - b.startIndex)
          }

          console.log(`[Phrases] 段落 ${i} 扫描完成, 最终发现 ${phrases.length} 个词组`)
          if (phrases.length > 0) {
            results.push({
              paragraphIndex: i,
              phrases,
            })
          }
        } catch (err) {
          console.warn(`[Phrases] 段落${i}扫描错误:`, err)
        }
        
        set({ scanProgress: Math.round(((i + 1) / paragraphs.length) * 100) })
      }

      if (llmCallCount > 0) {
        await dbService.forceSaveCacheDb()
      }

      set({ phraseResults: results, scanning: false, scanProgress: 100, enabled: true })
      const totalPhrases = results.reduce((s, r) => s + r.phrases.length, 0)
      console.log(`[Phrases] 扫描完成，总计发现 ${totalPhrases} 个词组`)
      
      if (totalPhrases === 0) {
        set({ error: '未在文中发现匹配的词组' })
        setTimeout(() => set({ error: null }), 3000)
      }
    } catch (err) {
      console.error('[Phrases] 扫描失败:', err)
      set({ scanning: false, error: '词组扫描失败' })
    }
  },

  clearPhrases: () => {
    set({ phraseResults: [], enabled: false })
  },

  setEnabled: (enabled: boolean) => {
    const state = get()
    if (!enabled) {
      set({ enabled: false })
    } else if (state.phraseResults.length > 0) {
      set({ enabled: true })
    }
  },

  selectPhrase: (phrase: PhraseMatch, sentence: string, translation: string) => {
    set({
      selectedPhrase: phrase,
      selectedSourceSentence: sentence,
      selectedSourceTranslation: translation,
    })
  },

  clearSelection: () => {
    set({
      selectedPhrase: null,
      selectedSourceSentence: null,
      selectedSourceTranslation: null,
    })
  },
}))