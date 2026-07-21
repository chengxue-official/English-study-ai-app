import { useState, useEffect, useCallback } from 'react'
import { useCollectionStore, type CollectionType, type CollectionItem } from '../store/collectionStore'
import ReviewMode from './ReviewMode'

// 类型标签配置
const TYPE_CONFIG: Record<CollectionType | 'all', { label: string; icon: string; color: string }> = {
  all: { label: '全部', icon: '📋', color: 'bg-gray-100 text-gray-700' },
  word: { label: '单词', icon: '📖', color: 'bg-blue-50 text-blue-700' },
  phrase: { label: '词组', icon: '🔗', color: 'bg-green-50 text-green-700' },
  grammar: { label: '语法', icon: '📝', color: 'bg-purple-50 text-purple-700' },
  sentence: { label: '长难句', icon: '🏗️', color: 'bg-amber-50 text-amber-700' },
}

// 收藏项卡片
function CollectionCard({ item, onRemove, onReview, onAdvance }: {
  item: CollectionItem
  onRemove: (id: number) => void
  onReview: (id: number) => void
  onAdvance: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const config = TYPE_CONFIG[item.type]

  return (
    <div className="bg-white border border-slate-100 rounded-[1.25rem] md:rounded-[1.5rem] p-4 md:p-5 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/30 transition-all group relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mt-12 opacity-50 group-hover:bg-blue-50 transition-colors" />
      
      <div className="flex items-start gap-4 relative z-10">
        {/* 类型图标 */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-sm ${config.color.split(' ')[0]} border border-white`}>
          {config.icon}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${config.color}`}>
              {config.label}
            </span>
            {item.type === 'word' && item.phonetic && (
              <span className="text-xs font-bold text-slate-300 tracking-tight">{item.phonetic}</span>
            )}
          </div>
          
          <p className="text-lg font-black text-slate-800 break-words leading-tight tracking-tight">{item.content}</p>
          
          {item.meaning && (
            <p className="text-sm font-bold text-slate-500 mt-1.5 break-words leading-relaxed">{item.meaning}</p>
          )}

          {/* 标签 */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.tags.map(tag => (
                <span key={tag} className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-red-50 text-red-500 border border-red-100">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 展开详情 */}
          {expanded && (item.sourceSentence || item.sourceTranslation) && (
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl text-xs space-y-2 border border-slate-100 animate-in zoom-in-95">
              {item.sourceSentence && (
                <p className="text-slate-600 leading-relaxed">
                  <span className="font-black uppercase tracking-widest text-slate-300 mr-2">原文</span>
                  <span className="font-medium">{item.sourceSentence}</span>
                </p>
              )}
              {item.sourceTranslation && (
                <p className="text-slate-600 leading-relaxed">
                  <span className="font-black uppercase tracking-widest text-slate-300 mr-2">译文</span>
                  <span className="font-medium">{item.sourceTranslation}</span>
                </p>
              )}
            </div>
          )}

          {/* 底部信息 */}
          <div className="flex items-center gap-3 mt-4 text-[10px] font-black uppercase tracking-widest text-slate-300">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
            {item.reviewCount > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                复习 {item.reviewCount} 次
              </span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-2 shrink-0">
          {item.sourceSentence && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${expanded ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-200'}`}
              title={expanded ? '收起来源' : '查看来源'}
            >
              <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onReview(item.id)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-500 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
            title="标记复习"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          {item.nextReviewAt && item.nextReviewAt > Date.now() && (
            <button
              onClick={() => onAdvance(item.id)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-amber-50 text-amber-500 hover:bg-amber-600 hover:text-white transition-all shadow-sm"
              title="提前复习"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-600 hover:text-white transition-all shadow-sm"
            title="取消收藏"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CollectionPanel() {
  const {
    items, total, loading, error,
    filterType, filterTag, searchQuery,
    stats,
    fetchItems, removeCollection,
    fetchStats, updateReview, advanceReview,
    setFilterType, setFilterTag, setSearchQuery,
  } = useCollectionStore()

  const [searchInput, setSearchInput] = useState('')
  const [showReview, setShowReview] = useState(false)

  // 首次加载
  useEffect(() => {
    fetchItems(true)
    fetchStats()
  }, [])

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        setSearchQuery(searchInput)
        fetchItems(true)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleRemove = useCallback(async (id: number) => {
    await removeCollection(id)
  }, [removeCollection])

  const handleReview = useCallback(async (id: number) => {
    await updateReview(id)
  }, [updateReview])

  const handleAdvance = useCallback(async (id: number) => {
    await advanceReview(id)
    fetchItems(true)
  }, [advanceReview, fetchItems])

  return (
    <div className="flex flex-col h-full min-h-[500px] relative bg-white">
      {/* 头部 */}
      <div className="px-4 md:px-6 pt-6 md:pt-8 pb-4 border-b border-slate-50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">收藏本</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">My Collection</p>
            </div>
            {stats && (
              <span className="text-xs font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">{stats.total}</span>
            )}
          </div>
          <div className="flex items-center w-full sm:w-auto">
            {stats && stats.total > 0 && (
              <button
                onClick={() => setShowReview(true)}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-black uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-blue-200/50"
                style={{ background: 'linear-gradient(to right, #2563eb, #4f46e5)' }}
              >
                开始复习
              </button>
            )}
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative mb-4 md:mb-6 group">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="搜索单词、词组或句子..."
            className="w-full px-4 py-2.5 md:py-3 pl-10 md:pl-12 text-sm font-medium bg-slate-50 border-2 border-transparent rounded-xl md:rounded-2xl focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all placeholder-slate-300"
          />
          <svg className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-300 group-focus-within:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* 类型筛选 Tab - 增加对比度和间距 */}
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 no-scrollbar">
          {(Object.keys(TYPE_CONFIG) as Array<CollectionType | 'all'>).map(type => {
            const config = TYPE_CONFIG[type]
            const count = type === 'all' ? total : (stats?.byType[type] || 0)
            const isActive = filterType === type
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl whitespace-nowrap transition-all border-2 ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200 scale-105'
                    : 'bg-white text-slate-500 border-slate-100 hover:border-blue-200 hover:text-blue-600'
                }`}
              >
                <span className="text-base">{config.icon}</span>
                <span>{config.label}</span>
                {count > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ml-1 ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 标签筛选（熟词生义等） */}
        {filterTag && (
          <div className="mt-4 flex items-center gap-2 animate-in slide-in-from-left-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">标签：</span>
            <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-red-50 text-red-600 rounded-full border border-red-100">
              {filterTag}
            </span>
            <button
              onClick={() => setFilterTag(null)}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-all"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 复习模式覆盖层 */}
      {showReview && (
        <div className="absolute inset-0 bg-white z-50 overflow-y-auto animate-in slide-in-from-bottom-4 duration-500">
          <ReviewMode onClose={() => setShowReview(false)} />
        </div>
      )}

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 pb-8 pt-4 custom-scrollbar">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-300">加载中...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-sm font-bold text-red-500">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-200 mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <p className="text-lg font-black text-slate-300 uppercase tracking-widest">暂无收藏</p>
            <p className="text-xs font-bold text-slate-200 mt-2">阅读文章时可以收藏单词、词组、语法等</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map(item => (
              <CollectionCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
                onReview={handleReview}
                onAdvance={handleAdvance}
              />
            ))}
          </div>
        )}

        {/* 加载更多 */}
        {items.length < total && !loading && (
          <div className="text-center mt-8">
            <button
              onClick={() => fetchItems(false)}
              className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 rounded-xl hover:bg-slate-100 hover:text-slate-600 transition-all"
            >
              加载更多 ({items.length}/{total})
            </button>
          </div>
        )}
        {loading && items.length > 0 && (
          <div className="text-center mt-8">
            <div className="inline-block w-6 h-6 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
