import { useArticleStore } from '../store/articleStore'
import { useDictStore } from '../store/dictStore'
import { useSentenceStore, type ParagraphAnalysis } from '../store/sentenceStore'
import { usePhraseStore, type PhraseMatch, type ParagraphPhrases } from '../store/phraseStore'
import { useUncommonStore, type UncommonWord, type ParagraphUncommon } from '../store/uncommonStore'
import SentenceAnalysis from './SentenceAnalysis'

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
  const phraseEnabled = usePhraseStore((s) => s.enabled)
  const selectUncommonWord = useUncommonStore((s) => s.selectWord)
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
              className="cursor-pointer border-b-2 border-red-400 text-red-600 hover:bg-red-50 rounded-sm transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                selectUncommonWord(group.uncommon!, contextSentence || '', contextTranslation || '')
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
              className="cursor-pointer border-b-2 border-green-400 text-green-700 hover:bg-green-50 rounded-sm transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                selectPhrase(group.phrase!, contextSentence || '', contextTranslation || '')
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
              className="bg-amber-50 border-b-2 border-amber-300 rounded-sm"
              title={`长难句 (${info?.wordCount ?? '?'}词, ${info?.markerCount ?? '?'}个从句标记)`}
            >
              <ClickableText text={sentence} contextSentence={sentence} contextTranslation={matchedTranslation} phrases={sentencePhrases} uncommonWords={sentenceUncommon} />
              <button
                className="inline-flex items-center justify-center ml-0.5 w-5 h-5 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded-full align-middle transition-colors"
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
  const { paragraphs, isTranslating, error, translateArticle } = useArticleStore()
  const { analysisResult, analyzing, analyzeParagraphs, clearAnalysis } = useSentenceStore()
  const { phraseResults, scanning, scanPhrases, clearPhrases, enabled: phraseEnabled } = usePhraseStore()
  const { results: uncommonResults, scanning: uncommonScanning, scanUncommonMeanings, clearUncommon, enabled: uncommonEnabled } = useUncommonStore()

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
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 md:mb-4 pb-3 border-b border-gray-100 gap-2">
        <div className="flex items-center gap-2 md:gap-3">
          <h2 className="text-base md:text-lg font-semibold text-gray-800">文章阅读</h2>
          <span className="text-xs text-gray-400">{paragraphs.length} 段</span>
          {analysisResult && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {analysisResult.flatMap(r => r.sentences.filter(s => s.isComplex)).length} 个长难句
            </span>
          )}
          {phraseResults.length > 0 && phraseEnabled && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              {phraseCount} 个词组
            </span>
          )}
          {uncommonResults.length > 0 && uncommonEnabled && (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              {uncommonCount} 个熟词生义
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* 长难句识别按钮 */}
          {paragraphs.length > 0 && (
            analysisResult ? (
              <button
                onClick={clearAnalysis}
                className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200"
              >
                取消标注
              </button>
            ) : (
              <button
                onClick={() => analyzeParagraphs(originalParagraphs)}
                disabled={analyzing}
                className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors disabled:opacity-50 bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200"
              >
                {analyzing ? '识别中...' : '长难句识别'}
              </button>
            )
          )}
          {/* 词组标注按钮 */}
          {paragraphs.length > 0 && (
            phraseResults.length > 0 && phraseEnabled ? (
              <div className="flex gap-1">
                <button
                  onClick={clearPhrases}
                  className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors bg-green-100 text-green-700 hover:bg-green-200"
                >
                  取消标注
                </button>
                <button
                  onClick={() => scanPhrases(originalParagraphs, translations)}
                  disabled={scanning}
                  className="px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 disabled:opacity-50"
                  title="重新扫描词组，覆盖旧结果"
                >
                  {scanning ? '重新扫描中...' : '重新生成'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => scanPhrases(originalParagraphs, translations)}
                disabled={scanning}
                className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors disabled:opacity-50 bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
              >
                {scanning ? '扫描中...' : '词组标注'}
              </button>
            )
          )}
          {/* 熟词生义按钮 */}
          {paragraphs.length > 0 && (
            uncommonResults.length > 0 && uncommonEnabled ? (
              <div className="flex gap-1">
                <button
                  onClick={clearUncommon}
                  className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                >
                  取消标注
                </button>
                <button
                  onClick={() => scanUncommonMeanings(originalParagraphs, translations, true)}
                  disabled={uncommonScanning}
                  className="px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50"
                  title="重新调用AI扫描，覆盖旧结果"
                >
                  {uncommonScanning ? '重新扫描中...' : '重新生成'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => scanUncommonMeanings(originalParagraphs, translations)}
                disabled={uncommonScanning}
                className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors disabled:opacity-50 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
              >
                {uncommonScanning ? '扫描中...' : '熟词生义'}
              </button>
            )
          )}
          {!paragraphs[0]?.translation && (
            <button
              onClick={translateArticle}
              disabled={isTranslating}
              className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isTranslating ? '翻译中...' : '翻译全文'}
            </button>
          )}
          {paragraphs[0]?.translation && (
            <button
              onClick={translateArticle}
              disabled={isTranslating}
              className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isTranslating ? '重新翻译中...' : '重新翻译'}
            </button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* 翻译中提示 */}
      {isTranslating && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 text-sm flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          正在调用AI翻译，请稍候...
        </div>
      )}

      {/* 双栏展示 */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {paragraphs.map((para, index) => (
          <div
            key={para.id}
            className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
          >
            {/* 移动端竖向排列，PC端横向并排 */}
            <div className="flex flex-col md:flex-row md:divide-x divide-gray-100">
              {/* 英文原文 - 单词可点击 + 长难句高亮 */}
              <div className="flex-1 p-3 md:p-4">
                <div className="text-xs text-gray-400 mb-2 font-medium">
                  Paragraph {index + 1}
                </div>
                <p className="text-sm leading-relaxed text-gray-800">
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
              <div className="flex-1 p-3 md:p-4 bg-gray-50/50 border-t md:border-t-0">
                <div className="text-xs text-gray-400 mb-2 font-medium">译文</div>
                {para.translation ? (
                  <p className="text-sm leading-relaxed text-gray-600">
                    {para.translation}
                  </p>
                ) : isTranslating ? (
                  <div className="flex items-center gap-2 text-gray-300">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs">等待翻译...</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 italic">点击"翻译全文"生成译文</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 句子分析弹窗 */}
      <SentenceAnalysis />
    </div>
  )
}