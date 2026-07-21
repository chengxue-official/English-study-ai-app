import { useState } from 'react'
import { useArticleStore } from '../store/articleStore'
import { useDictStore } from '../store/dictStore'
import { useSentenceStore, type ParagraphAnalysis } from '../store/sentenceStore'
import { usePhraseStore, type PhraseMatch, type ParagraphPhrases } from '../store/phraseStore'
import { useUncommonStore, type UncommonWord, type ParagraphUncommon } from '../store/uncommonStore'
import SentenceAnalysis from './SentenceAnalysis'
import ArticleChat from './ArticleChat'

/**
 * 将英文文本渲染为可点击的单词
 * 每个英文单词可以被点击查词，同时传递上下文句子和译文用于语境释义
 * 支持词组/熟词生义高亮：同一词组的单词用一条连续下划线标注
 */
function ClickableText({ text, contextSentence, contextTranslation, phrases, uncommonWords }: { 
  text: string
  contextSentence?: string
  contextTranslation?: string
  phrases?: PhraseMatch[]
  uncommonWords?: UncommonWord[]
}) {
  const lookupWord = useDictStore((s) => s.lookupWord)
  const setContext = useDictStore((s) => s.setContext)
  const selectPhrase = usePhraseStore((s) => s.selectPhrase)
  const selectedPhrase = usePhraseStore((s) => s.selectedPhrase)
  const clearPhraseSelection = usePhraseStore((s) => s.clearSelection)
  const phraseEnabled = usePhraseStore((s) => s.enabled)
  const selectUncommonWord = useUncommonStore((s) => s.selectWord)
  const selectedUncommonWord = useUncommonStore((s) => s.selectedWord)
  const clearUncommonSelection = useUncommonStore((s) => s.clearSelection)
  const uncommonEnabled = useUncommonStore((s) => s.enabled)

  // 用正则将文本分割为：英文单词 | 非英文部分
  const parts = text.split(/([a-zA-Z]+(?:[''-][a-zA-Z]+)*)/g)

  // 判断是否为英文单词（与后端分词保持一致：包含单字母词如"a"、"I"）
  const isWord = (part: string) => /^[a-zA-Z]+(?:[''-][a-zA-Z]+)*$/.test(part)

  // 构建词组映射：单词索引 -> 词组信息（索引计数与后端一致，含单字母词）
  const phraseMap = new Map<number, PhraseMatch>()
  if (phrases && phraseEnabled) {
    let wordIdx = 0
    for (const part of parts) {
      if (isWord(part)) {
        for (const p of phrases) {
          if (wordIdx >= p.startIndex && wordIdx < p.endIndex) {
            phraseMap.set(wordIdx, p)
          }
        }
        wordIdx++
      }
    }
  }

  // 构建熟词生义映射：单词索引 -> 熟词生义信息
  const uncommonMap = new Map<number, UncommonWord>()
  if (uncommonWords && uncommonEnabled) {
    let wordIdx = 0
    for (const part of parts) {
      if (isWord(part)) {
        for (const uw of uncommonWords) {
          if (wordIdx >= uw.startIndex && wordIdx < uw.endIndex) {
            uncommonMap.set(wordIdx, uw)
          }
        }
        wordIdx++
      }
    }
  }

  // 构建渲染分组：连续的词组/熟词生义单词归为一组，实现连续下划线
  type GroupType = 'uncommon' | 'phrase' | 'normal'
  interface RenderGroup {
    type: GroupType
    uncommon?: UncommonWord
    phrase?: PhraseMatch
    parts: Array<{ text: string; isWord: boolean; key: number }>
  }

  const groups: RenderGroup[] = []
  let currentGroup: RenderGroup | null = null
  let wordIdx = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (isWord(part)) {
      const phrase = phraseMap.get(wordIdx)
      const uncommon = uncommonMap.get(wordIdx)
      wordIdx++

      const groupType: GroupType = uncommon ? 'uncommon' : phrase ? 'phrase' : 'normal'

      if (groupType !== 'normal') {
        // 检查是否可以延续当前分组（同一词组/熟词生义的连续单词）
        const canExtend = currentGroup && currentGroup.type === groupType &&
          (groupType === 'uncommon' ? currentGroup.uncommon === uncommon : currentGroup.phrase === phrase)
        if (canExtend) {
          currentGroup!.parts.push({ text: part, isWord: true, key: i })
        } else {
          if (currentGroup) groups.push(currentGroup)
          currentGroup = {
            type: groupType,
            uncommon: uncommon || undefined,
            phrase: phrase || undefined,
            parts: [{ text: part, isWord: true, key: i }],
          }
        }
      } else {
        // 普通单词 - 关闭词组/熟词生义分组
        if (currentGroup && currentGroup.type !== 'normal') {
          groups.push(currentGroup)
          currentGroup = null
        }
        if (!currentGroup) {
          currentGroup = { type: 'normal', parts: [] }
        }
        currentGroup.parts.push({ text: part, isWord: true, key: i })
      }
    } else {
      // 非单词部分（空格、标点等）
      if (currentGroup && currentGroup.type !== 'normal') {
        // 词组/熟词生义分组内的空格：检查后续是否还有同组单词
        let nextWordInSameGroup = false
        let tempIdx = wordIdx
        for (let j = i + 1; j < parts.length; j++) {
          if (isWord(parts[j])) {
            const nextPhrase = phraseMap.get(tempIdx)
            const nextUncommon = uncommonMap.get(tempIdx)
            if (currentGroup.type === 'uncommon' && nextUncommon === currentGroup.uncommon) {
              nextWordInSameGroup = true
            } else if (currentGroup.type === 'phrase' && nextPhrase === currentGroup.phrase) {
              nextWordInSameGroup = true
            }
            break
          }
        }
        if (nextWordInSameGroup) {
          // 空格在词组内部，纳入分组以实现连续下划线
          currentGroup.parts.push({ text: part, isWord: false, key: i })
        } else {
          // 词组尾部空格，关闭分组
          groups.push(currentGroup)
          currentGroup = { type: 'normal', parts: [{ text: part, isWord: false, key: i }] }
        }
      } else {
        if (!currentGroup) {
          currentGroup = { type: 'normal', parts: [] }
        }
        currentGroup.parts.push({ text: part, isWord: false, key: i })
      }
    }
  }
  if (currentGroup) groups.push(currentGroup)

  return (
    <span>
      {groups.map((group, gi) => {
        if (group.type === 'uncommon') {
          return (
            <span
              key={gi}
              className="cursor-pointer border-b-2 border-red-400 text-red-700 bg-red-50/50 hover:bg-red-100 rounded-sm transition-colors px-0.5 mx-0.5"
              onClick={(e) => {
                e.stopPropagation()
                if (selectedUncommonWord && selectedUncommonWord.word === group.uncommon!.word && selectedUncommonWord.startIndex === group.uncommon!.startIndex) {
                  clearUncommonSelection()
                } else {
                  selectUncommonWord(group.uncommon!, contextSentence || '', contextTranslation || '')
                }
              }}
              title={`熟词生义: ${group.uncommon!.word} → ${group.uncommon!.contextMeaning}`}
            >
              {group.parts.map(p => p.text)}
            </span>
          )
        }
        if (group.type === 'phrase') {
          return (
            <span
              key={gi}
              className="cursor-pointer border-b-2 border-green-400 text-green-800 bg-green-50/50 hover:bg-green-100 rounded-sm transition-colors px-0.5 mx-0.5"
              onClick={(e) => {
                e.stopPropagation()
                if (selectedPhrase && selectedPhrase.phrase === group.phrase!.phrase && selectedPhrase.startIndex === group.phrase!.startIndex) {
                  clearPhraseSelection()
                } else {
                  selectPhrase(group.phrase!, contextSentence || '', contextTranslation || '')
                }
              }}
              title={`词组: ${group.phrase!.phrase} - ${group.phrase!.translation}`}
            >
              {group.parts.map(p => p.text)}
            </span>
          )
        }
        // 普通分组：单词可点击查词
        return (
          <span key={gi}>
            {group.parts.map(p =>
              p.isWord ? (
                <span
                  key={p.key}
                  className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 rounded-sm transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    lookupWord(p.text)
                    if (contextSentence) {
                      setContext(contextSentence, contextTranslation || '')
                    }
                  }}
                  title="点击查词"
                >
                  {p.text}
                </span>
              ) : p.text
            )}
          </span>
        )
      })}
    </span>
  )
}

