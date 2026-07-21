import { useDictStore, type WordDetail, type WordUsage } from '../store/dictStore'
import { useCollectionStore } from '../store/collectionStore'
import { useEffect } from 'react'
import { speakWord } from '../utils/speak'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={clearWord} />

      {/* 弹窗 */}
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white/20">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-sm font-medium text-gray-500">正在查词...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button onClick={clearWord} className="mt-4 px-6 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">关闭</button>
          </div>
        ) : notFound ? (
          <div className="p-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">{notFound}</h3>
              <button onClick={clearWord} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-sm text-gray-500">未在词典中找到该词</p>
            </div>
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
  
  const cleanedWord = word.word.toLowerCase().trim()
  const wordKey = `word:${cleanedWord}`
  const collectedId = collectedMap.get(wordKey)
  const isCollected = collectedId !== undefined && collectedId !== null
  
  const renderTimestamp = Date.now()
  console.log(`[WordPopup] [${renderTimestamp}] Render: wordKey=${wordKey}, isCollected=${isCollected}, id=${collectedId}`)

  // 嵌套查词：点击弹窗内的单词，直接查新词
  const handleNestedLookup = (newWord: string) => {
    lookupWord(newWord)
  }

  // 检查是否已收藏
  useEffect(() => {
    console.log(`[WordPopup] [${Date.now()}] useEffect checkCollected: ${cleanedWord}`)
    checkCollected('word', cleanedWord)
  }, [cleanedWord, checkCollected])

  // 收藏/取消收藏
  const handleToggleCollect = async () => {
    const clickTimestamp = Date.now()
    const existingId = collectedMap.get(wordKey)
    console.log(`[WordPopup] [${clickTimestamp}] handleToggleCollect: existingId=${existingId}`)

    if (existingId !== undefined && existingId !== null) {
      console.log(`[WordPopup] [${clickTimestamp}] Removing collection: ${existingId}`)
      await removeCollection(existingId)
    } else {
      console.log(`[WordPopup] [${clickTimestamp}] Adding collection for: ${cleanedWord}`)
      // 收藏单词
      await addCollection({
        type: 'word',
        content: cleanedWord,
        meaning: word.translation?.split('\n')[0] || '',
        phonetic: word.phonetic || undefined,
        sourceSentence: contextSentence || undefined,
        sourceTranslation: contextTranslation || undefined,
      })
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
    <div className="p-6">
      {/* 头部：单词 + 音标 + 发音按钮 */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">{word.word}</h3>
            {word.searchedForm && word.searchedForm !== word.word && (
              <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg">← {word.searchedForm}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            {word.ukphone && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">UK</span>
                <span className="text-sm text-blue-600 font-serif font-medium">/{word.ukphone}/</span>
                {word.ukspeech && (
                  <button
                    onClick={() => speakWord(word.word, word.ukspeech)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all hover:scale-110 active:scale-95"
                    title="英音发音"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            {word.usphone && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">US</span>
                <span className="text-sm text-blue-600 font-serif font-medium">/{word.usphone}/</span>
                {word.usspeech && (
                  <button
                    onClick={() => speakWord(word.word, word.usspeech)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all hover:scale-110 active:scale-95"
                    title="美音发音"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            {!word.ukphone && !word.usphone && word.phonetic && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-blue-600 font-serif font-medium">{word.phonetic}</span>
                <button
                  onClick={() => speakWord(word.word, word.speakUrl)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all hover:scale-110 active:scale-95"
                  title="朗读单词"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleCollect}
            className={`p-2.5 rounded-2xl transition-all ${isCollected ? 'text-amber-500 bg-amber-50 shadow-inner' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}
            title={isCollected ? '取消收藏' : '收藏生词'}
          >
            <svg className="w-6 h-6" fill={isCollected ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          <button onClick={onClose} className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 标签行 */}
      <div className="flex flex-wrap gap-2 mb-5">
        {word.oxford === 1 && (
          <span className="px-3 py-1 text-[11px] font-bold rounded-full bg-orange-50 text-orange-600 border border-orange-100">
            牛津3000
          </span>
        )}
        {collinsStars && (
          <span className="px-3 py-1 text-[11px] font-bold rounded-full bg-yellow-50 text-yellow-600 border border-yellow-100">
            柯林斯 {collinsStars}
          </span>
        )}
        {word.tags.map((tag) => {
          const info = TAG_MAP[tag]
          if (!info) return null
          return (
            <span key={tag} className={`px-3 py-1 text-[11px] font-bold rounded-full border ${info.color.replace('bg-', 'bg-opacity-50 bg-').replace('text-', 'border-opacity-20 border-')} ${info.color}`}>
              {info.label}
            </span>
          )
        })}
      </div>

      {/* 上下文释义区域 */}
      {/* 1. AI正在分析 */}
      {contextLoading && (
        <div className="mb-5 p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-emerald-700">正在分析本文语境...</span>
          </div>
        </div>
      )}
      {/* 2. AI分析出错 */}
      {!contextLoading && contextError && (
        <div className="mb-5 p-4 bg-red-50/50 border border-red-100 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-600">{contextError}</span>
            </div>
            <button
              onClick={() => retryContext()}
              className="text-xs font-bold text-red-500 hover:text-red-700 underline"
            >
              重试
            </button>
          </div>
        </div>
      )}
      {/* 3. AI分析结果 */}
      {!contextLoading && contextInfo && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1 bg-emerald-100 rounded-lg">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">本文语境</span>
            {contextInfo.cached && (
              <span className="text-[10px] font-bold text-emerald-600 bg-white/50 px-2 py-0.5 rounded-lg border border-emerald-100">缓存</span>
            )}
            <button
              onClick={() => lookupContext(word.word, contextSentence, contextTranslation, true)}
              className="ml-auto p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
              title="重新生成"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <p className="text-base font-bold text-emerald-900 leading-snug">{contextInfo.contextMeaning}</p>
          {contextInfo.phrase && (
            <div className="mt-3 pt-3 border-t border-emerald-200/50">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">词组搭配</span>
                <span className="text-sm font-black text-emerald-900">{contextInfo.phrase.text}</span>
              </div>
              <p className="text-sm text-emerald-700 mt-1">{contextInfo.phrase.meaning}</p>
            </div>
          )}
        </div>
      )}
      {/* 4. 本地匹配成功提示 */}
      {!contextLoading && !contextInfo && localMatchedIndex >= 0 && (
        <div className="mb-5 p-3 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-center gap-2">
          <div className="p-1 bg-blue-100 rounded-lg">
            <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L7 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-xs font-medium text-blue-700">已根据译文自动匹配释义</span>
        </div>
      )}
      {/* 5. AI分析按钮 */}
      {!contextLoading && !contextInfo && !contextError && localMatchedIndex < 0 && contextSentence && (
        <div className="mb-5">
          <button
            onClick={() => lookupContext(word.word, contextSentence, contextTranslation)}
            className="w-full py-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-700 rounded-2xl border border-blue-100 transition-all flex items-center justify-center gap-2 group shadow-sm"
          >
            <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-sm font-bold">AI 分析本文语境</span>
          </button>
        </div>
      )}

      {/* 词性占比条 */}
      {posEntries.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-3">
          {posEntries.map(({ pos, pct }) => (
            <div key={pos} className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 uppercase">
                {POS_LABELS[pos] || pos}
              </span>
              <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-gray-400">{pct}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 释义区域 */}
      <div className="space-y-6">
        {/* 英文释义 */}
        {definitions.length > 0 && (
          <div>
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">English Definitions</h4>
            <div className="space-y-3">
              {definitions.map((def, i) => (
                <div key={i} className="text-sm text-gray-700 leading-relaxed bg-gray-50/50 p-3 rounded-2xl border border-gray-100/50">
                  {highlightPosInText(def, handleNestedLookup)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 中文翻译 */}
        {translations.length > 0 && (
          <div>
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Chinese Translation</h4>
            <div className="space-y-2">
              {translations.map((tr, i) => {
                const matchedIdx = contextInfo ? contextInfo.matchedIndex : localMatchedIndex
                const isMatched = matchedIdx === i
                return (
                  <div key={i} className={`text-sm leading-relaxed rounded-2xl px-4 py-3 transition-all border ${
                    isMatched 
                      ? 'text-emerald-900 bg-emerald-50 font-bold border-emerald-200 shadow-sm' 
                      : 'text-gray-800 bg-white border-gray-100'
                  }`}>
                    <div className="flex items-start gap-2">
                      {isMatched && (
                        <div className="mt-0.5 p-0.5 bg-emerald-200 rounded-full">
                          <svg className="w-3 h-3 text-emerald-700" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L7 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1">
                        {highlightPosInText(tr, handleNestedLookup)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 近义词 */}
      {word.synonyms && word.synonyms.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">近义词</h4>
          <div className="space-y-1.5">
            {word.synonyms.map((syn, i) => (
              <div key={i} className="text-sm">
                <span className="text-gray-500 mr-2">{syn.pos}. {syn.tran}</span>
                <span className="text-blue-600">
                  {syn.words.map((w, idx) => (
                    <span key={idx}>
                      {idx > 0 && ', '}
                      <span
                        className="cursor-pointer hover:underline"
                        onClick={(e) => { e.stopPropagation(); handleNestedLookup(w) }}
                      >
                        {w}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
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

      {/* 在线词典短语 */}
      {word.phrases && word.phrases.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">常用短语</h4>
          <div className="space-y-1">
            {word.phrases.map((p, i) => (
              <div key={i} className="flex items-baseline gap-2 text-sm">
                <span className="text-gray-800 font-medium"><ClickableWords text={p.en} onWordClick={handleNestedLookup} /></span>
                <span className="text-gray-400 text-xs">{p.zh}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 在线词典例句 */}
      {word.sentences && word.sentences.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">双语例句</h4>
          <div className="space-y-2">
            {word.sentences.map((s, i) => (
              <div key={i} className="text-sm">
                <p className="text-gray-700 font-medium"><ClickableWords text={s.en} onWordClick={handleNestedLookup} /></p>
                <p className="text-gray-400 text-xs mt-0.5">{s.zh}</p>
              </div>
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