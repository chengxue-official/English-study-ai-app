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
    <div className="border border-gray-100 rounded-xl p-3 hover:border-gray-200 transition-colors">
      <div className="flex items-start gap-2">
        {/* 类型标签 */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${config.color}`}>
          {config.icon} {config.label}
        </span>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {item.type === 'word' && item.phonetic && (
              <span className="text-xs text-gray-400">{item.phonetic}</span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-800 break-words">{item.content}</p>
          {item.meaning && (
            <p className="text-xs text-gray-500 mt-0.5 break-words">{item.meaning}</p>
          )}

          {/* 标签 */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.tags.map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 展开详情 */}
          {expanded && (item.sourceSentence || item.sourceTranslation) && (
            <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs">
              {item.sourceSentence && (
                <p className="text-gray-600 mb-1">
                  <span className="text-gray-400 mr-1">原文：</span>{item.sourceSentence}
                </p>
              )}
              {item.sourceTranslation && (
                <p className="text-gray-600">
                  <span className="text-gray-400 mr-1">译文：</span>{item.sourceTranslation}
                </p>
              )}
            </div>
          )}

          {/* 底部信息 */}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
            {item.reviewCount > 0 && (
              <span>复习{item.reviewCount}次</span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-1 shrink-0">
          {item.sourceSentence && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-1"
              title={expanded ? '收起来源' : '查看来源'}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
          <button
            onClick={() => onReview(item.id)}
            className="text-[10px] text-blue-400 hover:text-blue-600 px-1"
            title="标记复习"
          >
            ✓
          </button>
          {item.nextReviewAt && item.nextReviewAt > Date.now() && (
            <button
              onClick={() => onAdvance(item.id)}
              className="text-[10px] text-amber-400 hover:text-amber-600 px-1"
              title="提前复习"
            >
              ⏩
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="text-[10px] text-red-400 hover:text-red-600 px-1"
            title="取消收藏"
          >
            ✕
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
    <div className="flex flex-col h-full relative">
      {/* 头部 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-800">收藏本</h2>
          <div className="flex items-center gap-2">
            {stats && (
              <span className="text-xs text-gray-400">{stats.total} 条收藏</span>
            )}
            {stats && stats.total > 0 && (
              <button
                onClick={() => setShowReview(true)}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                📚 复习
              </button>
            )}
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative mb-3">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="搜索收藏内容..."
            className="w-full px-3 py-1.5 pl-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
          <svg className="absolute left-2.5 top-2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* 类型筛选 Tab */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {(Object.keys(TYPE_CONFIG) as Array<CollectionType | 'all'>).map(type => {
            const config = TYPE_CONFIG[type]
            const count = type === 'all' ? total : (stats?.byType[type] || 0)
            const isActive = filterType === type
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{config.icon}</span>
                <span>{config.label}</span>
                {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            )
          })}
        </div>

        {/* 标签筛选（熟词生义等） */}
        {filterTag && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-xs text-gray-500">标签：</span>
            <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">
              {filterTag}
            </span>
            <button
              onClick={() => setFilterTag(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 复习模式覆盖层 */}
      {showReview && (
        <div className="absolute inset-0 bg-white z-10 overflow-y-auto">
          <ReviewMode onClose={() => setShowReview(false)} />
        </div>
      )}

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading && items.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">加载中...</div>
        ) : error ? (
          <div className="text-center py-8 text-sm text-red-500">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">暂无收藏</p>
            <p className="text-xs text-gray-300 mt-1">阅读文章时可以收藏单词、词组、语法等</p>
          </div>
        ) : (
          <div className="space-y-2">
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
          <div className="text-center mt-3">
            <button
              onClick={() => fetchItems(false)}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              加载更多 ({items.length}/{total})
            </button>
          </div>
        )}
        {loading && items.length > 0 && (
          <div className="text-center mt-3 text-xs text-gray-400">加载中...</div>
        )}
      </div>
    </div>
  )
}