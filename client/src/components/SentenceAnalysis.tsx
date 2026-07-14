import { useState, useEffect } from 'react'
import { useSentenceStore, type SentenceDetail } from '../store/sentenceStore'
import { useCollectionStore } from '../store/collectionStore'

// 从句类型颜色映射
const CLAUSE_TYPE_COLORS: Record<string, string> = {
  '定语从句': 'bg-purple-50 text-purple-700 border-purple-200',
  '状语从句': 'bg-green-50 text-green-700 border-green-200',
  '名词性从句': 'bg-blue-50 text-blue-700 border-blue-200',
  '主语从句': 'bg-blue-50 text-blue-700 border-blue-200',
  '宾语从句': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  '表语从句': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  '同位语从句': 'bg-teal-50 text-teal-700 border-teal-200',
}

// 修饰类型颜色映射
const MODIFIER_TYPE_COLORS: Record<string, string> = {
  '定语': 'bg-pink-50 text-pink-700 border-pink-200',
  '状语': 'bg-orange-50 text-orange-700 border-orange-200',
  '插入语': 'bg-gray-50 text-gray-600 border-gray-200',
  '同位语': 'bg-teal-50 text-teal-700 border-teal-200',
}

// 结构层次类型图标
const STRUCTURE_ICONS: Record<string, string> = {
  '主干': '🏠',
  '从句': '🔗',
  '修饰': '✨',
}

export default function SentenceAnalysis() {
  const { detailLoading, currentDetail, detailError, detailSentence, clearDetail } = useSentenceStore()
  const [modifiersCollapsed, setModifiersCollapsed] = useState(false)

  if (!detailSentence && !detailLoading && !detailError) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={clearDetail} />

      {/* 弹窗 */}
      <div className="relative w-[calc(100%-2rem)] md:w-[560px] max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        {detailLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm text-gray-500">AI正在分析长难句...</p>
            <p className="mt-1 text-xs text-gray-400">提取主干、标注从句、识别修饰成分</p>
          </div>
        ) : detailError ? (
          <div className="p-6 text-center">
            <p className="text-sm text-red-600">{detailError}</p>
            <button onClick={clearDetail} className="mt-3 text-sm text-gray-500 hover:text-gray-700">关闭</button>
          </div>
        ) : currentDetail ? (
          <DetailContent
            detail={currentDetail}
            sentence={detailSentence || ''}
            onClose={clearDetail}
            modifiersCollapsed={modifiersCollapsed}
            setModifiersCollapsed={setModifiersCollapsed}
          />
        ) : null}
      </div>
    </div>
  )
}

