import { useState, useEffect } from 'react'
import ArticleInput from './components/ArticleInput'
import ArticleView from './components/ArticleView'
import SettingsModal from './components/SettingsModal'
import WordPopup from './components/WordPopup'
import PhrasePopup from './components/PhrasePopup'
import UncommonPopup from './components/UncommonPopup'
import CollectionPanel from './components/CollectionPanel'
import { useConfigStore } from './store/configStore'

type TabType = 'article' | 'collection'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inputVisible, setInputVisible] = useState(true) // 移动端控制面板显隐
  const [activeTab, setActiveTab] = useState<TabType>('article')
  const { loadFromStorage, isConfigured } = useConfigStore()

  // 启动时加载配置
  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  const configured = isConfigured()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-12 md:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-base md:text-lg font-bold text-gray-800">英语应试助手</h1>
            <span className="text-[10px] md:text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Beta</span>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* PC端导航 */}
            <nav className="hidden md:flex items-center gap-1 mr-2">
              <button
                onClick={() => setActiveTab('article')}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'article'
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                文章阅读
              </button>
              <button
                onClick={() => setActiveTab('collection')}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'collection'
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                收藏本
              </button>
            </nav>

            {/* 移动端 - 导入面板切换按钮 */}
            <button
              onClick={() => setInputVisible(!inputVisible)}
              className="md:hidden flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {inputVisible ? '阅读' : '导入'}
            </button>

            {/* 移动端 - 收藏本按钮 */}
            <button
              onClick={() => setActiveTab(activeTab === 'collection' ? 'article' : 'collection')}
              className="md:hidden flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>

            {/* 设置按钮 */}
            <button
              onClick={() => setSettingsOpen(true)}
              className={`flex items-center gap-1 px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors ${
                configured
                  ? 'text-green-700 bg-green-50 hover:bg-green-100'
                  : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-1.756 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden md:inline">{configured ? '已配置' : '未配置'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 未配置提示条 */}
      {!configured && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-2.5 flex items-center justify-between">
            <p className="text-xs md:text-sm text-amber-700">
              尚未配置大模型API，翻译等功能暂不可用。
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-xs md:text-sm font-medium text-amber-700 hover:text-amber-800 underline whitespace-nowrap ml-2"
            >
              去配置
            </button>
          </div>
        </div>
      )}

      {/* 主内容区 - 响应式布局 */}
      <main className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-6">
        {activeTab === 'collection' ? (
          /* 收藏本面板 */
          <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 shadow-sm md:h-[calc(100vh-80px)] overflow-hidden">
            <CollectionPanel />
          </div>
        ) : (
          /* 文章阅读区 */
          <div className="flex flex-col md:flex-row gap-3 md:gap-6 md:h-[calc(100vh-80px)]">
            {/* 左侧 - 文章导入面板 */}
            <div className={`
              md:w-[380px] md:flex-shrink-0 bg-white rounded-2xl border border-gray-200 p-4 md:p-5 shadow-sm
              ${inputVisible ? 'block' : 'hidden md:block'}
            `}>
              <ArticleInput />
            </div>

            {/* 右侧 - 文章阅读面板 */}
            <div className={`
              flex-1 bg-white rounded-2xl border border-gray-200 p-4 md:p-5 shadow-sm overflow-hidden
              ${inputVisible ? 'hidden md:block' : 'block'}
              md:block
            `}>
              <ArticleView />
            </div>
          </div>
        )}
      </main>

      {/* 设置弹窗 */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* 单词查词弹窗 */}
      <WordPopup />
      {/* 词组释义弹窗 */}
      <PhrasePopup />
      {/* 熟词生义弹窗 */}
      <UncommonPopup />
    </div>
  )
}

export default App