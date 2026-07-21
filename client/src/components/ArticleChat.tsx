import { useState, useRef, useEffect } from 'react'
import { useArticleStore } from '../store/articleStore'
import { llmService } from '../services/llm'

type ChatMode = 'young' | 'advanced'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function ArticleChat({ onClose }: { onClose: () => void }) {
  const { paragraphs } = useArticleStore()
  const [mode, setMode] = useState<ChatMode>('young')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [messages])

  // 初始欢迎语
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: '你好！我是你的英语阅读助手。关于这篇文章，你有什么想问的吗？'
      }
    ])
  }, [])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      // 构建文章上下文
      const articleContext = paragraphs.map(p => p.original).join('\n\n')
      
      // 根据模式选择系统提示词
      const systemPrompt = mode === 'young' 
        ? `你是一个面向低龄用户的英语阅读助手。当前用户正在阅读以下文章：\n\n${articleContext}\n\n要求：\n1. 除了最基本的知识外，少用专业术语。\n2. 多用生动的比喻和生活中的例子来迁移解释。\n3. 回答问题要通俗易懂、有趣、亲切。\n4. 像一个大哥哥/大姐姐一样和用户聊天。`
        : `你是一个面向进阶用户的专业英语阅读助手。当前用户正在阅读以下文章：\n\n${articleContext}\n\n要求：\n1. 注重逻辑严密性和严谨性。\n2. 适当使用语言学、语法学等专业术语。\n3. 把问题讲得更深、更透彻，注重知识性。\n4. 像一个专业的英语教授一样回答问题。`

      // 构建历史消息
      const historyMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }))

      const response = await llmService.callAPI([
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userMsg.content }
      ], { timeoutMs: 60000 })

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (error: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，出错了：${error.message || '请求失败'}`
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed bottom-[190px] md:bottom-24 right-6 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-purple-100 flex flex-col overflow-hidden z-50" style={{ height: '500px', maxHeight: '80vh' }}>
      {/* 头部 */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="font-bold">AI 伴读</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 模式切换 */}
      <div className="flex p-2 bg-slate-50 border-b border-slate-100">
        <button
          onClick={() => setMode('young')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            mode === 'young' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          👶 趣味模式
        </button>
        <button
          onClick={() => setMode('advanced')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            mode === 'advanced' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          🎓 进阶模式
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar">
        {messages.map(msg => {
          // 简单的 Markdown 过滤函数
          const stripMarkdown = (text: string) => {
            return text
              .replace(/(\*\*|__)(.*?)\1/g, '$2') // 粗体
              .replace(/(\*|_)(.*?)\1/g, '$2') // 斜体
              .replace(/~~(.*?)~~/g, '$1') // 删除线
              .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // 代码块
              .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 链接
              .replace(/^#+\s+(.*)$/gm, '$1') // 标题
              .replace(/^\s*[-*+]\s+(.*)$/gm, '$1') // 无序列表
              .replace(/^\s*\d+\.\s+(.*)$/gm, '$1') // 有序列表
              .replace(/^\s*>\s+(.*)$/gm, '$1') // 引用
          }
          
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user' 
                  ? 'bg-purple-600 text-white rounded-tr-sm' 
                  : 'bg-white text-slate-700 border border-slate-100 shadow-sm rounded-tl-sm'
              }`}>
                <div className="whitespace-pre-wrap leading-relaxed">{stripMarkdown(msg.content)}</div>
              </div>
            </div>
          )
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 输入框 */}
      <div className="p-3 bg-white border-t border-slate-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="问点什么吧..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-purple-600 text-white p-2 rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}