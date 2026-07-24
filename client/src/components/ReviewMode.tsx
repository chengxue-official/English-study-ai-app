import { useState, useEffect, useCallback, useRef } from 'react'
import { useCollectionStore, type CollectionItem } from '../store/collectionStore'
import { useConfigStore } from '../store/configStore'
import { speakWord, stopSpeaking } from '../utils/speak'
import type { WordDetail } from '../store/dictStore'
import { dbService } from '../services/database'
import { llmService } from '../services/llm'
import { cleanMnemonic } from '../utils/text'

// 词性缩写映射
const POS_LABELS: Record<string, string> = {
  n: '名词', v: '动词', a: '形容词', j: '形容词',
  r: '副词', c: '连词', i: '介词', u: '感叹词',
  t: '冠词', p: '代词', d: '限定词', s: '形容词',
  ad: '副词', adv: '副词', adj: '形容词',
  prep: '介词', conj: '连词', pron: '代词', interj: '感叹词',
  art: '冠词', num: '数词', det: '限定词',
  modal: '情态动词', aux: '助动词',
  vi: '不及物动词', vt: '及物动词', linkv: '系动词',
}

function highlightPosInText(text: string) {
  const posWithDot = /^(adj|adv|prep|conj|pron|interj|modal|aux|linkv|art|num|det|vi|vt|n|v|a|j|r|c|i|u|t|p|d|s|ad)\.\s*/i
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
        <span>{rest}</span>
      </span>
    )
  }
  return <span>{text}</span>
}

type ReviewState = 'ready' | 'question' | 'show-answer' | 'group-complete' | 'all-complete' | 'spelling-select' | 'spelling' | 'stats'

const GROUP_SIZE = 10

