import { create } from 'zustand'

// 收藏项类型
export type CollectionType = 'word' | 'phrase' | 'grammar' | 'sentence'

export interface CollectionItem {
  id: number
  type: CollectionType
  content: string
  meaning: string | null
  sourceSentence: string | null
  sourceTranslation: string | null
  tags: string[]
  phonetic: string | null
  extra: Record<string, unknown> | null
  createdAt: number
  reviewCount: number
  lastReviewAt: number | null
  nextReviewAt: number | null
}

interface CollectionState {
  items: CollectionItem[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  error: string | null
  // 筛选
  filterType: CollectionType | 'all'
  filterTag: string | null
  searchQuery: string
  // 统计
  stats: { total: number; byType: Record<string, number> } | null
  // 收藏状态缓存（用于快速判断是否已收藏）
  collectedMap: Map<string, boolean> // key: "type:content"

  // 操作
  fetchItems: (reset?: boolean, dueReview?: boolean) => Promise<void>
  addCollection: (params: {
    type: CollectionType
    content: string
    meaning?: string
    sourceSentence?: string
    sourceTranslation?: string
    tags?: string[]
    phonetic?: string
    extra?: Record<string, unknown>
  }) => Promise<{ id: number; createdAt: number } | null>
  removeCollection: (id: number) => Promise<void>
  checkCollected: (type: CollectionType, content: string) => Promise<boolean>
  fetchStats: () => Promise<void>
  updateReview: (id: number, known?: boolean) => Promise<{ nextReviewAt?: number; days?: number } | null>
  advanceReview: (id: number) => Promise<boolean>
  setFilterType: (type: CollectionType | 'all') => void
  setFilterTag: (tag: string | null) => void
  setSearchQuery: (query: string) => void
  clearFilters: () => void
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  loading: false,
  error: null,
  filterType: 'all',
  filterTag: null,
  searchQuery: '',
  stats: null,
  collectedMap: new Map(),

  fetchItems: async (reset = false, dueReview = false) => {
    const state = get()
    if (state.loading) return

    const page = reset ? 1 : state.page
    set({ loading: true, error: null })

    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(state.pageSize))
      if (state.filterType !== 'all') params.set('type', state.filterType)
      if (state.filterTag) params.set('tag', state.filterTag)
      if (state.searchQuery) params.set('search', state.searchQuery)
      if (dueReview) params.set('dueReview', 'true')

      const res = await fetch(`/api/collection?${params}`)
      const data = await res.json()

      if (!res.ok) {
        set({ loading: false, error: data.error || '获取收藏列表失败' })
        return
      }

      set({
        items: reset ? data.items : [...state.items, ...data.items],
        total: data.total,
        page,
        loading: false,
      })
    } catch (err) {
      set({ loading: false, error: '网络错误' })
    }
  },

  addCollection: async (params) => {
    try {
      const res = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const data = await res.json()

      if (!res.ok) return null

      // 更新本地缓存
      const key = `${params.type}:${params.content}`
      const newMap = new Map(get().collectedMap)
      newMap.set(key, true)
      set({ collectedMap: newMap })

      // 刷新列表和统计
      get().fetchItems(true)
      get().fetchStats()

      return { id: data.id, createdAt: data.createdAt }
    } catch {
      return null
    }
  },

  removeCollection: async (id) => {
    try {
      await fetch(`/api/collection/${id}`, { method: 'DELETE' })

      // 更新本地状态
      set(state => {
        const removedItem = state.items.find(i => i.id === id)
        const newMap = new Map(state.collectedMap)
        if (removedItem) {
          newMap.delete(`${removedItem.type}:${removedItem.content}`)
        }
        return {
          items: state.items.filter(item => item.id !== id),
          total: state.total - 1,
          collectedMap: newMap,
        }
      })

      get().fetchStats()
    } catch {
      // ignore
    }
  },

  checkCollected: async (type, content) => {
    const key = `${type}:${content}`
    const cached = get().collectedMap.get(key)
    if (cached !== undefined) return cached

    try {
      const res = await fetch(`/api/collection/check?type=${type}&content=${encodeURIComponent(content)}`)
      const data = await res.json()
      const collected = !!data.collected

      const newMap = new Map(get().collectedMap)
      newMap.set(key, collected)
      set({ collectedMap: newMap })

      return collected
    } catch {
      return false
    }
  },

  fetchStats: async () => {
    try {
      const res = await fetch('/api/collection/stats')
      const data = await res.json()
      if (res.ok) {
        set({ stats: { total: data.total, byType: data.byType } })
      }
    } catch {
      // ignore
    }
  },

  updateReview: async (id, known = true) => {
    try {
      const res = await fetch(`/api/collection/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ known }),
      })
      const data = await res.json()
      return data.success ? { nextReviewAt: data.nextReviewAt, days: data.days } : null
    } catch {
      return null
    }
  },

  advanceReview: async (id) => {
    try {
      const res = await fetch(`/api/collection/${id}/advance-review`, { method: 'POST' })
      const data = await res.json()
      return !!data.success
    } catch {
      return false
    }
  },

  setFilterType: (type) => {
    set({ filterType: type })
    get().fetchItems(true)
  },

  setFilterTag: (tag) => {
    set({ filterTag: tag })
    get().fetchItems(true)
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    // 搜索延迟由组件层debounce处理
  },

  clearFilters: () => {
    set({ filterType: 'all', filterTag: null, searchQuery: '' })
    get().fetchItems(true)
  },
}))