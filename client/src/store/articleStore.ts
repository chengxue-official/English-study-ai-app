import { create } from 'zustand'
import { useConfigStore } from './configStore'
import { llmService } from '../services/llm'

export interface Paragraph {
  id: string
  original: string
  translation: string
  isTranslating: boolean
}

interface ArticleState {
  title: string
  paragraphs: Paragraph[]
  isTranslating: boolean
  error: string | null

  setTitle: (title: string) => void
  setArticle: (text: string) => void
  translateArticle: () => Promise<void>
  clearArticle: () => void
}

const generateId = () => Math.random().toString(36).substring(2, 9)

export const useArticleStore = create<ArticleState>((set, get) => ({
  title: '',
  paragraphs: [],
  isTranslating: false,
  error: null,

  setTitle: (title) => set({ title }),

  setArticle: (text) => {
    const lines = text.split('\n').filter((line) => line.trim() !== '')
    const paragraphs: Paragraph[] = lines.map((line) => ({
      id: generateId(),
      original: line.trim(),
      translation: '',
      isTranslating: false,
    }))
    set({ paragraphs, error: null })
  },

  translateArticle: async () => {
    const { paragraphs } = get()
    if (paragraphs.length === 0) return

    // 从configStore获取API配置
    const { apiKey } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      set({ error: '请先在设置中配置API Key' })
      return
    }

    set({ isTranslating: true, error: null })

    try {
      const texts = paragraphs.map((p) => p.original)
      const translations = await llmService.translate(texts)

      if (translations.length !== texts.length) {
        console.warn(`[ArticleStore] 翻译结果数量(${translations.length})与原文段落数(${texts.length})不一致`)
      }

      set((state) => ({
        paragraphs: state.paragraphs.map((p, i) => ({
          ...p,
          translation: translations[i] || '',
          isTranslating: false,
        })),
        isTranslating: false,
        // 如果长度不一致，给用户一个微弱的提示
        error: translations.length !== texts.length ? '部分段落翻译可能存在错位，建议重新翻译或分段导入' : null
      }))
    } catch (err: any) {
      set({
        isTranslating: false,
        error: `翻译失败: ${err.message || err}`,
      })
    }
  },

  clearArticle: () =>
    set({ title: '', paragraphs: [], isTranslating: false, error: null }),
}))