export default function ReviewMode({ onClose }: { onClose: () => void }) {
  const { items, fetchItems, updateReview, reviewStats, fetchReviewStats } = useCollectionStore()
  const [state, setState] = useState<ReviewState>('ready')
  // 全部待复习单词
  const [allWords, setAllWords] = useState<CollectionItem[]>([])
  // 当前正在复习的10个
  const [currentGroup, setCurrentGroup] = useState<CollectionItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [groupNumber, setGroupNumber] = useState(1)
  const [totalGroups, setTotalGroups] = useState(0)
  // 统计（本轮全部）
  const [knownCount, setKnownCount] = useState(0)
  const [unknownCount, setUnknownCount] = useState(0)
  const [unknownItems, setUnknownItems] = useState<CollectionItem[]>([])
  // 当前组统计
  const [groupKnown, setGroupKnown] = useState(0)
  const [groupUnknown, setGroupUnknown] = useState(0)
  const [groupUnknownItems, setGroupUnknownItems] = useState<CollectionItem[]>([])
  // 拼写测试
  const [spellingScope, setSpellingScope] = useState<'group' | 'session'>('group')
  const [spellingMode, setSpellingMode] = useState<'unknown' | 'all'>('unknown')
  const [spellingAnswers, setSpellingAnswers] = useState<Record<number, string>>({})
  const [spellingResults, setSpellingResults] = useState<Record<number, boolean>>({})
  const [spellingSubmitted, setSpellingSubmitted] = useState(false)
  const [currentSpellingIndex, setCurrentSpellingIndex] = useState(0)
  const autoPlayedRef = useRef(false)

  // 词典数据状态
  const [dictData, setDictData] = useState<WordDetail | null>(null)
  const [dictLoading, setDictLoading] = useState(false)

  // 助记数据状态
  const [mnemonicData, setMnemonicData] = useState<string | null>(null)
  const [mnemonicLoading, setMnemonicLoading] = useState(false)

  // 加载待复习的单词（优先到期复习）
  useEffect(() => {
    fetchItems(true, true)
  }, [])

  // 组件卸载时停止音频播放
  useEffect(() => {
    return () => { stopSpeaking() }
  }, [])

  const startReview = useCallback((type: 'word' | 'all') => {
    let pool = items
    if (type === 'word') {
      pool = items.filter(i => i.type === 'word')
    }
    if (pool.length === 0) return

    // 简单洗牌
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const groups = Math.ceil(shuffled.length / GROUP_SIZE)
    setAllWords(shuffled)
    setTotalGroups(groups)
    setGroupNumber(1)
    setCurrentGroup(shuffled.slice(0, Math.min(GROUP_SIZE, shuffled.length)))
    setCurrentIndex(0)
    setKnownCount(0)
    setUnknownCount(0)
    setUnknownItems([])
    setGroupKnown(0)
    setGroupUnknown(0)
    setGroupUnknownItems([])
    setSpellingAnswers({})
    setSpellingResults({})
    setSpellingSubmitted(false)
    autoPlayedRef.current = false
    setState('question')
  }, [items])

  // 进入下一组
  const startNextGroup = useCallback(() => {
    const nextGroupIdx = groupNumber // 0-based index for next group
    const start = nextGroupIdx * GROUP_SIZE
    const end = Math.min(start + GROUP_SIZE, allWords.length)
    if (start >= allWords.length) {
      setState('all-complete')
      return
    }
    setCurrentGroup(allWords.slice(start, end))
    setCurrentIndex(0)
    setGroupNumber(g => g + 1)
    setGroupKnown(0)
    setGroupUnknown(0)
    setGroupUnknownItems([])
    autoPlayedRef.current = false
    setState('question')
  }, [groupNumber, allWords])

  const nextCard = useCallback(() => {
    stopSpeaking()
    if (currentIndex + 1 >= currentGroup.length) {
      // 当前组完成
      if (groupNumber >= totalGroups) {
        setState('all-complete')
      } else {
        setState('group-complete')
      }
    } else {
      setCurrentIndex(i => i + 1)
      setState('question')
      autoPlayedRef.current = false
    }
  }, [currentIndex, currentGroup.length, groupNumber, totalGroups])

  const handleKnown = useCallback(async () => {
    const item = currentGroup[currentIndex]
    if (item) {
      await updateReview(item.id, true)
    }
    setKnownCount(c => c + 1)
    setGroupKnown(c => c + 1)
    nextCard()
  }, [currentGroup, currentIndex, updateReview, nextCard])

  const handleUnknown = useCallback(async () => {
    const item = currentGroup[currentIndex]
    if (item) {
      await updateReview(item.id, false)
      setUnknownItems(prev => [...prev, item])
      setGroupUnknownItems(prev => [...prev, item])
    }
    setUnknownCount(c => c + 1)
    setGroupUnknown(c => c + 1)
    // 展示释义
    setState('show-answer')
    autoPlayedRef.current = false
  }, [currentGroup, currentIndex, updateReview])

  const handleNextAfterUnknown = useCallback(() => {
    nextCard()
  }, [nextCard])

  const handleGenerateMnemonic = useCallback(async () => {
    const item = currentGroup[currentIndex]
    if (!item) return
    
    const { apiKey } = useConfigStore.getState().getConfig()
    if (!apiKey) {
      setMnemonicData('请先在设置中配置API Key')
      return
    }

    setMnemonicLoading(true)
    try {
      const word = item.content.toLowerCase().trim()
      const cacheKey = `mnemonic:${word}`
      
      // 1. 尝试从本地缓存获取
      const cached = await dbService.getWordContext(cacheKey)
      if (cached && typeof cached === 'string') {
        setMnemonicData(cleanMnemonic(cached))
        setMnemonicLoading(false)
        return
      }

      // 2. 调用 LLM 获取
      const mnemonic = await llmService.getWordMnemonic(word)
      if (mnemonic) {
        await dbService.saveWordContext(cacheKey, word, mnemonic)
        setMnemonicData(cleanMnemonic(mnemonic))
      } else {
        setMnemonicData('未能生成助记内容，请稍后再试。')
      }
    } catch (err) {
      console.error('Failed to fetch mnemonic:', err)
      setMnemonicData('请求出错，请稍后再试。')
    } finally {
      setMnemonicLoading(false)
    }
  }, [currentGroup, currentIndex])

  // 自动播放发音
  useEffect(() => {
    if (state === 'question' && currentGroup[currentIndex] && !autoPlayedRef.current) {
      autoPlayedRef.current = true
      const timer = setTimeout(() => {
        speakWord(currentGroup[currentIndex].content, dictData?.ukspeech || dictData?.usspeech)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [state, currentIndex, currentGroup, dictData])

  // 预加载词典数据以获取音标
  useEffect(() => {
    const item = currentGroup[currentIndex]
    if (item && state === 'question') {
      setDictLoading(true)
      setDictData(null)
      setMnemonicData(null)
      
      dbService.queryWord(item.content)
        .then(result => {
          if (result.found && result.data) {
            setDictData(result.data)
          }
        })
        .catch(err => console.error('Failed to fetch dict data:', err))
        .finally(() => setDictLoading(false))
    }
  }, [currentIndex, currentGroup, state])

  // 不认识后展示释义时自动播放
  useEffect(() => {
    if (state === 'show-answer' && currentGroup[currentIndex] && !autoPlayedRef.current) {
      autoPlayedRef.current = true
      speakWord(currentGroup[currentIndex].content, dictData?.ukspeech || dictData?.usspeech)
    }
  }, [state, currentIndex, currentGroup, dictData])

  const currentItem = currentGroup[currentIndex]

  // 准备阶段
  if (state === 'ready') {
    const wordCount = items.filter(i => i.type === 'word').length
    const totalCount = items.length

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">复习模式</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">暂无收藏内容可复习</p>
            <p className="text-xs text-gray-300 mt-1">先收藏一些单词或词组吧</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">选择要复习的内容：</p>
            {wordCount > 0 && (
              <button
                onClick={() => startReview('word')}
                className="w-full p-4 bg-blue-50 hover:bg-blue-100 rounded-xl text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📖</span>
                  <div>
                    <p className="font-medium text-blue-800">复习单词</p>
                    <p className="text-xs text-blue-600">{wordCount} 个单词 · 每{GROUP_SIZE}个一组</p>
                  </div>
                </div>
              </button>
            )}
            {totalCount > 0 && (
              <button
                onClick={() => startReview('all')}
                className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-xl text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="font-medium text-gray-800">全部复习</p>
                    <p className="text-xs text-gray-600">{totalCount} 条收藏 · 每{GROUP_SIZE}个一组</p>
                  </div>
                </div>
              </button>
            )}
            {totalCount > 0 && (
              <button
                onClick={() => {
                  fetchReviewStats()
                  setState('stats')
                }}
                className="w-full p-4 bg-purple-50 hover:bg-purple-100 rounded-xl text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <p className="font-medium text-purple-800">查看复习进度</p>
                    <p className="text-xs text-purple-600">艾宾浩斯记忆曲线统计</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // 统计视图
  if (state === 'stats') {
    const totalWords = reviewStats?.reduce((acc, s) => acc + s.count, 0) || 0
    const masteredCount = reviewStats?.find(s => s.stage === 6)?.count || 0
    const masteryRate = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-800">复习进度统计</h3>
          <button onClick={() => setState('ready')} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl p-6 text-white mb-6 shadow-lg">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-purple-100 text-xs font-medium uppercase tracking-wider mb-1">掌握程度</p>
              <p className="text-4xl font-bold">{masteryRate}%</p>
            </div>
            <div className="text-right">
              <p className="text-purple-100 text-xs font-medium uppercase tracking-wider mb-1">已掌握单词</p>
              <p className="text-2xl font-bold">{masteredCount} <span className="text-sm font-normal opacity-80">/ {totalWords}</span></p>
            </div>
          </div>
          <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white transition-all duration-1000" 
              style={{ width: `${masteryRate}%` }}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
            艾宾浩斯记忆阶段分布
          </h4>
          <div className="space-y-3">
            {reviewStats?.map((s) => {
              const percentage = totalWords > 0 ? (s.count / totalWords) * 100 : 0
              return (
                <div key={s.stage} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600 font-medium">{s.label}</span>
                    <span className="text-gray-400">{s.count} 个</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        s.stage === 6 ? 'bg-green-500' : s.stage === 0 ? 'bg-blue-400' : 'bg-purple-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => setState('ready')}
          className="w-full mt-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
        >
          返回
        </button>
      </div>
    )
  }

  // 答题阶段
  if (state === 'question' && currentItem) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-gray-400">
            {currentIndex + 1}/{currentGroup.length} · 第{groupNumber}/{totalGroups}组
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 进度条 */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full mb-6">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / currentGroup.length) * 100}%` }}
          />
        </div>

        {/* 卡片 - 单词 + 音标 + 发音 */}
        <div className="bg-white border-2 border-gray-100 rounded-2xl p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
          <p className="text-3xl font-bold text-gray-900 mb-3">{currentItem.content}</p>
          {(currentItem.phonetic || dictData?.phonetic) && (
            <p className="text-lg text-blue-600 font-serif mb-3">{currentItem.phonetic || dictData?.phonetic}</p>
          )}
          <button
            onClick={() => speakWord(currentItem.content, dictData?.ukspeech || dictData?.usspeech)}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
            title="朗读单词"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
          <p className="text-xs text-gray-300 mt-4">点击发音按钮听读音</p>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleUnknown}
            className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-xl transition-colors"
          >
            不认识
          </button>
          <button
            onClick={handleKnown}
            className="flex-1 py-3 bg-green-50 hover:bg-green-100 text-green-600 font-medium rounded-xl transition-colors"
          >
            认识
          </button>
        </div>
      </div>
    )
  }

  // 不认识后展示释义
  if (state === 'show-answer' && currentItem) {
    const translations = dictData?.translation?.split('\n').filter(Boolean) || []
    const definition = dictData?.definition || ''
    const exchange = dictData?.exchange || {}
    
    // 格式化词形变化
    const formLabels: Record<string, string> = {
      p: '过去式', d: '过去分词', i: '现在分词',
      3: '第三人称单数', s: '复数',
      r: '比较级', t: '最高级',
      0: '原型', 1: '原型变换'
    }
    const forms = Object.entries(exchange).map(([key, values]) => ({
      name: formLabels[key] || key,
      value: values.join(', ')
    })).filter(f => f.value)

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-gray-400">
            {currentIndex + 1}/{currentGroup.length} · 第{groupNumber}/{totalGroups}组
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="w-full h-1.5 bg-gray-100 rounded-full mb-6">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / currentGroup.length) * 100}%` }}
          />
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pb-4">
          {/* 词典释义卡片 */}
          <div className="bg-white border-2 border-blue-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-3">
                <h2 className="text-2xl font-bold text-gray-900">{currentItem.content}</h2>
                {(currentItem.phonetic || dictData?.phonetic) && (
                  <span className="text-sm text-blue-600 font-serif">{currentItem.phonetic || dictData?.phonetic}</span>
                )}
              </div>
              <button
                onClick={() => speakWord(currentItem.content, dictData?.ukspeech || dictData?.usspeech)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                title="朗读单词"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              </button>
            </div>

            {/* 助记功能区 */}
            <div className="mb-4">
              {!mnemonicData && !mnemonicLoading && (
                <button
                  onClick={handleGenerateMnemonic}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                >
                  <span className="text-sm">💡</span> AI 助记
                </button>
              )}
              {mnemonicLoading && (
                <div className="flex items-center gap-2 text-xs text-purple-500 bg-purple-50 px-3 py-2 rounded-lg">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-purple-500 border-t-transparent"></div>
                  正在生成助记内容...
                </div>
              )}
              {mnemonicData && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mt-2">
                  <h4 className="text-xs font-bold text-purple-700 mb-2 flex items-center gap-1.5">
                    <span className="text-sm">💡</span> 助记小贴士
                  </h4>
                  <div className="text-sm text-purple-900 whitespace-pre-wrap leading-relaxed">
                    {mnemonicData}
                  </div>
                </div>
              )}
            </div>

            {dictLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : dictData ? (
              <div className="space-y-4">
                {/* 标签 */}
                {dictData.tags && dictData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {dictData.tags.map((tag, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-1 rounded-md bg-gray-50 text-xs text-gray-600 border border-gray-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 中文翻译 */}
                {translations.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">中文翻译</h4>
                    <div className="space-y-1.5">
                      {translations.map((tr, i) => (
                        <p key={i} className="text-sm text-gray-800 leading-relaxed">
                          {highlightPosInText(tr)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* 英文释义 */}
                {definition && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">英文释义</h4>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap">
                      {definition}
                    </div>
                  </div>
                )}

                {/* 词形变化 */}
                {forms.length > 0 && (
                  <div className="pt-3 border-t border-gray-50">
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {forms.map((form, i) => (
                        <div key={i} className="text-xs">
                          <span className="text-gray-400 mr-1.5">{form.name}</span>
                          <span className="text-gray-700 font-medium">{form.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{currentItem.meaning || '暂无详细释义'}</p>
              </div>
            )}
          </div>

          {/* 收藏语境卡片 */}
          {currentItem.sourceSentence && (
            <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl p-5 shadow-sm">
              <h4 className="text-xs font-medium text-amber-600/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                收藏语境
              </h4>
              <p className="text-sm text-gray-800 leading-relaxed font-medium">
                {currentItem.sourceSentence}
              </p>
              {currentItem.sourceTranslation && (
                <p className="text-sm text-gray-600 mt-2 pt-2 border-t border-amber-200/50">
                  {currentItem.sourceTranslation}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={handleNextAfterUnknown}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm"
          >
            下一个
          </button>
        </div>
      </div>
    )
  }

  // 一组完成（还有更多组）
  if (state === 'group-complete') {
    return (
      <div className="p-6 text-center">
        <div className="text-3xl mb-3">👏</div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">第{groupNumber}组完成！</h3>
        <div className="flex justify-center gap-6 mb-4">
          <div>
            <p className="text-xl font-bold text-green-600">{groupKnown}</p>
            <p className="text-xs text-gray-500">认识</p>
          </div>
          <div>
            <p className="text-xl font-bold text-red-600">{groupUnknown}</p>
            <p className="text-xs text-gray-500">不认识</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          还有 {totalGroups - groupNumber} 组待复习
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setSpellingScope('group')
              setState('spelling-select')
            }}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors"
          >
            拼写测试
          </button>
          <button
            onClick={startNextGroup}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
          >
            下一组
          </button>
        </div>
      </div>
    )
  }

  // 全部完成
  if (state === 'all-complete') {
    const total = knownCount + unknownCount
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">全部复习完成！</h3>
        <div className="flex justify-center gap-6 mb-6">
          <div>
            <p className="text-2xl font-bold text-green-600">{knownCount}</p>
            <p className="text-xs text-gray-500">认识</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{unknownCount}</p>
            <p className="text-xs text-gray-500">不认识</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600">{total}</p>
            <p className="text-xs text-gray-500">总计</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
          >
            返回
          </button>
          <button
            onClick={() => {
              setSpellingScope('session')
              setState('spelling-select')
            }}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors"
          >
            拼写测试
          </button>
          <button
            onClick={() => startReview('word')}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
          >
            再来一轮
          </button>
        </div>
      </div>
    )
  }

  // 拼写测试模式选择
  if (state === 'spelling-select') {
    const unknownCountToDisplay = spellingScope === 'group' ? groupUnknownItems.length : unknownItems.length
    const allCountToDisplay = spellingScope === 'group' ? currentGroup.length : allWords.length

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            拼写测试 {spellingScope === 'group' ? `(第${groupNumber}组)` : '(全部)'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">选择拼写测试范围：</p>
        <div className="space-y-3">
          {unknownCountToDisplay > 0 && (
            <button
              onClick={() => {
                setSpellingMode('unknown')
                setSpellingAnswers({})
                setSpellingResults({})
                setSpellingSubmitted(false)
                setCurrentSpellingIndex(0)
                setState('spelling')
              }}
              className="w-full p-4 bg-red-50 hover:bg-red-100 rounded-xl text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">✍️</span>
                <div>
                  <p className="font-medium text-red-800">仅不认识的单词</p>
                  <p className="text-xs text-red-600">{unknownCountToDisplay} 个单词</p>
                </div>
              </div>
            </button>
          )}
          <button
            onClick={() => {
              setSpellingMode('all')
              setSpellingAnswers({})
              setSpellingResults({})
              setSpellingSubmitted(false)
              setCurrentSpellingIndex(0)
              setState('spelling')
            }}
            className="w-full p-4 bg-blue-50 hover:bg-blue-100 rounded-xl text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">📝</span>
              <div>
                <p className="font-medium text-blue-800">全部单词</p>
                <p className="text-xs text-blue-600">{allCountToDisplay} 个单词</p>
              </div>
            </div>
          </button>
        </div>
        <button
          onClick={() => {
            if (groupNumber < totalGroups) {
              startNextGroup()
            } else {
              setState('all-complete')
            }
          }}
          className="w-full mt-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
        >
          跳过测试，继续复习
        </button>
      </div>
    )
  }

  // 拼写测试
  if (state === 'spelling') {
    const wordsToSpell = spellingScope === 'group'
      ? (spellingMode === 'unknown' ? groupUnknownItems : currentGroup)
      : (spellingMode === 'unknown' ? unknownItems : allWords)
    
    const currentSpellingItem = wordsToSpell[currentSpellingIndex]
    const isLast = currentSpellingIndex === wordsToSpell.length - 1
    const answer = spellingAnswers[currentSpellingItem?.id] || ''
    const isCorrect = spellingResults[currentSpellingItem?.id]
    const showResult = spellingResults[currentSpellingItem?.id] !== undefined

    const handleCheck = () => {
      const userAnswer = answer.trim().toLowerCase()
      const correct = userAnswer === currentSpellingItem.content.toLowerCase()
      setSpellingResults(prev => ({ ...prev, [currentSpellingItem.id]: correct }))
      
      // 如果正确，自动播放发音
      if (correct) {
        speakWord(currentSpellingItem.content)
      }
    }

    const handleNextSpelling = () => {
      if (isLast) {
        setSpellingSubmitted(true)
      } else {
        setCurrentSpellingIndex(i => i + 1)
      }
    }

    // 拼写测试完成后的总结视图
    if (spellingSubmitted) {
      const correctCount = Object.values(spellingResults).filter(Boolean).length
      const totalCount = wordsToSpell.length
      const accuracy = Math.round((correctCount / totalCount) * 100)

      return (
        <div className="p-6">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-blue-50 rounded-full mb-4">
              <span className="text-5xl">
                {accuracy === 100 ? '🏆' : accuracy >= 80 ? '🌟' : accuracy >= 60 ? '👍' : '💪'}
              </span>
            </div>
            <h3 className="text-2xl font-black text-gray-900">拼写测试完成</h3>
            <p className="text-gray-500 mt-1">
              {accuracy === 100 ? '完美！全部正确' : accuracy >= 80 ? '太棒了，继续保持' : accuracy >= 60 ? '表现不错，再接再厉' : '加油，多复习几次'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-blue-50 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">正确数</p>
              <p className="text-3xl font-black text-blue-600">{correctCount} <span className="text-sm font-normal text-blue-300">/ {totalCount}</span></p>
            </div>
            <div className="bg-indigo-50 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">正确率</p>
              <p className="text-3xl font-black text-indigo-600">{accuracy}%</p>
            </div>
          </div>
          
          <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">错词回顾</p>
            {wordsToSpell.map(item => {
              const isCorrect = spellingResults[item.id]
              return (
                <div 
                  key={item.id} 
                  className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                    isCorrect ? 'border-green-50 bg-green-50/30' : 'border-red-50 bg-red-50/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => speakWord(item.content)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        isCorrect ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                      </svg>
                    </button>
                    <div>
                      <p className={`font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>{item.content}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{item.meaning}</p>
                    </div>
                  </div>
                  <span className="text-xl">{isCorrect ? '✅' : '❌'}</span>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setState('ready')}
              className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all active:scale-95"
            >
              返回首页
            </button>
            <button
              onClick={() => {
                if (groupNumber < totalGroups) {
                  startNextGroup()
                } else {
                  setState('all-complete')
                }
              }}
              className="flex-[1.5] py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-200 active:scale-95"
            >
              {groupNumber < totalGroups ? '下一组复习' : '完成复习'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            拼写测试 ({currentSpellingIndex + 1}/{wordsToSpell.length})
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 进度条 */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full mb-8">
          <div
            className="h-full bg-amber-500 rounded-full transition-all"
            style={{ width: `${((currentSpellingIndex + 1) / wordsToSpell.length) * 100}%` }}
          />
        </div>

        <div className="bg-white border-2 border-amber-100 rounded-2xl p-8 text-center mb-6">
          <p className="text-sm text-gray-500 mb-2">请拼写以下单词：</p>
          <p className="text-xl font-bold text-gray-800 mb-6">{currentSpellingItem?.meaning}</p>
          
          <input
            autoFocus
            type="text"
            value={answer}
            onChange={(e) => {
              if (!showResult) {
                setSpellingAnswers(prev => ({ ...prev, [currentSpellingItem.id]: e.target.value }))
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (!showResult) handleCheck()
                else handleNextSpelling()
              }
            }}
            disabled={showResult}
            placeholder="在此输入英文..."
            className={`w-full px-4 py-3 text-center text-2xl font-bold rounded-xl border-2 transition-all focus:outline-none ${
              showResult
                ? isCorrect
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100'
            }`}
          />

          {showResult && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2">
              {isCorrect ? (
                <p className="text-green-600 font-bold flex items-center justify-center gap-2">
                  <span>✨</span> 太棒了！正确
                </p>
              ) : (
                <div className="text-red-600">
                  <p className="font-bold mb-1">✗ 拼写错误</p>
                  <p className="text-2xl font-bold tracking-wider">{currentSpellingItem.content}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {!showResult ? (
            <button
              onClick={handleCheck}
              disabled={!answer.trim()}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-lg shadow-amber-200"
            >
              检查答案
            </button>
          ) : (
            <button
              onClick={handleNextSpelling}
              className={`w-full py-3 font-bold rounded-xl transition-colors shadow-lg ${
                isCorrect 
                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-200' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
              }`}
            >
              {isLast ? '查看结果' : '下一个'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}