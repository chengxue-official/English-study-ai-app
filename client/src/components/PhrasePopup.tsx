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
      checkCollected('phrase', selectedPhrase.phrase.toLowerCase()).then(id => setIsCollected(id !== null))
    } else {
      setVisible(false)
    }
  }, [selectedPhrase, checkCollected])

  // 收藏状态可能随items变化
  useEffect(() => {
    if (selectedPhrase) {
      checkCollected('phrase', selectedPhrase.phrase.toLowerCase()).then(id => setIsCollected(id !== null))
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={clearSelection}
    >
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        className="relative bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white/20 max-w-sm w-full p-6 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
              <span className="text-lg">🔗</span>
            </div>
            <div>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider block">Phrase</span>
              <h3 className="text-lg font-black text-gray-900 tracking-tight">{selectedPhrase.phrase}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 收藏按钮 */}
            <button
              onClick={handleToggleCollect}
              className={`p-2.5 rounded-2xl transition-all ${
                isCollected
                  ? 'text-amber-500 bg-amber-50 shadow-inner'
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
              className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 释义 */}
        <div className="bg-gray-50/80 rounded-2xl p-4 mb-4 border border-gray-100">
          <p className="text-base font-bold text-gray-800 leading-relaxed">{selectedPhrase.translation}</p>
        </div>

        {/* 组成词 */}
        <div className="mb-4">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Components</h4>
          <div className="flex flex-wrap gap-2">
            {selectedPhrase.words.map((w, i) => (
              <span key={i} className="text-xs font-bold px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                {w}
              </span>
            ))}
          </div>
        </div>

        {/* 来源句子 */}
        {selectedSourceSentence && (
          <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Context</span>
            </div>
            <p className="text-sm text-amber-900/80 italic leading-relaxed">
              "{selectedSourceSentence}"
            </p>
            {selectedSourceTranslation && (
              <p className="text-xs text-amber-700/60 mt-2 font-medium">
                {selectedSourceTranslation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}