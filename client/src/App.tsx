import { useState, useEffect } from 'react'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Capacitor } from '@capacitor/core'
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
    }
  }, [loadFromStorage])

  const configured = isConfigured()

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* 顶部状态栏占位 - 仅移动端显示 */}
      <div className="bg-white pt-[env(safe-area-inset-top)] flex-shrink-0" />

      {/* 顶部标题栏 - 极简设计 */}
      <header className="bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-base font-bold text-gray-900">英语应试助手</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 移动端：切换导入/阅读 */}
          {activeTab === 'article' && (
            <button
              onClick={() => setInputVisible(!inputVisible)}
              className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              {inputVisible ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              )}
            </button>
          )}
          {/* 齿轮按钮已移至底部导航栏 */}
        </div>
      </header>

      {/* 未配置提示条 */}
      {!configured && activeTab !== 'settings' && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-amber-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.268 17c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-[10px] font-medium">尚未配置 AI 密钥，翻译功能受限</p>
          </div>
          <button onClick={() => { setActiveTab('settings'); setSettingsOpen(true); }} className="text-[10px] font-bold text-amber-700 hover:underline">立即配置</button>
        </div>
      )}

      {/* 主内容区 - 滚动容器 */}
      <main className="flex-1 overflow-hidden relative bg-gray-50">
        <div className="absolute inset-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-3 md:p-6">
            {activeTab === 'collection' ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <CollectionPanel />
              </div>
            ) : activeTab === 'settings' ? (
              <SettingsPanel 
                onOpenApiConfig={() => setSettingsOpen(true)}
                onOpenDictManager={() => setDictManagerOpen(true)}
                onOpenTutorial={() => setTutorialOpen(true)}
              />
            ) : (
              <div className="flex flex-col md:flex-row gap-4">
                {/* 文章导入 */}
                <div className={`md:w-[400px] md:flex-shrink-0 bg-white rounded-2xl border border-gray-200 p-4 shadow-sm ${inputVisible ? 'block' : 'hidden md:block'}`}>
                  <ArticleInput />
                </div>
                {/* 文章阅读 */}
                <div className={`flex-1 bg-white rounded-2xl border border-gray-200 p-4 shadow-sm ${inputVisible ? 'hidden md:block' : 'block'}`}>
                  <ArticleView />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 底部导航栏 - 移动端核心交互 */}
      <nav className="bg-white border-t border-gray-100 flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom)] flex-shrink-0 z-30">
        <button
          onClick={() => setActiveTab('article')}
          className={`flex flex-col items-center gap-1 px-6 py-1 transition-colors ${activeTab === 'article' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <svg className="w-6 h-6" fill={activeTab === 'article' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span className="text-[10px] font-bold">文章阅读</span>
        </button>

        <button
          onClick={() => setActiveTab('collection')}
          className={`flex flex-col items-center gap-1 px-6 py-1 transition-colors ${activeTab === 'collection' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <svg className="w-6 h-6" fill={activeTab === 'collection' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="text-[10px] font-bold">收藏本</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 px-6 py-1 transition-colors ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <svg className="w-6 h-6" fill={activeTab === 'settings' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-1.756 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[10px] font-bold">设置工具</span>
        </button>
      </nav>

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