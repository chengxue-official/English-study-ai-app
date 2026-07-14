import { create } from 'zustand'

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
  error: string | null
  enabled: boolean
  selectedPhrase: PhraseMatch | null
  selectedSourceSentence: string | null
  selectedSourceTranslation: string | null

  scanPhrases: (paragraphs: string[], translations: string[]) => Promise<void>
  clearPhrases: () => void
  setEnabled: (enabled: boolean) => void
  selectPhrase: (phrase: PhraseMatch, sentence: string, translation: string) => void
  clearSelection: () => void
}

const API_BASE = import.meta.env.VITE_API_BASE || ''

export const usePhraseStore = create<PhraseState>((set, get) => ({
  phraseResults: [],
  scanning: false,
  error: null,
  enabled: false,
  selectedPhrase: null,
  selectedSourceSentence: null,
  selectedSourceTranslation: null,

  scanPhrases: async (paragraphs: string[], translations: string[]) => {
    set({ scanning: true, error: null })
    try {
      const results: ParagraphPhrases[] = []

      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i]
        if (!text || text.trim().length === 0) continue

        try {
          const res = await fetch(`${API_BASE}/api/scan-phrases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              sentence: text,
              sentenceTranslation: translations[i] || '',
            }),
          })

          if (!res.ok) {
            console.warn(`[Phrases] 段落${i}扫描失败: ${res.status}`)
            continue
          }

          const data = await res.json()
          if (data.found && data.phrases.length > 0) {
            results.push({
              paragraphIndex: i,
              phrases: data.phrases,
            })
          }
        } catch (err) {
          console.warn(`[Phrases] 段落${i}扫描错误:`, err)
        }
      }

      set({ phraseResults: results, scanning: false, enabled: true })
      console.log(`[Phrases] 扫描完成，发现 ${results.reduce((s, r) => s + r.phrases.length, 0)} 个词组`)
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