import { create } from 'zustand'
import { useConfigStore } from './configStore'

// 长难句识别结果
export interface SentenceInfo {
  index: number
  text: string
  isComplex: boolean
  wordCount: number
  markerCount: number
}

export interface ParagraphAnalysis {
  paragraphIndex: number
  sentences: SentenceInfo[]
}

// 句子深度分析结果
export interface SentenceDetail {
  trunk: {
    subject: string
    predicate: string
    object: string
  }
  clauses: Array<{
    type: string
    marker: string
    content: string
    role: string
  }>
  modifiers: Array<{
    type: string
    content: string
    target: string
  }>
  structure: Array<{
    level: number
    text: string
    type: string  // 主干/从句/修饰
  }>
  tips: string[]
  // P2-1新增字段
  phrases: Array<{
    phrase: string
    meaning: string
    type: string  // 动词短语/介词短语/固定搭配/形容词短语
  }>
  patterns: Array<{
    pattern: string
    name: string
    example: string
  }>
  examPoints: Array<{
    point: string
    description: string
    importance: string  // 高/中/低
  }>
  cached?: boolean
}

interface SentenceState {
  // 段落级识别结果
  analysisResult: ParagraphAnalysis[] | null
  analyzing: boolean
  analysisError: string | null

  // 句子级深度分析
  detailLoading: boolean
  currentDetail: SentenceDetail | null
  detailError: string | null
  detailSentence: string | null  // 当前正在查看的句子

  // 操作
  analyzeParagraphs: (paragraphs: string[]) => Promise<void>
  clearAnalysis: () => void
  analyzeDetail: (sentence: string, forceRefresh?: boolean) => Promise<void>
  clearDetail: () => void
}

export const useSentenceStore = create<SentenceState>((set) => ({
  analysisResult: null,
  analyzing: false,
  analysisError: null,

  detailLoading: false,
  currentDetail: null,
  detailError: null,
  detailSentence: null,

  analyzeParagraphs: async (paragraphs: string[]) => {
    if (!paragraphs || paragraphs.length === 0) return

    set({ analyzing: true, analysisError: null })

    try {
      const res = await fetch('/api/analyze-sentences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs }),
      })
      const data = await res.json()

      if (data.result) {
        set({ analyzing: false, analysisResult: data.result, analysisError: null })
      } else {
        set({ analyzing: false, analysisError: '识别失败' })
      }
    } catch {
      set({ analyzing: false, analysisError: '句子识别请求失败' })
    }
  },

  clearAnalysis: () => set({ analyzing: false, analysisResult: null, analysisError: null }),

  analyzeDetail: async (sentence: string, forceRefresh?: boolean) => {
    if (!sentence) return

    const { apiKey, apiUrl, model } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      set({ detailError: '请先在设置中配置API Key' })
      return
    }

    console.log(`[analyzeDetail] forceRefresh=${forceRefresh}, sentence=${sentence.slice(0, 30)}...`)
    set({ detailLoading: true, currentDetail: null, detailError: null, detailSentence: sentence })

    try {
      const res = await fetch('/api/analyze-sentence-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence, apiKey, apiUrl, model, forceRefresh: !!forceRefresh }),
      })
      const data = await res.json()
      console.log(`[analyzeDetail] 响应: found=${data.found}, cached=${data.cached}`)

      if (data.found) {
        set({ detailLoading: false, currentDetail: data, detailError: null })
      } else {
        set({ detailLoading: false, currentDetail: null, detailError: '分析失败' })
      }
    } catch {
      set({ detailLoading: false, currentDetail: null, detailError: '句子分析请求失败' })
    }
  },

  clearDetail: () => set({ detailLoading: false, currentDetail: null, detailError: null, detailSentence: null }),
}))