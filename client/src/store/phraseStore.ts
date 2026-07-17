import { create } from 'zustand'
import { dbService } from '../services/database'

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

export const usePhraseStore = create<PhraseState>((set, get) => ({
  phraseResults: [],
  scanning: false,
  error: null,
  enabled: false,
  selectedPhrase: null,
  selectedSourceSentence: null,
  selectedSourceTranslation: null,

  scanPhrases: async (paragraphs: string[], _translations: string[]) => {
    set({ scanning: true, error: null })
    try {
      const results: ParagraphPhrases[] = []

      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i]
        if (!text || text.trim().length === 0) continue

        try {
          const phrases = await dbService.scanPhrases(text)
          if (phrases.length > 0) {
            results.push({
              paragraphIndex: i,
              phrases,
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