import { useDictStore, type WordDetail, type WordUsage } from '../store/dictStore'
import { useCollectionStore } from '../store/collectionStore'
import { useState, useEffect } from 'react'
import { speakWord } from '../utils/speak'
import { dbService } from '../services/database'

// 考试标签的中文名和颜色
const TAG_MAP: Record<string, { label: string; color: string }> = {
  zk: { label: '中考', color: 'bg-green-100 text-green-700' },
  gk: { label: '高考', color: 'bg-red-100 text-red-700' },
  cet4: { label: '四级', color: 'bg-blue-100 text-blue-700' },
  cet6: { label: '六级', color: 'bg-purple-100 text-purple-700' },
  ielts: { label: '雅思', color: 'bg-amber-100 text-amber-700' },
  toefl: { label: '托福', color: 'bg-cyan-100 text-cyan-700' },
  gre: { label: 'GRE', color: 'bg-pink-100 text-pink-700' },
}

// 词性缩写映射（ECDICT编码→中文）
// ECDICT pos字段编码: n/v/a/j/r/c/i/u/t/p/d/s
const POS_LABELS: Record<string, string> = {
  n: '名词', v: '动词', a: '形容词', j: '形容词',
  r: '副词', c: '连词', i: '介词', u: '感叹词',
  t: '冠词', p: '代词', d: '限定词', s: '形容词',
  // 常见长缩写（释义文本中）
  ad: '副词', adv: '副词', adj: '形容词',
  prep: '介词', conj: '连词', pron: '代词', interj: '感叹词',
  art: '冠词', num: '数词', det: '限定词',
  modal: '情态动词', aux: '助动词',
  vi: '不及物动词', vt: '及物动词', linkv: '系动词',
}

/**
 * 释义文本中的词性缩写高亮
 * 支持两种格式：
 * - 带句点: "n. xxx" "vi. xxx" "adj. xxx"
 * - 无句点: "n xxx" "a xxx" (ECDICT英文释义格式)
 * 高亮后统一显示为 "名词. xxx" 格式
 * 释义中的英文单词可点击查词
 */
function highlightPosInText(text: string, onWordClick?: (word: string) => void) {
  // 优先匹配长缩写(adv/adj/prep等)，再匹配短缩写
  // 带句点格式
  const posWithDot = /^(adj|adv|prep|conj|pron|interj|modal|aux|linkv|art|num|det|vi|vt|n|v|a|j|r|c|i|u|t|p|d|s|ad)\.\s*/i
  // 无句点格式（ECDICT英文释义常见：n xxx, a xxx, r xxx）
  const posNoDot = /^(adj|adv|prep|conj|pron|interj|modal|aux|linkv|art|num|det|vi|vt|n|v|a|j|r|c|i|u|t|p|d|s|ad)\s+/i

  const match = text.match(posWithDot) || text.match(posNoDot)
  if (match) {
    const posAbbr = match[1].toLowerCase()
    const posLabel = POS_LABELS[posAbbr] || posAbbr
    const rest = text.slice(match[0].length)
    return (
      <span>
        <span className="inline-block px-1.5 py-0 mr-1 text-xs font-bold bg-blue-100 text-blue-700 rounded">
          {posLabel}
        </span>
        <span className="text-gray-400 mr-0.5">.</span>
        {onWordClick ? <ClickableWords text={rest} onWordClick={onWordClick} /> : rest}
      </span>
    )
  }
  return onWordClick ? <ClickableWords text={text} onWordClick={onWordClick} /> : <span>{text}</span>
}

/**
 * 将文本中的英文单词渲染为可点击元素（弹窗内嵌套查词用）
 */
