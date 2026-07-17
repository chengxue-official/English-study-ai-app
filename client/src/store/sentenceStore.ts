import { create } from 'zustand'
import { useConfigStore } from './configStore'
import { dbService } from '../services/database'
import { llmService } from '../services/llm'

// 从句标记词（用于规则识别）
const SUBORDINATE_MARKERS = [
  // 定语从句
  'which', 'who', 'whom', 'whose', 'that', 'where', 'when', 'why',
  // 状语从句
  'because', 'although', 'though', 'while', 'if', 'unless', 'since', 'until',
  'before', 'after', 'as', 'once', 'whenever', 'wherever', 'however',
  'whether', 'provided', 'supposing', 'assuming',
  // 名词性从句
  'what', 'how', 'whatever', 'whoever', 'whomever',
]

/**
 * 从段落文本中提取句子列表
 */
function extractSentences(text: string): string[] {
  // 按句号/问号/感叹号分割，保留分隔符
  const parts = text.split(/(?<=[.!?])\s+/)
  return parts.filter(s => s.trim().length > 0)
}

/**
 * 校验并规范化LLM返回的长难句分析数据
 */
function validateSentenceDetail(data: any): SentenceDetail | null {
  if (!data || typeof data !== 'object') return null

  const result: any = {}

  // 校验trunk
  if (data.trunk && typeof data.trunk === 'object' && !Array.isArray(data.trunk)) {
    const trunk = data.trunk
    result.trunk = {
      subject: typeof trunk.subject === 'string' ? trunk.subject : '',
      predicate: typeof trunk.predicate === 'string' ? trunk.predicate : '',
      object: typeof trunk.object === 'string' ? trunk.object : '',
    }
  } else {
    result.trunk = { subject: '', predicate: '', object: '' }
  }

  // 校验clauses
  if (Array.isArray(data.clauses)) {
    result.clauses = data.clauses.filter((c: any) => c && typeof c === 'object').map((c: any) => ({
      type: typeof c.type === 'string' ? c.type : '未知从句',
      marker: typeof c.marker === 'string' ? c.marker : '',
      content: typeof c.content === 'string' ? c.content : '',
      role: typeof c.role === 'string' ? c.role : '',
    }))
  } else {
    result.clauses = []
  }

  // 校验modifiers
  if (Array.isArray(data.modifiers)) {
    result.modifiers = data.modifiers.filter((m: any) => m && typeof m === 'object').map((m: any) => ({
      type: typeof m.type === 'string' ? m.type : '修饰',
      content: typeof m.content === 'string' ? m.content : '',
      target: typeof m.target === 'string' ? m.target : '',
    }))
  } else {
    result.modifiers = []
  }

  // 校验structure
  if (Array.isArray(data.structure)) {
    result.structure = data.structure.filter((s: any) => s && typeof s === 'object').map((s: any) => ({
      level: typeof s.level === 'number' ? s.level : 0,
      text: typeof s.text === 'string' ? s.text : '',
      type: typeof s.type === 'string' ? s.type : '主干',
    }))
  } else {
    result.structure = []
  }

  // 校验tips
  if (Array.isArray(data.tips)) {
    result.tips = data.tips.filter((t: any) => typeof t === 'string')
  } else {
    result.tips = []
  }

  // 校验phrases
  if (Array.isArray(data.phrases)) {
    result.phrases = data.phrases.filter((p: any) => p && typeof p === 'object').map((p: any) => ({
      phrase: typeof p.phrase === 'string' ? p.phrase : '',
      meaning: typeof p.meaning === 'string' ? p.meaning : '',
      type: typeof p.type === 'string' ? p.type : '固定搭配',
    }))
  } else {
    result.phrases = []
  }

  // 校验patterns
  if (Array.isArray(data.patterns)) {
    result.patterns = data.patterns.filter((p: any) => p && typeof p === 'object').map((p: any) => ({
      pattern: typeof p.pattern === 'string' ? p.pattern : '',
      name: typeof p.name === 'string' ? p.name : '',
      example: typeof p.example === 'string' ? p.example : '',
    }))
  } else {
    result.patterns = []
  }

  // 校验examPoints
  if (Array.isArray(data.examPoints)) {
    result.examPoints = data.examPoints.filter((e: any) => e && typeof e === 'object').map((e: any) => ({
      point: typeof e.point === 'string' ? e.point : '',
      description: typeof e.description === 'string' ? e.description : '',
      importance: typeof e.importance === 'string' && ['高', '中', '低'].includes(e.importance) ? e.importance : '中',
    }))
  } else {
    result.examPoints = []
  }

  return result as SentenceDetail
}

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
      const result: ParagraphAnalysis[] = []

      paragraphs.forEach((para, pIdx) => {
        const sentences = extractSentences(para)
        const sentenceData = sentences.map((text, sIdx) => {
          const words = text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w))
          const wordCount = words.length
          const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
          const markerCount = lowerWords.filter(w => SUBORDINATE_MARKERS.includes(w)).length
          return {
            index: sIdx,
            text,
            isComplex: wordCount >= 25 || markerCount >= 2 || (markerCount >= 1 && wordCount >= 15),
            wordCount,
            markerCount,
          }
        })
        result.push({ paragraphIndex: pIdx, sentences: sentenceData })
      })

      set({ analyzing: false, analysisResult: result, analysisError: null })
    } catch (err) {
      console.error('句子识别错误:', err)
      set({ analyzing: false, analysisError: '句子识别失败' })
    }
  },

  clearAnalysis: () => set({ analyzing: false, analysisResult: null, analysisError: null }),

  analyzeDetail: async (sentence: string, forceRefresh?: boolean) => {
    if (!sentence) return

    const { apiKey } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      set({ detailError: '请先在设置中配置API Key' })
      return
    }

    console.log(`[analyzeDetail] forceRefresh=${forceRefresh}, sentence=${sentence.slice(0, 30)}...`)
    set({ detailLoading: true, currentDetail: null, detailError: null, detailSentence: sentence })

    try {
      const sentenceHash = sentence.trim().toLowerCase().replace(/\s+/g, ' ')

      // 1. 查缓存
      if (!forceRefresh) {
        const cached = await dbService.getSentenceAnalysis(sentenceHash)
        if (cached) {
          console.log(`[Cache] 命中句子分析缓存: ${sentenceHash.slice(0, 30)}...`)
          const validated = validateSentenceDetail(cached)
          if (validated) {
            set({ detailLoading: false, currentDetail: { ...validated, cached: true }, detailError: null })
            return
          } else {
            await dbService.deleteSentenceAnalysis(sentenceHash)
          }
        }
      }

      // 2. 调用LLM
      const systemPrompt = `你是一个高中英语句法分析专家。分析给定的英语长难句，返回JSON格式。
要求：
1. trunk: 句子主干（主谓宾/主系表），对象格式：{subject: "主语", predicate: "谓语", object: "宾语/表语"}
2. clauses: 从句列表数组，每项格式：
   {type: "从句类型", marker: "引导词", content: "从句内容", role: "语法作用说明"}
   从句类型限选：定语从句/状语从句/名词性从句(主语从句/宾语从句/表语从句/同位语从句)
3. modifiers: 修饰成分列表数组，每项格式：
   {type: "修饰类型", content: "修饰内容", target: "修饰对象"}
   修饰类型限选：定语/状语/插入语/同位语
4. structure: 结构层次描述（用于可视化），数组格式，按层级缩进表示嵌套关系
   每项格式：{level: 层级数字(0=主干), text: "该层内容", type: "主干/从句/修饰"}
5. tips: 分析提示，2-3句话帮助高中生理解这个长难句
6. phrases: 句中重要词组搭配列表，每项格式：
   {phrase: "词组", meaning: "中文释义", type: "搭配类型"}
   搭配类型限选：动词短语/介词短语/固定搭配/形容词短语
   只列出高中阶段应掌握的重要词组，忽略过于简单的组合
7. patterns: 固定句型列表，每项格式：
   {pattern: "句型结构", name: "句型名称", example: "本句中的体现"}
   如：It is...that...强调句型、Not only...but also...并列句型、So...that...结果状语等
8. examPoints: 常考考点提示（可选），数组格式，每项格式：
   {point: "考点名称", description: "考点说明", importance: "高/中/低"}
   只在确实存在高考常考语法点时才列出，没有则返回空数组

只返回JSON，不要其他内容。`

      const result = await llmService.callAPI(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sentence },
        ]
      )

      // 解析LLM返回
      let parsed: any = null
      try {
        parsed = JSON.parse(result)
      } catch {
        const jsonMatch = result.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
        }
      }

      const validated = parsed ? validateSentenceDetail(parsed) : null

      if (validated) {
        // 3. 写缓存
        await dbService.saveSentenceAnalysis(sentenceHash, sentence, validated)
        set({ detailLoading: false, currentDetail: { ...validated, cached: false }, detailError: null })
      } else {
        set({ detailLoading: false, currentDetail: null, detailError: '分析结果解析失败' })
      }
    } catch (err) {
      console.error('句子分析错误:', err)
      set({ detailLoading: false, currentDetail: null, detailError: '句子分析请求失败' })
    }
  },

  clearDetail: () => set({ detailLoading: false, currentDetail: null, detailError: null, detailSentence: null }),
}))