/**
 * 将段落文本按句子分割，长难句高亮标记
 * 传递上下文句子和译文给ClickableText，支持语境释义
 * 关键：后端返回的词组/熟词生义索引是段落级的，需按句子偏移量调整
 */
function SentenceHighlightedText({
  text,
  paragraphIndex,
  analysisResult,
  translation,
  phraseResult,
  uncommonResult,
}: {
  text: string
  paragraphIndex: number
  analysisResult: ParagraphAnalysis[] | null
  translation?: string
  phraseResult?: ParagraphPhrases | null
  uncommonResult?: ParagraphUncommon | null
}) {
  const analyzeDetail = useSentenceStore((s) => s.analyzeDetail)

  // 按句号/问号/感叹号分割句子
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)

  // 将译文也按句子分割，与原文句子对齐
  const translationSentences = translation
    ? translation.split(/(?<=[。！？；])\s*/).filter(s => s.trim().length > 0)
    : []

  // 查找当前段落的分析结果
  const paraAnalysis = analysisResult?.find(r => r.paragraphIndex === paragraphIndex)

  // 计算每个句子在段落中的单词偏移量（与后端分词方式一致：含单字母词）
  const sentenceWordOffsets: number[] = []
  let totalWords = 0
  for (const sentence of sentences) {
    sentenceWordOffsets.push(totalWords)
    const cleanSent = sentence.replace(/[^a-zA-Z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
    const sentWords = cleanSent.split(' ').filter(w => w.length > 0)
    totalWords += sentWords.length
  }

  // 根据句子索引调整词组索引（段落级 → 句子级）
  const getSentencePhrases = (idx: number): PhraseMatch[] | undefined => {
    if (!phraseResult?.phrases || phraseResult.phrases.length === 0) return undefined
    const offset = sentenceWordOffsets[idx]
    const nextOffset = idx < sentences.length - 1 ? sentenceWordOffsets[idx + 1] : Infinity
    const adjusted = phraseResult.phrases
      .filter(p => p.startIndex < nextOffset && p.endIndex > offset)
      .map(p => ({
        ...p,
        startIndex: p.startIndex - offset,
        endIndex: p.endIndex - offset,
      }))
    return adjusted.length > 0 ? adjusted : undefined
  }

  // 根据句子索引调整熟词生义索引（段落级 → 句子级）
  const getSentenceUncommon = (idx: number): UncommonWord[] | undefined => {
    if (!uncommonResult?.words || uncommonResult.words.length === 0) return undefined
    const offset = sentenceWordOffsets[idx]
    const nextOffset = idx < sentences.length - 1 ? sentenceWordOffsets[idx + 1] : Infinity
    const adjusted = uncommonResult.words
      .filter(uw => uw.startIndex < nextOffset && uw.endIndex > offset)
      .map(uw => ({
        ...uw,
        startIndex: uw.startIndex - offset,
        endIndex: uw.endIndex - offset,
      }))
    return adjusted.length > 0 ? adjusted : undefined
  }

  // 如果没有分析结果，显示普通可点击文本（带上下文）
  if (!paraAnalysis) {
    return <ClickableText text={text} contextSentence={text} contextTranslation={translation} phrases={phraseResult?.phrases} uncommonWords={uncommonResult?.words} />
  }

  return (
    <span>
      {sentences.map((sentence, idx) => {
        const info = paraAnalysis.sentences.find(s => s.index === idx)
        const isComplex = info?.isComplex ?? false
        const matchedTranslation = translationSentences[idx] || translation || ''
        const sentencePhrases = getSentencePhrases(idx)
        const sentenceUncommon = getSentenceUncommon(idx)

        if (isComplex) {
          return (
            <span
              key={idx}
              className="bg-amber-100/40 border-b-2 border-amber-400 rounded-sm px-0.5"
              title={`长难句 (${info?.wordCount ?? '?'}词, ${info?.markerCount ?? '?'}个从句标记)`}
            >
              <ClickableText text={sentence} contextSentence={sentence} contextTranslation={matchedTranslation} phrases={sentencePhrases} uncommonWords={sentenceUncommon} />
              <button
                className="inline-flex items-center justify-center ml-1 w-6 h-6 bg-amber-500 text-white hover:bg-amber-600 rounded-full align-middle transition-colors shadow-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  analyzeDetail(sentence)
                }}
                title="分析长难句"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
            </span>
          )
        }
        return <span key={idx}><ClickableText text={sentence} contextSentence={sentence} contextTranslation={matchedTranslation} phrases={sentencePhrases} uncommonWords={sentenceUncommon} />{' '}</span>
      })}
    </span>
  )
}