function ClickableWords({ text, onWordClick }: { text: string; onWordClick: (word: string) => void }) {
  const parts = text.split(/([a-zA-Z]+(?:[''-][a-zA-Z]+)*)/g)
  return (
    <span>
      {parts.map((part, i) => {
        const isWord = /^[a-zA-Z]+(?:[''-][a-zA-Z]+)*$/.test(part) && part.length >= 2
        if (isWord) {
          return (
            <span
              key={i}
              className="cursor-pointer hover:text-blue-600 hover:underline transition-colors"
              onClick={(e) => { e.stopPropagation(); onWordClick(part) }}
            >
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

// 发音函数已从 utils/speak.ts 导入

export default function WordPopup() {
  const { loading, currentWord, notFound, error, clearWord } = useDictStore()

  if (!currentWord && !notFound && !error && !loading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={clearWord} />

      {/* 弹窗 */}
      <div className="relative w-[calc(100%-2rem)] md:w-[480px] max-h-[80vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm text-gray-500">正在查词...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={clearWord} className="mt-3 text-sm text-gray-500 hover:text-gray-700">关闭</button>
          </div>
        ) : notFound ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800">{notFound}</h3>
              <button onClick={clearWord} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-500">未在词典中找到该词</p>
          </div>
        ) : currentWord ? (
          <WordDetailContent word={currentWord} onClose={clearWord} />
        ) : null}
      </div>
    </div>
  )
}

function WordDetailContent({ word, onClose }: { word: WordDetail; onClose: () => void }) {
  const { usageLoading, wordUsage, usageError, lookupUsage, lookupWord, contextLoading, contextInfo, contextError, retryContext, contextSentence, contextTranslation, localMatchedIndex, lookupContext } = useDictStore()
  const { addCollection, removeCollection, checkCollected, collectedMap } = useCollectionStore()
  const [isCollected, setIsCollected] = useState(false)

  // 嵌套查词：点击弹窗内的单词，直接查新词
  const handleNestedLookup = (newWord: string) => {
    lookupWord(newWord)
  }

  // 检查是否已收藏
  useEffect(() => {
    checkCollected('word', word.word.toLowerCase()).then(setIsCollected)
  }, [word.word])

  // 收藏/取消收藏
  const handleToggleCollect = async () => {
    if (isCollected) {
      // 找到对应的收藏项并删除
      const key = `word:${word.word.toLowerCase()}`
      if (collectedMap.get(key)) {
        // 需要通过列表查找id
        const result = await dbService.getCollectionItems({
          type: 'word',
          search: word.word.toLowerCase(),
          page: 1,
          pageSize: 1
        })
        if (result.items.length > 0) {
          const item = result.items.find((i: { content: string }) => i.content.toLowerCase() === word.word.toLowerCase())
          if (item) {
            await removeCollection(item.id)
            setIsCollected(false)
          }
        }
      }
    } else {
      // 收藏单词
      const result = await addCollection({
        type: 'word',
        content: word.word.toLowerCase(),
        meaning: word.translation?.split('\n')[0] || '',
        phonetic: word.phonetic || undefined,
        sourceSentence: contextSentence || undefined,
        sourceTranslation: contextTranslation || undefined,
      })
      if (result) setIsCollected(true)
    }
  }

  // 柯林斯星级
  const collinsStars = word.collins > 0
    ? Array.from({ length: 5 }, (_, i) => i < word.collins ? '★' : '☆').join('')
    : null

  // 解析释义（按换行分割）
  const definitions = word.definition
    ? word.definition.split('\n').filter(Boolean)
    : []

  const translations = word.translation
    ? word.translation.split('\n').filter(Boolean)
    : []

  // 解析pos字段: "n:15/v:85" → [{pos:'n', pct:15}, {pos:'v', pct:85}]
  const posEntries = word.pos
    ? word.pos.split('/').map(p => {
        const [pos, pct] = p.split(':')
        return { pos, pct: parseInt(pct) || 0 }
      }).filter(p => p.pos)
    : []

  return (
    <div className="p-5">
      {/* 头部：单词 + 音标 + 发音按钮 */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-gray-900">{word.word}</h3>
            {word.searchedForm && word.searchedForm !== word.word && (
              <span className="text-xs text-gray-400">← {word.searchedForm}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {word.phonetic && (
              <span className="text-sm text-blue-600 font-serif">{word.phonetic}</span>
            )}
            <button
              onClick={() => speakWord(word.word, word.speakUrl)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
              title="朗读单词"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {word.source === 'youdao' && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              有道在线
            </span>
          )}
          {word.source === 'youdao_official' && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 text-amber-600 border border-amber-100">
              有道官方
            </span>
          )}
          <button
            onClick={handleToggleCollect}
            className={`p-1.5 rounded-lg transition-colors ${isCollected ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}
            title={isCollected ? '取消收藏' : '收藏生词'}
          >
            <svg className="w-5 h-5" fill={isCollected ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 标签行 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {word.oxford === 1 && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
            牛津3000
          </span>
        )}
        {collinsStars && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-50 text-yellow-700">
            柯林斯 {collinsStars}
          </span>
        )}
        {word.tags.map((tag) => {
          const info = TAG_MAP[tag]
          if (!info) return null
          return (
            <span key={tag} className={`px-2 py-0.5 text-xs font-medium rounded-full ${info.color}`}>
              {info.label}
            </span>
          )
        })}
      </div>

      {/* 上下文释义区域 */}
      {/* 1. AI正在分析 */}
      {contextLoading && (
        <div className="mb-3 p-2.5 bg-green-50 border border-green-100 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-green-600">正在分析本文语境...</span>
          </div>
        </div>
      )}
      {/* 2. AI分析出错 */}
      {!contextLoading && contextError && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-100 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-red-600">{contextError}</span>
            </div>
            <button
              onClick={() => retryContext()}
              className="text-xs text-red-500 hover:text-red-700 underline ml-2 whitespace-nowrap"
            >
              重试
            </button>
          </div>
        </div>
      )}
      {/* 3. AI分析结果（优先级最高，覆盖本地匹配） */}
      {!contextLoading && contextInfo && (
        <div className="mb-3 p-2.5 bg-green-50 border border-green-100 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-green-700">本文语境</span>
            {contextInfo.cached && (
              <span className="text-[10px] text-green-600 bg-green-100 px-1 py-0.5 rounded">缓存</span>
            )}
            <button
              onClick={() => lookupContext(word.word, contextSentence, contextTranslation, true)}
              className="ml-auto text-xs text-green-600 hover:text-green-800 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重新生成
            </button>
          </div>
          <p className="text-sm font-medium text-green-800">{contextInfo.contextMeaning}</p>
          {contextInfo.phrase && (
            <div className="mt-1.5 pt-1.5 border-t border-green-200">
              <span className="text-xs text-green-600">属于词组：</span>
              <span className="text-sm font-semibold text-green-800">{contextInfo.phrase.text}</span>
              <span className="text-xs text-green-600 ml-1">— {contextInfo.phrase.meaning}</span>
            </div>
          )}
        </div>
      )}
      {/* 4. 本地匹配成功提示（无AI结果时显示） */}
      {!contextLoading && !contextInfo && localMatchedIndex >= 0 && (
        <div className="mb-3 px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-1.5">
          <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L7 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-blue-600">已根据译文自动匹配释义</span>
        </div>
      )}
      {/* 5. 本地未匹配 + 有上下文 → 显示AI分析按钮 */}
      {!contextLoading && !contextInfo && !contextError && localMatchedIndex < 0 && contextSentence && (
        <div className="mb-3">
          <button
            onClick={() => lookupContext(word.word, contextSentence, contextTranslation)}
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI分析本文语境
          </button>
        </div>
      )}

      {/* 词性占比条 */}
      {posEntries.length > 0 && (
        <div className="mb-3">
          <div className="flex gap-2 flex-wrap">
            {posEntries.map(({ pos, pct }) => (
              <span key={pos} className="inline-flex items-center gap-1 text-xs">
                <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                  {POS_LABELS[pos] || pos}
                </span>
                <span className="text-gray-400">{pct}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 英文释义 */}
      {definitions.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">英文释义</h4>
          <div className="space-y-1.5">
            {definitions.map((def, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{highlightPosInText(def, handleNestedLookup)}</p>
            ))}
          </div>
        </div>
      )}

      {/* 中文翻译 */}
      {translations.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">中文翻译</h4>
          <div className="space-y-1.5">
            {translations.map((tr, i) => {
              // AI结果优先，其次本地匹配
              const matchedIdx = contextInfo ? contextInfo.matchedIndex : localMatchedIndex
              const isMatched = matchedIdx === i
              return (
                <p key={i} className={`text-sm leading-relaxed rounded px-1.5 py-0.5 -mx-1.5 transition-colors ${
                  isMatched 
                    ? 'text-green-800 bg-green-50 font-medium border-l-2 border-green-400' 
                    : 'text-gray-800'
                }`}>
                  {isMatched && (
                    <svg className="w-3 h-3 inline-block mr-1 text-green-500 -mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L7 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {highlightPosInText(tr, handleNestedLookup)}
                </p>
              )
            })}
          </div>
        </div>
      )}

      {/* 词形变化 */}
      {Object.keys(word.exchange).length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">词形变化</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(word.exchange).map(([type, forms]) => (
              <span key={type} className="text-xs text-gray-600">
                <span className="text-gray-400">{type}:</span>{' '}
                {forms.map((form, idx) => (
                  <span key={idx}>
                    {idx > 0 && ', '}
                    <span
                      className="cursor-pointer text-blue-600 hover:underline"
                      onClick={(e) => { e.stopPropagation(); handleNestedLookup(form) }}
                    >
                      {form}
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 搭配/短语/用法区域 */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">搭配与用法</h4>
            {wordUsage?.cached && (
              <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">本地缓存</span>
            )}
          </div>
          {!wordUsage && !usageLoading ? (
            <button
              onClick={() => lookupUsage(word.word)}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              获取搭配
            </button>
          ) : wordUsage && !usageLoading ? (
            <button
              onClick={() => lookupUsage(word.word, true)}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重新生成
            </button>
          ) : null}
        </div>

        {usageLoading && (
          <div className="py-4 text-center">
            <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-2 text-xs text-gray-400">AI正在生成搭配...</p>
          </div>
        )}

        {usageError && !usageLoading && (
          <p className="text-xs text-gray-400">{usageError}</p>
        )}

        {wordUsage && !usageLoading && (
          <WordUsageContent usage={wordUsage} onWordClick={handleNestedLookup} />
        )}
      </div>

      {/* 词频信息 */}
      {(word.bnc || word.frq) && (
        <div className="pt-2 mt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {word.bnc && <span>BNC词频排名: {word.bnc}</span>}
            {word.bnc && word.frq && <span className="mx-2">|</span>}
            {word.frq && <span>当代语料库词频: {word.frq}</span>}
          </p>
        </div>
      )}
    </div>
  )
}

function WordUsageContent({ usage, onWordClick }: { usage: WordUsage; onWordClick?: (word: string) => void }) {
  return (
    <div className="space-y-3">
      {/* 常见搭配 */}
      {usage.collocations && usage.collocations.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-500 mb-1">常见搭配</h5>
          <div className="space-y-1">
            {usage.collocations.map((c, i) => (
              <div key={i} className="flex items-baseline gap-2 text-sm">
                {onWordClick
                  ? <span className="text-gray-800 font-medium"><ClickableWords text={c.en} onWordClick={onWordClick} /></span>
                  : <span className="text-gray-800 font-medium">{c.en}</span>
                }
                <span className="text-gray-400 text-xs">{c.zh}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 常用短语 */}
      {usage.phrases && usage.phrases.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-500 mb-1">常用短语</h5>
          <div className="space-y-1">
            {usage.phrases.map((p, i) => (
              <div key={i} className="flex items-baseline gap-2 text-sm">
                {onWordClick
                  ? <span className="text-gray-800 font-medium"><ClickableWords text={p.en} onWordClick={onWordClick} /></span>
                  : <span className="text-gray-800 font-medium">{p.en}</span>
                }
                <span className="text-gray-400 text-xs">{p.zh}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 用法要点 */}
      {usage.usage && usage.usage.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-gray-500 mb-1">用法要点</h5>
          <div className="space-y-2">
            {usage.usage.map((u, i) => (
              <div key={i} className="text-sm">
                <p className="text-gray-700 font-medium">{u.point}</p>
                {onWordClick
                  ? <p className="text-gray-500 italic mt-0.5"><ClickableWords text={u.example} onWordClick={onWordClick} /></p>
                  : <p className="text-gray-500 italic mt-0.5">{u.example}</p>
                }
                <p className="text-gray-400 text-xs mt-0.5">{u.translation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}