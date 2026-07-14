import { useState } from 'react'
import { useArticleStore } from '../store/articleStore'

export default function ArticleInput() {
  const [text, setText] = useState('')
  const { setArticle, translateArticle, isTranslating } = useArticleStore()

  const handleImport = () => {
    if (!text.trim()) return
    setArticle(text)
  }

  const handleImportAndTranslate = async () => {
    if (!text.trim()) return
    setArticle(text)
    // 需要等 setArticle 更新后再翻译，用 setTimeout 确保 store 更新
    setTimeout(() => {
      translateArticle()
    }, 0)
  }

  const handlePaste = async () => {
    try {
      const clipText = await navigator.clipboard.readText()
      setText(clipText)
    } catch {
      // 剪贴板读取失败，忽略
    }
  }

  const handleClear = () => {
    setText('')
    useArticleStore.getState().clearArticle()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base md:text-lg font-semibold text-gray-800">导入文章</h2>
        <div className="flex gap-2">
          <button
            onClick={handlePaste}
            className="px-2.5 md:px-3 py-1.5 text-xs md:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            粘贴
          </button>
          <button
            onClick={handleClear}
            className="px-2.5 md:px-3 py-1.5 text-xs md:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在此粘贴或输入英语文章...&#10;&#10;支持多段落，每段用回车分隔。"
        className="flex-1 w-full p-3 md:p-4 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm leading-relaxed text-gray-800 placeholder-gray-400"
        style={{ minHeight: '150px' }}
      />

      <div className="flex gap-3 mt-3">
        <button
          onClick={handleImport}
          disabled={!text.trim()}
          className="flex-1 py-2 md:py-2.5 text-sm font-medium bg-white border border-blue-500 text-blue-600 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          仅导入
        </button>
        <button
          onClick={handleImportAndTranslate}
          disabled={!text.trim() || isTranslating}
          className="flex-1 py-2 md:py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isTranslating ? '翻译中...' : '导入并翻译'}
        </button>
      </div>
    </div>
  )
}