export default function ArticleView() {
  const { paragraphs, isTranslating, error: articleError, translateArticle } = useArticleStore()
  const { analysisResult, analyzing, analyzeParagraphs, clearAnalysis, analysisError } = useSentenceStore()
  const { phraseResults, scanning, scanProgress: phraseScanProgress, scanPhrases, enabled: phraseEnabled, setEnabled: setPhraseEnabled, error: phraseError } = usePhraseStore()
  const { results: uncommonResults, scanning: uncommonScanning, scanProgress: uncommonScanProgress, scanUncommonMeanings, enabled: uncommonEnabled, setEnabled: setUncommonEnabled, error: uncommonError } = useUncommonStore()

  const [isChatOpen, setIsChatOpen] = useState(false)

  // 合并错误信息
  const displayError = articleError || analysisError || phraseError || uncommonError

  // 提取所有原文段落
  const originalParagraphs = paragraphs.map(p => p.original)
  const translations = paragraphs.map(p => p.translation || '')

  // 词组总数
  const phraseCount = phraseResults.reduce((s, r) => s + r.phrases.length, 0)

  // 熟词生义总数
  const uncommonCount = uncommonResults.reduce((s: number, r: ParagraphUncommon) => s + r.words.length, 0)

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 md:mb-6 pb-4 border-b border-slate-100 gap-4">
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div>
            <h2 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">文章阅读</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Reading Mode</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">{paragraphs.length} 段</span>
            {analysisResult && (
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                {analysisResult.flatMap(r => r.sentences.filter(s => s.isComplex)).length} 长难句
              </span>
            )}
            {phraseResults.length > 0 && phraseEnabled && (
              <span className="text-[10px] font-black uppercase tracking-widest text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-100">
                {phraseCount} 词组
              </span>
            )}
            {uncommonResults.length > 0 && uncommonEnabled && (
              <span className="text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                {uncommonCount} 熟词
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {/* 智能标注功能组 - 增加对比度和间距 */}
          <div className="flex items-center gap-1.5 p-2 bg-white rounded-[1.5rem] border-2 border-slate-100 shadow-sm">
            {/* 长难句 */}
            <button
              onClick={analysisResult ? clearAnalysis : () => analyzeParagraphs(originalParagraphs)}
              disabled={analyzing}
              className={`px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 ${
                analysisResult 
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-200 border border-amber-600' 
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>{analyzing ? '识别中' : '长难句'}</span>
            </button>

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* 词组标注 */}
            <button
              onClick={() => {
                if (phraseResults.length > 0) {
                  setPhraseEnabled(!phraseEnabled)
                } else {
                  scanPhrases(originalParagraphs, translations)
                }
              }}
              disabled={scanning}
              className={`relative overflow-hidden px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 ${
                phraseResults.length > 0 && phraseEnabled
                  ? 'bg-green-600 text-white shadow-lg shadow-green-200 border border-green-700'
                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-100'
              }`}
            >
              {scanning && (
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-green-400/50 transition-all duration-300 ease-out" 
                  style={{ width: `${phraseScanProgress}%`, zIndex: 0 }}
                />
              )}
              <svg className="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="relative z-10">{scanning ? `${phraseScanProgress}%` : '词组'}</span>
            </button>

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* 熟词生义 */}
            <button
              onClick={() => {
                if (uncommonResults.length > 0) {
                  setUncommonEnabled(!uncommonEnabled)
                } else {
                  scanUncommonMeanings(originalParagraphs, translations)
                }
              }}
              disabled={uncommonScanning}
              className={`relative overflow-hidden px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 ${
                uncommonResults.length > 0 && uncommonEnabled
                  ? 'bg-red-600 text-white shadow-lg shadow-red-200 border border-red-700'
                  : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100'
              }`}
            >
              {uncommonScanning && (
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-red-400/50 transition-all duration-300 ease-out" 
                  style={{ width: `${uncommonScanProgress}%`, zIndex: 0 }}
                />
              )}
              <svg className="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="relative z-10">{uncommonScanning ? `${uncommonScanProgress}%` : '熟词'}</span>
            </button>
          </div>

          {/* 翻译按钮 - 增加阴影和对比度 */}
          <button
            onClick={translateArticle}
            disabled={isTranslating}
            className={`w-full md:w-auto justify-center px-5 md:px-7 py-3 md:py-3.5 text-sm font-black uppercase tracking-widest rounded-xl md:rounded-[1.25rem] transition-all flex items-center gap-2 ${
              paragraphs[0]?.translation 
                ? 'bg-white text-purple-700 border-2 border-purple-200 hover:bg-purple-50 shadow-md' 
                : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-[1.02] shadow-2xl shadow-purple-300/50 border-2 border-transparent'
            } disabled:opacity-50`}
            style={!(paragraphs[0]?.translation) ? { background: 'linear-gradient(to right, #9333ea, #db2777)', color: 'white' } : {}}
          >
            <svg className={`w-5 h-5 ${isTranslating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            <span>{isTranslating ? '翻译中' : (paragraphs[0]?.translation ? '重新翻译' : '翻译全文')}</span>
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {displayError && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-700 text-sm font-bold flex items-center gap-3 animate-in slide-in-from-top-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {displayError}
        </div>
      )}

      {/* 翻译中提示 */}
      {isTranslating && (
        <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-100 rounded-2xl text-blue-700 text-sm font-bold flex items-center gap-3 animate-pulse">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          正在调用 AI 翻译，请稍候...
        </div>
      )}

      {/* 双栏展示 */}
      <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pb-12">
        {paragraphs.map((para, index) => (
          <div
            key={para.id}
            className="bg-white/80 backdrop-blur-md rounded-[2rem] border border-white/60 shadow-lg shadow-purple-200/30 overflow-hidden group hover:shadow-xl hover:shadow-purple-300/40 transition-all duration-300"
          >
            {/* 移动端竖向排列，PC端横向并排 */}
            <div className="flex flex-col md:flex-row md:divide-x divide-purple-50/50">
              {/* 英文原文 - 单词可点击 + 长难句高亮 */}
              <div className="flex-1 p-5 md:p-8">
                <div className="text-[10px] font-black uppercase tracking-widest text-purple-300 mb-4 group-hover:text-purple-500 transition-colors">
                  Paragraph {index + 1}
                </div>
                <p className="text-lg leading-relaxed text-slate-800 font-medium">
                  <SentenceHighlightedText
                    text={para.original}
                    paragraphIndex={index}
                    analysisResult={analysisResult}
                    translation={para.translation}
                    phraseResult={phraseResults.find(r => r.paragraphIndex === index)}
                    uncommonResult={uncommonResults.find((r: ParagraphUncommon) => r.paragraphIndex === index)}
                  />
                </p>
              </div>
              {/* 中文翻译 */}
              <div className="flex-1 p-5 md:p-8 bg-slate-50/30 border-t md:border-t-0 group-hover:bg-blue-50/20 transition-colors">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-4 group-hover:text-indigo-400 transition-colors">译文</div>
                {para.translation ? (
                  <p className="text-base leading-relaxed text-slate-600 font-medium">
                    {para.translation}
                  </p>
                ) : isTranslating ? (
                  <div className="flex items-center gap-3 text-slate-300">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm font-bold uppercase tracking-widest">等待翻译...</span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-300 italic font-medium">点击 "翻译全文" 生成译文</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 句子分析弹窗 */}
      <SentenceAnalysis />

      {/* AI 伴读悬浮按钮 */}
      <button
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-[120px] md:bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-xl shadow-purple-200/50 flex items-center justify-center hover:scale-110 transition-transform z-40"
        title="AI 伴读"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {/* AI 伴读聊天窗口 */}
      {isChatOpen && <ArticleChat onClose={() => setIsChatOpen(false)} />}
    </div>
  )
}
