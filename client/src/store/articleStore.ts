import { create } from 'zustand'
import { useConfigStore } from './configStore'

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
    const { apiKey, apiUrl, model } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      set({ error: '请先在设置中配置API Key' })
      return
    }

    set({ isTranslating: true, error: null })

    try {
      const texts = paragraphs.map((p) => p.original)

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, apiKey, apiUrl, model }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `翻译请求失败 (${response.status})`)
      }

      const data = await response.json()
      const translations: string[] = data.translations

      set((state) => ({
        paragraphs: state.paragraphs.map((p, i) => ({
          ...p,
          translation: translations[i] || '',
          isTranslating: false,
        })),
        isTranslating: false,
      }))
    } catch (err) {
      set({
        isTranslating: false,
        error: err instanceof Error ? err.message : '翻译失败，请检查后端服务是否启动',
      })
    }
  },

  clearArticle: () =>
    set({ title: '', paragraphs: [], isTranslating: false, error: null }),
}))