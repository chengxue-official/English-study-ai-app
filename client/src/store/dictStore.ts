import { create } from 'zustand'
import { useConfigStore } from './configStore'

export interface WordDetail {
  word: string
  phonetic: string
  definition: string
  translation: string
  pos: string
  collins: number
  oxford: number
  tags: string[]
  bnc: number | null
  frq: number | null
  exchange: Record<string, string[]>
  searchedForm?: string
}

export interface WordUsage {
  collocations: { en: string; zh: string }[]
  phrases: { en: string; zh: string }[]
  usage: { point: string; example: string; translation: string }[]
  cached?: boolean  // 是否来自本地缓存
}

/** 单词在上下文中的释义信息 */
export interface WordContextInfo {
  matchedIndex: number   // 最匹配的释义序号（对应翻译列表索引，-1表示无匹配）
  contextMeaning: string // 在此语境下的简明中文释义
  phrase: {              // 所属词组信息（null表示不属于词组）
    text: string         // 词组完整文本
    meaning: string      // 词组中文释义
    words: string[]      // 词组中每个词
  } | null
  cached?: boolean
}

/**
 * 本地匹配：用译文句子中的关键词匹配词典释义
 * 返回匹配到的释义索引，-1表示未匹配
 */
function localMatchTranslation(translations: string[], contextTranslation: string): number {
  if (!contextTranslation || translations.length === 0) return -1

  // 从每个释义中提取核心中文词（去掉词性标注如"n."、"adj."等）
  const extractKeywords = (text: string): string[] => {
    // 去掉词性标注前缀
    const cleaned = text.replace(/^[a-z]+\.\s*/i, '').trim()
    // 按中文标点/分号/逗号分割，取每个部分的第一个中文词组
    const parts = cleaned.split(/[；;，,、]/)
    return parts.map(p => p.trim()).filter(p => p.length > 0)
  }

  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < translations.length; i++) {
    const keywords = extractKeywords(translations[i])
    let score = 0
    for (const kw of keywords) {
      if (kw.length >= 2 && contextTranslation.includes(kw)) {
        // 匹配到的关键词越长，权重越高
        score += kw.length
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  // 至少匹配到一个2字以上的关键词才算有效
  return bestScore >= 2 ? bestIndex : -1
}

interface DictState {
  loading: boolean
  currentWord: WordDetail | null
  notFound: string | null
  error: string | null

  // 搭配/短语/用法
  usageLoading: boolean
  wordUsage: WordUsage | null
  usageError: string | null

  // 上下文释义
  contextLoading: boolean
  contextInfo: WordContextInfo | null
  contextError: string | null
  lastContextParams: { word: string; sentence: string; translation: string } | null

  // 上下文句子和译文（点击查词时保存，用于本地匹配和手动AI分析）
  contextSentence: string
  contextTranslation: string
  localMatchedIndex: number  // 本地匹配的释义索引，-1表示未匹配

  lookupWord: (word: string) => Promise<void>
  clearWord: () => void
  lookupUsage: (word: string, forceRefresh?: boolean) => Promise<void>
  clearUsage: () => void
  setContext: (sentence: string, translation: string) => void
  lookupContext: (word: string, sentence: string, translation: string, forceRefresh?: boolean) => Promise<void>
  retryContext: () => Promise<void>
}

export const useDictStore = create<DictState>((set) => ({
  loading: false,
  currentWord: null,
  notFound: null,
  error: null,

  usageLoading: false,
  wordUsage: null,
  usageError: null,

  contextLoading: false,
  contextInfo: null,
  contextError: null,
  lastContextParams: null,
  contextSentence: '',
  contextTranslation: '',
  localMatchedIndex: -1,

  lookupWord: async (word: string) => {
    const cleaned = word.toLowerCase().replace(/[^a-z'-]/g, '')
    if (!cleaned) return

    set({ loading: true, currentWord: null, notFound: null, error: null, usageLoading: false, wordUsage: null, usageError: null, contextLoading: false, contextInfo: null, contextError: null, lastContextParams: null, contextSentence: '', contextTranslation: '', localMatchedIndex: -1 })

    try {
      const res = await fetch(`/api/dictionary/${encodeURIComponent(cleaned)}`)
      const data = await res.json()

      if (data.found) {
        set({ loading: false, currentWord: data, notFound: null, error: null })
      } else {
        set({ loading: false, currentWord: null, notFound: data.word || cleaned, error: null })
      }
    } catch {
      set({ loading: false, currentWord: null, notFound: null, error: '查询失败，请检查后端服务' })
    }
  },

  clearWord: () => set({ loading: false, currentWord: null, notFound: null, error: null, usageLoading: false, wordUsage: null, usageError: null, contextLoading: false, contextInfo: null, contextError: null, lastContextParams: null, contextSentence: '', contextTranslation: '', localMatchedIndex: -1 }),

  lookupUsage: async (word: string, forceRefresh?: boolean) => {
    const cleaned = word.toLowerCase().replace(/[^a-z'-]/g, '')
    if (!cleaned) return

    // 从configStore获取API配置
    const { apiKey, apiUrl, model } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      set({ usageError: '请先在设置中配置API Key' })
      return
    }

    console.log(`[lookupUsage] word=${cleaned}, forceRefresh=${forceRefresh}`)
    set({ usageLoading: true, wordUsage: null, usageError: null })

    try {
      const res = await fetch('/api/word-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: cleaned, apiKey, apiUrl, model, forceRefresh: !!forceRefresh }),
      })
      const data = await res.json()
      console.log(`[lookupUsage] 响应: found=${data.found}, cached=${data.cached}`)

      // 防止旧请求结果覆盖：检查当前单词是否仍是请求时的单词
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) {
        return // 用户已切到其他单词，丢弃结果
      }

      if (data.found && (data.collocations || data.phrases || data.usage)) {
        set({ usageLoading: false, wordUsage: data, usageError: null })
      } else {
        set({ usageLoading: false, wordUsage: null, usageError: '未获取到搭配信息' })
      }
    } catch {
      // 同样检查当前单词，防止错误状态污染
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return
      set({ usageLoading: false, wordUsage: null, usageError: '搭配查询失败' })
    }
  },

  clearUsage: () => set({ usageLoading: false, wordUsage: null, usageError: null }),

  /** 保存上下文句子和译文，并尝试本地匹配释义 */
  setContext: (sentence: string, translation: string) => {
    const { currentWord } = useDictStore.getState()
    const translations = currentWord?.translation ? currentWord.translation.split('\n').filter(Boolean) : []
    const localMatchedIndex = localMatchTranslation(translations, translation)
    set({ contextSentence: sentence, contextTranslation: translation, localMatchedIndex, contextLoading: false, contextInfo: null, contextError: null, lastContextParams: null })
  },

  lookupContext: async (word: string, sentence: string, translation: string, forceRefresh?: boolean) => {
    const cleaned = word.toLowerCase().replace(/[^a-z'-]/g, '')
    if (!cleaned) return

    const { apiKey, apiUrl, model } = useConfigStore.getState().getConfig()
    if (!apiKey) return // 没有API Key时静默跳过，不影响基本查词

    console.log(`[lookupContext] word=${cleaned}, forceRefresh=${forceRefresh}`)
    // 保存请求参数，用于重试
    set({ contextLoading: true, contextInfo: null, contextError: null, lastContextParams: { word: cleaned, sentence, translation } })

    const doRequest = async (attempt: number): Promise<void> => {
      // 带超时的fetch（20秒超时，服务端15秒+余量）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      try {
        const res = await fetch('/api/word-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: cleaned, sentence, translation, apiKey, apiUrl, model, forceRefresh: !!forceRefresh }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        const data = await res.json()
        console.log(`[lookupContext] 响应: found=${data.found}, cached=${data.cached}, contextMeaning=${data.contextMeaning?.slice(0, 20)}`)

        // 防止旧请求结果覆盖
        const currentWord = useDictStore.getState().currentWord
        if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return

        if (data.found && data.contextMeaning) {
          set({ contextLoading: false, contextInfo: data as WordContextInfo, contextError: null })
        } else if (data.error) {
          // 服务端返回了可读错误
          set({ contextLoading: false, contextInfo: null, contextError: String(data.error) })
        } else {
          set({ contextLoading: false, contextInfo: null, contextError: null })
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId)
        // 防止旧请求结果覆盖
        const currentWord = useDictStore.getState().currentWord
        if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return

        const isTimeout = err instanceof Error && err.name === 'AbortError'
        // 超时：首次自动重试1次
        if (attempt === 0 && isTimeout) {
          console.log(`[上下文释义] 请求超时，自动重试...`)
          set({ contextLoading: true, contextInfo: null, contextError: null })
          return doRequest(1)
        }

        const errMsg = isTimeout
          ? '语境分析超时，请稍后重试'
          : `语境分析失败: ${err instanceof Error ? err.message : '网络错误'}`
        set({ contextLoading: false, contextInfo: null, contextError: errMsg })
      }
    }

    await doRequest(0)
  },

  retryContext: async () => {
    const { lastContextParams } = useDictStore.getState()
    if (!lastContextParams) return
    const { word, sentence, translation } = lastContextParams
    // 使用store方法重新调用（重置retryCount）
    useDictStore.getState().lookupContext(word, sentence, translation)
  },
}))