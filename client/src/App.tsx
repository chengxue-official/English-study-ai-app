import { useState, useEffect } from 'react'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import ArticleInput from './components/ArticleInput'
import ArticleView from './components/ArticleView'
import SettingsModal from './components/SettingsModal'
import WordPopup from './components/WordPopup'
import PhrasePopup from './components/PhrasePopup'
import UncommonPopup from './components/UncommonPopup'
import CollectionPanel from './components/CollectionPanel'
import DictionaryManager from './components/DictionaryManager'
import UpdateNotification from './components/UpdateNotification'
import SettingsPanel from './components/SettingsPanel'
import { useConfigStore } from './store/configStore'

type TabType = 'article' | 'collection' | 'settings'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dictManagerOpen, setDictManagerOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [inputVisible, setInputVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('article')
  const { loadFromStorage, isConfigured } = useConfigStore()

  useEffect(() => {
    loadFromStorage()
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Default })
      SplashScreen.hide()
      // 通知 Updater 应用已准备好，防止回滚
      CapacitorUpdater.notifyAppReady()
    }
  }, [loadFromStorage])

  const configured = isConfigured()

  return (
    <div 
      className="h-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 flex flex-col overflow-hidden font-sans selection:bg-pink-200 selection:text-pink-900"
      style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #f3e8ff 50%, #fce7f3 100%)' }}
    >
      {/* 顶部标题栏 - 彻底移除毛玻璃，使用纯色背景修复渲染Bug */}
      <header className="bg-white border-b border-slate-200 px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-3 flex items-center justify-between flex-shrink-0 z-50 shadow-sm relative">
        <div className="flex items-center gap-3">
          <div 
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(to bottom right, #3b82f6, #4f46e5)' }}
          >
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'white' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none" style={{ color: '#0f172a' }}>英语应试助手</h1>
            <p className="text-[11px] font-bold uppercase tracking-widest mt-1.5" style={{ color: '#2563eb' }}>English Exam Pro</p>
          </div>
        </div>

        {/* 桌面端导航栏 */}
        <div className="hidden md:flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('article')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'article' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-purple-500'}`}
          >
            阅读
          </button>
          <button
            onClick={() => setActiveTab('collection')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'collection' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-pink-500'}`}
          >
            收藏
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-500 hover:text-orange-500'}`}
          >
            设置
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* 移动端：切换导入/阅读 */}
          {activeTab === 'article' && (
            <button
              onClick={() => setInputVisible(!inputVisible)}
              className="md:hidden flex items-center gap-2 px-5 py-2.5 rounded-xl active:scale-95 transition-all shadow-sm"
              style={{ backgroundColor: '#2563eb', color: 'white', border: '1px solid #1d4ed8' }}
            >
              {inputVisible ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span className="text-sm font-black">去阅读</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm font-black">改文章</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* 未配置提示条 - 更加醒目 */}
      {!configured && activeTab !== 'settings' && (
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 flex items-center justify-between flex-shrink-0 shadow-md z-30">
          <div className="flex items-center gap-2 text-white">
            <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs font-bold">尚未配置 AI 密钥，翻译与分析功能不可用</p>
          </div>
          <button 
            onClick={() => { setActiveTab('settings'); setSettingsOpen(true); }} 
            className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs font-black rounded-lg backdrop-blur-sm transition-colors border border-white/30"
          >
            立即配置
          </button>
        </div>
      )}

      {/* 主内容区 - 增加背景装饰 */}
      <main className="flex-1 overflow-hidden relative bg-transparent">
        {/* 背景装饰圆圈 */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-gradient-to-br from-pink-400/30 to-orange-400/30 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

        <div className="absolute inset-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-8 h-full flex flex-col">
            {activeTab === 'collection' ? (
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px]">
                <CollectionPanel />
              </div>
            ) : activeTab === 'settings' ? (
              <div className="flex-1">
                <SettingsPanel 
                  onOpenApiConfig={() => setSettingsOpen(true)}
                  onOpenDictManager={() => setDictManagerOpen(true)}
                  onOpenTutorial={() => setTutorialOpen(true)}
                />
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-6 flex-1">
                {/* 文章导入 */}
                <div className={`md:w-[420px] md:flex-shrink-0 bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm flex flex-col ${inputVisible ? 'flex-1 md:flex-none' : 'hidden md:flex'}`}>
                  <ArticleInput />
                </div>
                {/* 文章阅读 */}
                <div className={`flex-1 bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm flex flex-col ${inputVisible ? 'hidden md:flex' : 'flex'}`}>
                  <ArticleView />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 底部导航栏 - 悬浮感设计 (仅移动端) */}
      <div className="md:hidden px-4 pb-6 pt-2 bg-transparent pointer-events-none flex-shrink-0 z-40">
        <nav className="max-w-md mx-auto bg-white border border-slate-200 flex items-center justify-around h-20 rounded-[2.5rem] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pointer-events-auto">
          <button
            onClick={() => setActiveTab('article')}
            className={`flex flex-col items-center gap-1.5 px-8 py-3 rounded-[2rem] transition-all duration-300 ${activeTab === 'article' ? 'text-purple-600 bg-purple-100/50 shadow-inner shadow-purple-200/50 scale-105' : 'text-slate-400 hover:text-purple-500'}`}
          >
            <svg className="w-6 h-6" fill={activeTab === 'article' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider">阅读</span>
          </button>

          <button
            onClick={() => setActiveTab('collection')}
            className={`flex flex-col items-center gap-1.5 px-8 py-3 rounded-[2rem] transition-all duration-300 ${activeTab === 'collection' ? 'text-pink-600 bg-pink-100/50 shadow-inner shadow-pink-200/50 scale-105' : 'text-slate-400 hover:text-pink-500'}`}
          >
            <svg className="w-6 h-6" fill={activeTab === 'collection' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider">收藏</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1.5 px-8 py-3 rounded-[2rem] transition-all duration-300 ${activeTab === 'settings' ? 'text-orange-500 bg-orange-100/50 shadow-inner shadow-orange-200/50 scale-105' : 'text-slate-400 hover:text-orange-500'}`}
          >
            <svg className="w-6 h-6" fill={activeTab === 'settings' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-1.756 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider">设置</span>
          </button>
        </nav>
      </div>

      {/* 弹窗组件 */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenDictManager={() => setDictManagerOpen(true)} />
      <WordPopup />
      <PhrasePopup />
      <UncommonPopup />
      <DictionaryManager forceShow={dictManagerOpen} onClose={() => setDictManagerOpen(false)} />
      <UpdateNotification />

      {/* 教程弹窗 */}
      {tutorialOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTutorialOpen(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">软件使用教程</h3>
              <button onClick={() => setTutorialOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <section>
                <h4 className="font-bold text-blue-600 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs">1</span>
                  文章阅读与查词
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  在“文章阅读”页签中，你可以粘贴或输入英语文章。点击文章中的任何单词，即可弹出详细释义。支持离线查词和 AI 语境分析。
                </p>
              </section>
              <section>
                <h4 className="font-bold text-purple-600 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-xs">2</span>
                  长难句分析
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  系统会自动识别文章中的长难句（标黄显示）。点击句子可开启 AI 深度分析，包括主干提取、从句拆解、修饰成分识别及考点提示。
                </p>
              </section>
              <section>
                <h4 className="font-bold text-amber-600 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center text-xs">3</span>
                  生词本与收藏
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  查词弹窗中点击“星号”即可收藏生词。在“收藏本”页签中可以统一管理生词、词组和长难句，支持导出和复习。
                </p>
              </section>
              <section>
                <h4 className="font-bold text-green-600 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-xs">4</span>
                  离线词典管理
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  在设置中下载离线词典后，即使没有网络也可以进行基础查词。建议优先下载“精简版”以获得最佳体验。
                </p>
              </section>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100">
              <button 
                onClick={() => setTutorialOpen(false)}
                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App