import { useState, useEffect } from 'react'
import { usePhraseStore } from '../store/phraseStore'
import { useCollectionStore } from '../store/collectionStore'

export default function PhrasePopup() {
  const { selectedPhrase, selectedSourceSentence, selectedSourceTranslation, clearSelection } = usePhraseStore()
  const { checkCollected, addCollection, removeCollection, items } = useCollectionStore()
  const [isCollected, setIsCollected] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (selectedPhrase) {
      setVisible(true)
      // 检查是否已收藏
      checkCollected('phrase', selectedPhrase.phrase.toLowerCase()).then(setIsCollected)
    } else {
      setVisible(false)
    }
  }, [selectedPhrase, checkCollected])

  // 收藏状态可能随items变化
  useEffect(() => {
    if (selectedPhrase) {
      checkCollected('phrase', selectedPhrase.phrase.toLowerCase()).then(setIsCollected)
    }
  }, [items, selectedPhrase, checkCollected])

  const handleToggleCollect = async () => {
    if (!selectedPhrase) return
    if (isCollected) {
      const item = items.find(i => i.type === 'phrase' && i.content === selectedPhrase.phrase.toLowerCase())
      if (item) {
        await removeCollection(item.id)
        setIsCollected(false)
      }
    } else {
      await addCollection({
        type: 'phrase',
        content: selectedPhrase.phrase.toLowerCase(),
        meaning: selectedPhrase.translation,
        sourceSentence: selectedSourceSentence || undefined,
        sourceTranslation: selectedSourceTranslation || undefined,
        tags: ['词组标注'],
      })
      setIsCollected(true)
    }
  }

  if (!visible || !selectedPhrase) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={clearSelection}
    >
      <div className="fixed inset-0 bg-black/20" />
      <div
        className="relative bg-white rounded-2xl shadow-xl border border-gray-200 max-w-sm w-full mx-4 p-5"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded font-medium">
              🔗 词组
            </span>
            <h3 className="text-base font-bold text-gray-900">{selectedPhrase.phrase}</h3>
          </div>
          <div className="flex items-center gap-1">
            {/* 收藏按钮 */}
            <button
              onClick={handleToggleCollect}
              className={`p-1.5 rounded-lg transition-colors ${
                isCollected
                  ? 'text-amber-500 hover:bg-amber-50'
                  : 'text-gray-300 hover:bg-gray-100 hover:text-amber-400'
              }`}
              title={isCollected ? '取消收藏' : '收藏词组'}
            >
              <svg className="w-5 h-5" fill={isCollected ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
            {/* 关闭按钮 */}
            <button
              onClick={clearSelection}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 释义 */}
        <div className="bg-gray-50 rounded-xl p-3 mb-3">
          <p className="text-sm text-gray-700">{selectedPhrase.translation}</p>
        </div>

        {/* 组成词 */}
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">组成词</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedPhrase.words.map((w, i) => (
              <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                {w}
              </span>
            ))}
          </div>
        </div>

        {/* 来源句子 */}
        {selectedSourceSentence && (
          <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-100">
            <p className="text-xs text-gray-500 mb-1">
              <span className="text-gray-400">来源：</span>{selectedSourceSentence}
            </p>
            {selectedSourceTranslation && (
              <p className="text-xs text-gray-500">
                <span className="text-gray-400">译文：</span>{selectedSourceTranslation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}