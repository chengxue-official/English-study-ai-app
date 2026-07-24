import { useState, useRef } from 'react'
import { useArticleStore } from '../store/articleStore'
import { OcrService } from '../services/ocr'

export default function ArticleInput() {
  const [text, setText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const recognizedText = await OcrService.recognize(file)
      setText(prev => prev ? prev + '\n\n' + recognizedText : recognizedText)
    } catch (err) {
      alert(err instanceof Error ? err.message : '图片识别失败')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">导入文章</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Import Article</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-5 py-2.5 text-sm font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            style={{ backgroundColor: '#9333ea', color: 'white', border: '1px solid #7e22ce' }}
          >
            {isUploading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                识别中
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                图片识别
              </>
            )}
          </button>
          <button
            onClick={handlePaste}
            className="px-5 py-2.5 text-sm font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-sm"
            style={{ backgroundColor: '#1e293b', color: 'white', border: '1px solid #0f172a' }}
          >
            粘贴
          </button>
          <button
            onClick={handleClear}
            className="px-5 py-2.5 text-sm font-black uppercase tracking-widest bg-white rounded-xl transition-all active:scale-95 hover:bg-slate-50 shadow-sm"
            style={{ color: '#475569', border: '2px solid #e2e8f0' }}
          >
            清空
          </button>
        </div>
      </div>

      <div className="flex-1 relative group">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在此粘贴或输入英语文章...&#10;&#10;支持多段落，每段用回车分隔。"
          className="w-full h-full p-5 border-2 border-slate-200 rounded-[2rem] resize-none focus:outline-none focus:ring-4 focus:ring-purple-200 focus:border-purple-400 text-base leading-relaxed text-slate-800 placeholder-slate-400 transition-all bg-slate-50 shadow-inner"
          style={{ minHeight: '200px' }}
        />
        <div className="absolute bottom-4 right-4 text-[10px] font-black text-purple-400 uppercase tracking-widest pointer-events-none">
          {text.length} characters
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-6">
        <button
          onClick={handleImportAndTranslate}
          disabled={!text.trim() || isTranslating}
          className="w-full py-5 text-lg font-black rounded-[1.5rem] transition-all shadow-sm disabled:opacity-40 disabled:shadow-none bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 group border-2 border-transparent"
          style={{ background: 'linear-gradient(to right, #9333ea, #db2777)', color: 'white' }}
        >
          {isTranslating ? (
            <>
              <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="uppercase tracking-widest">正在翻译...</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              <span className="uppercase tracking-widest">导入并翻译全文</span>
            </>
          )}
        </button>
        
        <button
          onClick={handleImport}
          disabled={!text.trim()}
          className="w-full py-4 text-sm font-black uppercase tracking-widest bg-white border-2 border-slate-100 text-slate-400 rounded-[1.5rem] hover:bg-slate-50 hover:text-slate-600 hover:border-slate-200 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          仅导入文章 (不翻译)
        </button>
      </div>
    </div>
  )
}