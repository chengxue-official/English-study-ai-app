import { useState, useEffect } from 'react'
import { useSentenceStore, type SentenceDetail } from '../store/sentenceStore'
import { useCollectionStore } from '../store/collectionStore'

// 从句类型颜色映射
const CLAUSE_TYPE_COLORS: Record<string, string> = {
  '定语从句': 'bg-purple-50 text-purple-700 border-purple-100 shadow-sm',
  '状语从句': 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm',
  '名词性从句': 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm',
  '主语从句': 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm',
  '宾语从句': 'bg-cyan-50 text-cyan-700 border-cyan-100 shadow-sm',
  '表语从句': 'bg-indigo-50 text-indigo-700 border-indigo-100 shadow-sm',
  '同位语从句': 'bg-teal-50 text-teal-700 border-teal-100 shadow-sm',
}

// 修饰类型颜色映射
const MODIFIER_TYPE_COLORS: Record<string, string> = {
  '定语': 'bg-pink-50 text-pink-700 border-pink-100',
  '状语': 'bg-orange-50 text-orange-700 border-orange-100',
  '插入语': 'bg-slate-50 text-slate-600 border-slate-100',
  '同位语': 'bg-teal-50 text-teal-700 border-teal-100',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={clearDetail} />

      {/* 弹窗 */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white/20">
        {detailLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-sm font-bold text-gray-600">AI 正在深度解析长难句...</p>
            <p className="mt-2 text-xs text-gray-400">提取主干、标注从句、识别修饰成分</p>
          </div>
        ) : detailError ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-red-600">{detailError}</p>
            <button onClick={clearDetail} className="mt-4 px-6 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">关闭</button>
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
    <div className="p-6">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 rounded-2xl border border-amber-100">
            <span className="text-xl">🧠</span>
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900 tracking-tight">长难句深度分析</h3>
            <div className="flex items-center gap-2 mt-1">
              {detail.cached && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">本地缓存</span>
              )}
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">AI Powered</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => analyzeDetail(sentence, true)}
            disabled={detailLoading}
            className="p-2 text-amber-600 hover:bg-amber-50 rounded-2xl transition-all disabled:opacity-50"
            title="重新生成"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 原句 */}
      <div className="mb-6 p-5 bg-gradient-to-br from-amber-50/50 to-orange-50/50 rounded-3xl border border-amber-100/50 shadow-sm">
        <p className="text-base font-medium text-gray-800 leading-relaxed italic">"{sentence}"</p>
      </div>

      {/* 句子主干 */}
      {(safeTrunk.subject || safeTrunk.predicate || safeTrunk.object) && (
        <div className="mb-8">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Sentence Trunk</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {safeTrunk.subject && (
              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl shadow-sm">
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider block mb-1">Subject</span>
                <span className="text-sm font-black text-rose-900">{safeTrunk.subject}</span>
              </div>
            )}
            {safeTrunk.predicate && (
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl shadow-sm">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider block mb-1">Predicate</span>
                <span className="text-sm font-black text-blue-900">{safeTrunk.predicate}</span>
              </div>
            )}
            {safeTrunk.object && (
              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl shadow-sm">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider block mb-1">Object/Comp</span>
                <span className="text-sm font-black text-emerald-900">{safeTrunk.object}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 从句标注 */}
      {safeClauses.length > 0 && (
        <div className="mb-8">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Clause Analysis</h4>
          <div className="space-y-3">
            {safeClauses.map((clause, i) => {
              const colorClass = CLAUSE_TYPE_COLORS[clause.type] || 'bg-gray-50 text-gray-700 border-gray-100'
              return (
                <div key={i} className={`p-4 rounded-2xl border ${colorClass}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wider">{clause.type}</span>
                    {clause.marker && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-white/60 rounded-lg border border-black/5">
                        引导词: <span className="font-mono font-black">{clause.marker}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{clause.content}</p>
                  {clause.role && (
                    <div className="mt-2 pt-2 border-t border-black/5">
                      <p className="text-[11px] font-bold opacity-60 italic">{clause.role}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 修饰成分（可折叠） */}
      {safeModifiers.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Modifiers</h4>
            <button
              onClick={() => setModifiersCollapsed(!modifiersCollapsed)}
              className="text-[10px] font-black text-gray-400 hover:text-gray-600 flex items-center gap-1 uppercase tracking-wider"
            >
              {modifiersCollapsed ? 'Expand' : 'Collapse'}
              <svg className={`w-3 h-3 transition-transform ${modifiersCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          {!modifiersCollapsed && (
            <div className="grid grid-cols-1 gap-2">
              {safeModifiers.map((mod, i) => {
                const colorClass = MODIFIER_TYPE_COLORS[mod.type] || 'bg-gray-50 text-gray-600 border-gray-100'
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-2xl border ${colorClass}`}>
                    <span className="text-[10px] font-black uppercase tracking-wider mt-0.5">{mod.type}</span>
                    <div className="flex-1">
                      <span className="text-sm font-medium">{mod.content}</span>
                      {mod.target && (
                        <span className="text-[11px] font-bold ml-2 opacity-40">→ {mod.target}</span>
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
        <div className="mb-8">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Hierarchical Structure</h4>
          <div className="bg-slate-900 rounded-[2rem] p-6 font-mono text-sm space-y-2 shadow-inner">
            {safeStructure.map((item, i) => {
              const icon = STRUCTURE_ICONS[item.type] || '📌'
              return (
                <div key={i} style={{ paddingLeft: `${item.level * 24}px` }} className="flex items-center gap-3">
                  <span className="text-base">{icon}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${
                    item.type === '主干' ? 'bg-rose-500 text-white' :
                    item.type === '从句' ? 'bg-indigo-500 text-white' :
                    'bg-pink-500 text-white'
                  }`}>{item.type}</span>
                  <span className="text-slate-300 font-medium">{item.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 分析提示 */}
      {safeTips.length > 0 && (
        <div className="pt-6 border-t border-gray-100 mb-8">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Learning Tips</h4>
          <div className="space-y-3">
            {safeTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-amber-50/30 rounded-2xl border border-amber-100/50">
                <span className="text-lg mt-0.5">💡</span>
                <p className="text-sm font-medium text-amber-900/80 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 词组搭配 */}
      {safePhrases.length > 0 && (
        <div className="pt-6 border-t border-gray-100 mb-8">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Key Phrases</h4>
          <div className="flex flex-wrap gap-3">
            {safePhrases.map((p, i) => (
              <PhraseCard key={i} phrase={p.phrase} meaning={p.meaning} type={p.type} sentence={sentence} />
            ))}
          </div>
        </div>
      )}

      {/* 固定句型 */}
      {safePatterns.length > 0 && (
        <div className="pt-6 border-t border-gray-100 mb-8">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Sentence Patterns</h4>
          <div className="grid grid-cols-1 gap-3">
            {safePatterns.map((p, i) => (
              <div key={i} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-indigo-900 uppercase tracking-wider">{p.name}</span>
                  <code className="text-[10px] px-2 py-1 bg-white rounded-lg font-mono font-black text-indigo-600 border border-indigo-100">{p.pattern}</code>
                </div>
                {p.example && (
                  <p className="text-xs font-medium text-indigo-700/60 italic">"{p.example}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 考点提示 */}
      {safeExamPoints.length > 0 && (
        <div className="pt-6 border-t border-gray-100 mb-8">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Exam Points</h4>
          <div className="grid grid-cols-1 gap-3">
            {safeExamPoints.map((e, i) => (
              <div key={i} className="flex items-start gap-4 p-4 bg-rose-50/30 rounded-2xl border border-rose-100/50">
                <span className={`text-[10px] px-2 py-1 rounded-lg font-black uppercase tracking-wider shrink-0 ${
                  e.importance === '高' ? 'bg-rose-500 text-white' :
                  e.importance === '中' ? 'bg-amber-500 text-white' :
                  'bg-slate-400 text-white'
                }`}>{e.importance}</span>
                <div>
                  <span className="text-sm font-black text-rose-900">{e.point}</span>
                  {e.description && (
                    <p className="text-xs font-medium text-rose-700/60 mt-1 leading-relaxed">{e.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 收藏长难句 */}
      <div className="pt-6 border-t border-gray-100">
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
  const { checkCollected, addCollection, removeCollection, collectedMap } = useCollectionStore()
  
  const phraseKey = `phrase:${phrase.toLowerCase()}`
  const isCollected = !!collectedMap.get(phraseKey)

  useEffect(() => {
    checkCollected('phrase', phrase.toLowerCase())
  }, [checkCollected, phrase])

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const existingId = collectedMap.get(phraseKey)

    if (existingId) {
      await removeCollection(existingId)
    } else {
      await addCollection({
        type: 'phrase',
        content: phrase.toLowerCase(),
        meaning,
        sourceSentence: sentence,
        tags: ['长难句分析'],
      })
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
  const { checkCollected, addCollection, removeCollection, collectedMap } = useCollectionStore()
  
  const sentenceKey = `sentence:${sentence}`
  const isCollected = !!collectedMap.get(sentenceKey)

  useEffect(() => {
    checkCollected('sentence', sentence)
  }, [checkCollected, sentence])

  const handleToggle = async () => {
    const existingId = collectedMap.get(sentenceKey)

    if (existingId) {
      await removeCollection(existingId)
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