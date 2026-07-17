import { create } from 'zustand'
import { useConfigStore } from './configStore'
import { dbService, DictEntry } from '../services/database'
import { llmService } from '../services/llm'
import { YoudaoService } from '../services/youdao'

export type WordDetail = DictEntry

export interface WordUsage {
  collocations: { en: string; zh: string }[]
  phrases: { en: string; zh: string }[]
  usage: { point: string; example: string; translation: string }[]
  cached?: boolean  // 是否来自本地缓存
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

  // 助记
  mnemonicLoading: boolean
  wordMnemonic: string | null
  mnemonicError: string | null

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
  lookupMnemonic: (word: string, forceRefresh?: boolean) => Promise<void>
  clearMnemonic: () => void
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

  mnemonicLoading: false,
  wordMnemonic: null,
  mnemonicError: null,

  contextSentence: '',
  contextTranslation: '',
  localMatchedIndex: -1,

  lookupWord: async (word: string) => {
    const cleaned = word.toLowerCase().replace(/[^a-z'-]/g, '')
    if (!cleaned) return

    set({ loading: true, currentWord: null, notFound: null, error: null, usageLoading: false, wordUsage: null, usageError: null, contextLoading: false, contextInfo: null, contextError: null, lastContextParams: null, mnemonicLoading: false, wordMnemonic: null, mnemonicError: null, contextSentence: '', contextTranslation: '', localMatchedIndex: -1 })

    try {
      const result = await dbService.queryWord(cleaned)

      if (result.found && result.data) {
        set({ loading: false, currentWord: result.data, notFound: null, error: null })
      } else {
        // 本地未找到，尝试在线查询
        console.log(`[lookupWord] 本地未找到 ${cleaned}，尝试在线查询...`)
        const onlineResult = await YoudaoService.fetchWord(cleaned)
        if (onlineResult) {
          set({ loading: false, currentWord: onlineResult, notFound: null, error: null })
        } else {
          set({ loading: false, currentWord: null, notFound: result.word || cleaned, error: null })
        }
      }
    } catch (err: any) {
      set({ loading: false, currentWord: null, notFound: null, error: `查询失败: ${err.message || err}` })
    }
  },

  clearWord: () => set({ loading: false, currentWord: null, notFound: null, error: null, usageLoading: false, wordUsage: null, usageError: null, contextLoading: false, contextInfo: null, contextError: null, lastContextParams: null, mnemonicLoading: false, wordMnemonic: null, mnemonicError: null, contextSentence: '', contextTranslation: '', localMatchedIndex: -1 }),

  lookupUsage: async (word: string, forceRefresh?: boolean) => {
    const cleaned = word.toLowerCase().replace(/[^a-z'-]/g, '')
    if (!cleaned) return

    // 从configStore获取API配置
    const { apiKey } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      set({ usageError: '请先在设置中配置API Key' })
      return
    }

    console.log(`[lookupUsage] word=${cleaned}, forceRefresh=${forceRefresh}`)
    set({ usageLoading: true, wordUsage: null, usageError: null })

    try {
      // 1. 尝试从本地缓存获取
      if (!forceRefresh) {
        const cached = await dbService.getWordUsage(cleaned)
        if (cached) {
          set({ usageLoading: false, wordUsage: { ...cached, cached: true }, usageError: null })
          return
        }
      }

      // 2. 调用 LLM 获取
      const data = await llmService.getWordUsage(cleaned)

      // 防止旧请求结果覆盖：检查当前单词是否仍是请求时的单词
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) {
        return // 用户已切到其他单词，丢弃结果
      }

      if (data && (data.collocations || data.phrases || data.usage)) {
        // 保存到本地缓存
        await dbService.saveWordUsage(cleaned, data)
        set({ usageLoading: false, wordUsage: { ...data, cached: false }, usageError: null })
      } else {
        set({ usageLoading: false, wordUsage: null, usageError: '未获取到搭配信息' })
      }
    } catch (err: any) {
      // 同样检查当前单词，防止错误状态污染
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return
      set({ usageLoading: false, wordUsage: null, usageError: `搭配查询失败: ${err.message || err}` })
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

    const { apiKey } = useConfigStore.getState().getConfig()
    if (!apiKey) return // 没有API Key时静默跳过，不影响基本查词

    console.log(`[lookupContext] word=${cleaned}, forceRefresh=${forceRefresh}`)
    // 保存请求参数，用于重试
    set({ contextLoading: true, contextInfo: null, contextError: null, lastContextParams: { word: cleaned, sentence, translation } })

    const cacheKey = `${cleaned}:${sentence.slice(0, 50)}`

    try {
      // 1. 尝试从本地缓存获取
      if (!forceRefresh) {
        const cached = await dbService.getWordContext(cacheKey)
        if (cached) {
          set({ contextLoading: false, contextInfo: { ...cached, cached: true }, contextError: null })
          return
        }
      }

      // 2. 调用 LLM 获取
      const data = await llmService.getWordContext(cleaned, sentence, translation)

      // 防止旧请求结果覆盖
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return

      if (data && data.contextMeaning) {
        const contextResult = {
          matchedIndex: typeof data.matchedIndex === 'number' ? data.matchedIndex : -1,
          contextMeaning: String(data.contextMeaning || ''),
          phrase: data.phrase && typeof data.phrase === 'object' ? {
            text: String(data.phrase.text || ''),
            meaning: String(data.phrase.meaning || ''),
            words: Array.isArray(data.phrase.words) ? data.phrase.words.map(String) : [],
          } : null,
        }

        // 保存到本地缓存
        await dbService.saveWordContext(cacheKey, cleaned, contextResult)
        set({ contextLoading: false, contextInfo: { ...contextResult, cached: false }, contextError: null })
      } else {
        set({ contextLoading: false, contextInfo: null, contextError: '未获取到有效结果' })
      }
    } catch (err: any) {
      // 防止旧请求结果覆盖
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return

      set({ contextLoading: false, contextInfo: null, contextError: `语境分析失败: ${err.message || err}` })
    }
  },

  retryContext: async () => {
    const { lastContextParams } = useDictStore.getState()
    if (!lastContextParams) return
    const { word, sentence, translation } = lastContextParams
    // 使用store方法重新调用（重置retryCount）
    useDictStore.getState().lookupContext(word, sentence, translation)
  },

  lookupMnemonic: async (word: string, forceRefresh?: boolean) => {
    const cleaned = word.toLowerCase().replace(/[^a-z'-]/g, '')
    if (!cleaned) return

    const { apiKey } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      set({ mnemonicError: '请先在设置中配置API Key' })
      return
    }

    console.log(`[lookupMnemonic] word=${cleaned}, forceRefresh=${forceRefresh}`)
    set({ mnemonicLoading: true, wordMnemonic: null, mnemonicError: null })

    try {
      const cacheKey = `mnemonic:${cleaned}`

      // 1. 尝试从本地缓存获取
      if (!forceRefresh) {
        const cached = await dbService.getWordContext(cacheKey)
        if (cached && typeof cached === 'string') {
          set({ mnemonicLoading: false, wordMnemonic: cached, mnemonicError: null })
          return
        }
      }

      // 2. 调用 LLM 获取
      const result = await llmService.getWordMnemonic(cleaned)

      // 防止旧请求结果覆盖
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return

      if (result) {
        // 保存到本地缓存
        await dbService.saveWordContext(cacheKey, cleaned, result)
        set({ mnemonicLoading: false, wordMnemonic: result, mnemonicError: null })
      } else {
        set({ mnemonicLoading: false, wordMnemonic: null, mnemonicError: '未获取到助记内容' })
      }
    } catch (err: any) {
      // 防止旧请求结果覆盖
      const currentWord = useDictStore.getState().currentWord
      if (!currentWord || currentWord.word.toLowerCase() !== cleaned) return
      set({ mnemonicLoading: false, wordMnemonic: null, mnemonicError: `助记生成失败: ${err.message || err}` })
    }
  },

  clearMnemonic: () => set({ mnemonicLoading: false, wordMnemonic: null, mnemonicError: null }),
}))