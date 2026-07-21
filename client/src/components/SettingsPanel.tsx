interface SettingsPanelProps {
  onOpenApiConfig: () => void
  onOpenDictManager: () => void
  onOpenTutorial: () => void
}

export default function SettingsPanel({ onOpenApiConfig, onOpenDictManager, onOpenTutorial }: SettingsPanelProps) {
  return (
    <div className="space-y-8 p-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-4 mb-4">
        <div 
          className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-200/50 rotate-3"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)' }}
        >
          <svg className="w-7 h-7 text-white -rotate-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-1.756 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">设置与工具</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Settings & Tools</p>
        </div>
      </div>
      
      <div className="grid gap-4">
        <button 
          onClick={onOpenTutorial}
          className="flex items-center gap-4 p-4 md:p-6 bg-white rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/40 hover:shadow-xl hover:shadow-blue-100/50 hover:-translate-y-1 transition-all text-left group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500" />
          <div 
            className="w-12 h-12 md:w-14 md:h-14 shrink-0 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl md:rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-300 relative z-10"
            style={{ backgroundColor: '#eff6ff' }}
          >
            <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex-1 relative z-10">
            <h3 className="text-base md:text-lg font-black text-slate-800">软件使用教程</h3>
            <p className="text-xs md:text-sm font-medium text-slate-500 mt-0.5 md:mt-1">了解如何高效使用英语应试助手</p>
          </div>
          <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all relative z-10">
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <button 
          onClick={onOpenApiConfig}
          className="flex items-center gap-4 p-4 md:p-6 bg-white rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/40 hover:shadow-xl hover:shadow-purple-100/50 hover:-translate-y-1 transition-all text-left group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500" />
          <div 
            className="w-12 h-12 md:w-14 md:h-14 shrink-0 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl md:rounded-2xl flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform duration-300 relative z-10"
            style={{ backgroundColor: '#f5f3ff' }}
          >
            <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div className="flex-1 relative z-10">
            <h3 className="text-base md:text-lg font-black text-slate-800">AI 模型配置</h3>
            <p className="text-xs md:text-sm font-medium text-slate-500 mt-0.5 md:mt-1">配置大模型密钥，开启 AI 分析功能</p>
          </div>
          <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all relative z-10">
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <button 
          onClick={onOpenDictManager}
          className="flex items-center gap-4 p-4 md:p-6 bg-white rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/40 hover:shadow-xl hover:shadow-amber-100/50 hover:-translate-y-1 transition-all text-left group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-500" />
          <div 
            className="w-12 h-12 md:w-14 md:h-14 shrink-0 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform duration-300 relative z-10"
            style={{ backgroundColor: '#fffbeb' }}
          >
            <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div className="flex-1 relative z-10">
            <h3 className="text-base md:text-lg font-black text-slate-800">离线词典管理</h3>
            <p className="text-xs md:text-sm font-medium text-slate-500 mt-0.5 md:mt-1">管理离线词典，支持无网查词</p>
          </div>
          <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all relative z-10">
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      <div 
        className="mt-12 p-8 bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 rounded-[2.5rem] text-center border border-white/50 shadow-lg shadow-purple-200/30"
        style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #f3e8ff 50%, #fce7f3 100%)' }}
      >
        <p className="text-sm font-black text-purple-500 uppercase tracking-widest">英语应试助手 v0.1.0</p>
        <p className="text-xs font-bold text-purple-400 mt-2">专注高中英语长难句与词汇突破</p>
        <div className="flex justify-center gap-2 mt-4">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
          <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0.4s]" />
        </div>
      </div>
    </div>
  )
}