function DetailContent({
  detail,
  sentence,
  onClose,
  modifiersCollapsed,
  setModifiersCollapsed,
}: {
  detail: SentenceDetail
  sentence: string
  onClose: () => void
  modifiersCollapsed: boolean
  setModifiersCollapsed: (v: boolean) => void
}) {
  const analyzeDetail = useSentenceStore((s) => s.analyzeDetail)
  const detailLoading = useSentenceStore((s) => s.detailLoading)
  // 防御性数据校验：确保每个字段类型正确
  const safeTrunk = detail.trunk && typeof detail.trunk === 'object' && !Array.isArray(detail.trunk)
    ? {
        subject: typeof detail.trunk.subject === 'string' ? detail.trunk.subject : '',
        predicate: typeof detail.trunk.predicate === 'string' ? detail.trunk.predicate : '',
        object: typeof detail.trunk.object === 'string' ? detail.trunk.object : '',
      }
    : { subject: '', predicate: '', object: '' }

  const safeClauses = Array.isArray(detail.clauses)
    ? detail.clauses.filter(c => c && typeof c === 'object').map(c => ({
        type: typeof c.type === 'string' ? c.type : '未知从句',
        marker: typeof c.marker === 'string' ? c.marker : '',
        content: typeof c.content === 'string' ? c.content : '',
        role: typeof c.role === 'string' ? c.role : '',
      }))
    : []

  const safeModifiers = Array.isArray(detail.modifiers)
    ? detail.modifiers.filter(m => m && typeof m === 'object').map(m => ({
        type: typeof m.type === 'string' ? m.type : '修饰',
        content: typeof m.content === 'string' ? m.content : '',
        target: typeof m.target === 'string' ? m.target : '',
      }))
    : []

  const safeStructure = Array.isArray(detail.structure)
    ? detail.structure.filter(s => s && typeof s === 'object').map(s => ({
        level: typeof s.level === 'number' ? s.level : 0,
        text: typeof s.text === 'string' ? s.text : '',
        type: typeof s.type === 'string' ? s.type : '主干',
      }))
    : []

  const safeTips = Array.isArray(detail.tips)
    ? detail.tips.filter((t: unknown) => typeof t === 'string')
    : []

  // P2-1新增字段防御性校验
  const safePhrases = Array.isArray(detail.phrases)
    ? detail.phrases.filter(p => p && typeof p === 'object').map(p => ({
        phrase: typeof p.phrase === 'string' ? p.phrase : '',
        meaning: typeof p.meaning === 'string' ? p.meaning : '',
        type: typeof p.type === 'string' ? p.type : '固定搭配',
      }))
    : []

  const safePatterns = Array.isArray(detail.patterns)
    ? detail.patterns.filter(p => p && typeof p === 'object').map(p => ({
        pattern: typeof p.pattern === 'string' ? p.pattern : '',
        name: typeof p.name === 'string' ? p.name : '',
        example: typeof p.example === 'string' ? p.example : '',
      }))
    : []

  const safeExamPoints = Array.isArray(detail.examPoints)
    ? detail.examPoints.filter(e => e && typeof e === 'object').map(e => ({
        point: typeof e.point === 'string' ? e.point : '',
        description: typeof e.description === 'string' ? e.description : '',
        importance: typeof e.importance === 'string' ? e.importance : '中',
      }))
    : []

  return (
    <div className="p-5">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-base font-bold text-gray-900 mb-1">长难句分析</h3>
          {detail.cached && (
            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">本地缓存</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => analyzeDetail(sentence, true)}
            disabled={detailLoading}
            className="text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
            title="重新调用AI分析，覆盖旧结果"
          >
            重新生成
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 原句 */}
      <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
        <p className="text-sm text-gray-800 leading-relaxed">{sentence}</p>
      </div>

      {/* 句子主干 */}
      {(safeTrunk.subject || safeTrunk.predicate || safeTrunk.object) && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">句子主干</h4>
          <div className="flex flex-wrap gap-2">
            {safeTrunk.subject && (
              <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-[10px] text-red-400 block">主语</span>
                <span className="text-sm font-medium text-red-700">{safeTrunk.subject}</span>
              </div>
            )}
            {safeTrunk.predicate && (
              <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-[10px] text-blue-400 block">谓语</span>
                <span className="text-sm font-medium text-blue-700">{safeTrunk.predicate}</span>
              </div>
            )}
            {safeTrunk.object && (
              <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-[10px] text-green-400 block">宾语/表语</span>
                <span className="text-sm font-medium text-green-700">{safeTrunk.object}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 从句标注 */}
      {safeClauses.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">从句分析</h4>
          <div className="space-y-2">
            {safeClauses.map((clause, i) => {
              const colorClass = CLAUSE_TYPE_COLORS[clause.type] || 'bg-gray-50 text-gray-700 border-gray-200'
              return (
                <div key={i} className={`p-2.5 rounded-lg border ${colorClass}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold">{clause.type}</span>
                    {clause.marker && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/60 rounded">
                        引导词: <span className="font-mono font-bold">{clause.marker}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{clause.content}</p>
                  {clause.role && (
                    <p className="text-[11px] mt-1 opacity-70">{clause.role}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 修饰成分（可折叠） */}
      {safeModifiers.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">修饰成分</h4>
            <button
              onClick={() => setModifiersCollapsed(!modifiersCollapsed)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              {modifiersCollapsed ? '展开' : '折叠'}
              <svg className={`w-3 h-3 transition-transform ${modifiersCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          {!modifiersCollapsed && (
            <div className="space-y-1.5">
              {safeModifiers.map((mod, i) => {
                const colorClass = MODIFIER_TYPE_COLORS[mod.type] || 'bg-gray-50 text-gray-600 border-gray-200'
                return (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border ${colorClass}`}>
                    <span className="text-xs font-bold whitespace-nowrap">{mod.type}</span>
                    <div className="flex-1">
                      <span className="text-sm">{mod.content}</span>
                      {mod.target && (
                        <span className="text-[11px] ml-1 opacity-60">→ {mod.target}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 结构层次 */}
      {safeStructure.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">结构层次</h4>
          <div className="bg-gray-50 rounded-lg p-3 font-mono text-sm space-y-1">
            {safeStructure.map((item, i) => {
              const icon = STRUCTURE_ICONS[item.type] || '📌'
              return (
                <div key={i} style={{ paddingLeft: `${item.level * 20}px` }}>
                  <span className="mr-1">{icon}</span>
                  <span className={`text-xs px-1 py-0.5 rounded ${
                    item.type === '主干' ? 'bg-red-100 text-red-700' :
                    item.type === '从句' ? 'bg-purple-100 text-purple-700' :
                    'bg-pink-100 text-pink-700'
                  }`}>{item.type}</span>
                  <span className="ml-2 text-gray-700">{item.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 分析提示 */}
      {safeTips.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">学习提示</h4>
          <div className="space-y-1">
            {safeTips.map((tip, i) => (
              <p key={i} className="text-sm text-gray-600 leading-relaxed">
                <span className="text-amber-500 mr-1">💡</span>{tip}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 词组搭配 */}
      {safePhrases.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">词组搭配</h4>
          <div className="flex flex-wrap gap-2">
            {safePhrases.map((p, i) => (
              <PhraseCard key={i} phrase={p.phrase} meaning={p.meaning} type={p.type} sentence={sentence} />
            ))}
          </div>
        </div>
      )}

      {/* 固定句型 */}
      {safePatterns.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">固定句型</h4>
          <div className="space-y-2">
            {safePatterns.map((p, i) => (
              <div key={i} className="p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-indigo-700">{p.name}</span>
                  <code className="text-[11px] px-1.5 py-0.5 bg-white rounded font-mono text-indigo-600">{p.pattern}</code>
                </div>
                {p.example && (
                  <p className="text-xs text-indigo-600/70">{p.example}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 考点提示 */}
      {safeExamPoints.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">考点提示</h4>
          <div className="space-y-2">
            {safeExamPoints.map((e, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                  e.importance === '高' ? 'bg-red-200 text-red-800' :
                  e.importance === '中' ? 'bg-amber-200 text-amber-800' :
                  'bg-gray-200 text-gray-700'
                }`}>{e.importance}</span>
                <div>
                  <span className="text-sm font-medium text-red-700">{e.point}</span>
                  {e.description && (
                    <p className="text-xs text-red-600/70 mt-0.5">{e.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 收藏长难句 */}
      <div className="pt-3 border-t border-gray-100">
        <SentenceCollectButton sentence={sentence} detail={detail} />
      </div>
    </div>
  )
}

// 词组搭配类型颜色映射
const PHRASE_TYPE_COLORS: Record<string, string> = {
  '动词短语': 'bg-blue-50 text-blue-700 border-blue-200',
  '介词短语': 'bg-green-50 text-green-700 border-green-200',
  '固定搭配': 'bg-purple-50 text-purple-700 border-purple-200',
  '形容词短语': 'bg-pink-50 text-pink-700 border-pink-200',
}

/** 词组搭配卡片 - 可收藏 */
function PhraseCard({ phrase, meaning, type, sentence }: { phrase: string; meaning: string; type: string; sentence: string }) {
  const { checkCollected, addCollection, removeCollection, items } = useCollectionStore()
  const [isCollected, setIsCollected] = useState(false)

  useEffect(() => {
    checkCollected('phrase', phrase.toLowerCase()).then(setIsCollected)
  }, [checkCollected, phrase])

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isCollected) {
      const item = items.find(i => i.type === 'phrase' && i.content === phrase.toLowerCase())
      if (item) {
        await removeCollection(item.id)
        setIsCollected(false)
      }
    } else {
      await addCollection({
        type: 'phrase',
        content: phrase.toLowerCase(),
        meaning,
        sourceSentence: sentence,
        tags: ['长难句分析'],
      })
      setIsCollected(true)
    }
  }

  const colorClass = PHRASE_TYPE_COLORS[type] || PHRASE_TYPE_COLORS['固定搭配']

  return (
    <div className={`group relative px-2.5 py-1.5 rounded-lg border ${colorClass} cursor-default`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] opacity-60">{type}</span>
        <span className="text-sm font-medium">{phrase}</span>
        <span className="text-xs opacity-70">— {meaning}</span>
      </div>
      <button
        onClick={handleToggle}
        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
          isCollected ? 'text-amber-500 bg-white shadow-sm' : 'text-gray-400 bg-white shadow-sm hover:text-amber-400'
        }`}
        title={isCollected ? '取消收藏' : '收藏词组'}
      >
        <svg className="w-3.5 h-3.5" fill={isCollected ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>
    </div>
  )
}

/** 长难句收藏按钮 */
function SentenceCollectButton({ sentence, detail }: { sentence: string; detail: SentenceDetail }) {
  const { checkCollected, addCollection, removeCollection, items } = useCollectionStore()
  const [isCollected, setIsCollected] = useState(false)

  useEffect(() => {
    checkCollected('sentence', sentence).then(setIsCollected)
  }, [checkCollected, sentence])

  const handleToggle = async () => {
    if (isCollected) {
      const item = items.find(i => i.type === 'sentence' && i.content === sentence)
      if (item) {
        await removeCollection(item.id)
        setIsCollected(false)
      }
    } else {
      // 构建收藏内容摘要：主干+从句类型
      const trunkStr = [detail.trunk.subject, detail.trunk.predicate, detail.trunk.object].filter(Boolean).join(' → ')
      const clauseTypes = (detail.clauses || []).map(c => c.type).join('、')
      const meaning = trunkStr + (clauseTypes ? ` | ${clauseTypes}` : '')

      await addCollection({
        type: 'sentence',
        content: sentence,
        meaning,
        sourceSentence: sentence,
        tags: ['长难句'],
      })
      setIsCollected(true)
    }
  }

  return (
    <button
      onClick={handleToggle}
      className={`w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
        isCollected
          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
          : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
      }`}
    >
      <svg className="w-4 h-4" fill={isCollected ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
      {isCollected ? '已收藏此长难句' : '收藏此长难句'}
    </button>
  )
}