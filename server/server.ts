import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import fs from 'fs'

const app = express()
const PORT = 3001

// 中间件
app.use(cors())
app.use(express.json())

// 配置文件上传
const upload = multer({ dest: 'uploads/' })

// 静态文件服务：允许下载词典文件
const dataDir = path.join(process.cwd(), 'data')
app.use('/data', express.static(dataDir))
// 同时也允许直接从根路径访问（兼容旧逻辑）
app.use(express.static(dataDir))

// ==================== 类型定义 ====================
interface TranslateRequest {
  texts: string[]
  apiKey?: string
  apiUrl?: string
  model?: string
}

interface TestConnectionRequest {
  apiKey: string
  apiUrl: string
  model: string
}

interface ModelsRequest {
  apiKey: string
  apiUrl: string
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

// ==================== LLM调用 ====================

/**
 * 将用户输入的API地址规范化为完整的chat completions端点
 * 支持以下输入格式：
 *  - https://api.deepseek.com          → https://api.deepseek.com/v1/chat/completions
 *  - https://api.deepseek.com/v1       → https://api.deepseek.com/v1/chat/completions
 *  - https://api.deepseek.com/v1/      → https://api.deepseek.com/v1/chat/completions
 *  - https://api.deepseek.com/v1/chat/completions → 不变
 *  - https://open.bigmodel.cn/api/paas/v4 → https://open.bigmodel.cn/api/paas/v4/chat/completions
 */
function normalizeChatUrl(url: string): string {
  let u = url.trim()
  // 去掉末尾斜杠
  u = u.replace(/\/+$/, '')
  // 已经是完整路径则直接返回
  if (u.endsWith('/chat/completions')) return u
  // 否则追加 /chat/completions
  return u + '/chat/completions'
}

/**
 * 从chat completions URL提取base URL（用于调用 /models 端点）
 * https://api.deepseek.com/v1/chat/completions → https://api.deepseek.com
 * https://open.bigmodel.cn/api/paas/v4/chat/completions → https://open.bigmodel.cn/api/paas
 */
function extractBaseUrl(chatUrl: string): string {
  let u = chatUrl.trim().replace(/\/+$/, '')
  if (u.endsWith('/chat/completions')) {
    u = u.slice(0, -('/chat/completions').length)
  }
  // 去掉末尾的版本路径段如 /v1, /v4 等
  u = u.replace(/\/v\d+$/, '')
  return u
}

/**
 * 调用大模型API
 * 优先使用请求中的配置，其次使用环境变量
 */
async function callLLMAPI(
  messages: LLMMessage[],
  config: { apiKey?: string; apiUrl?: string; model?: string; timeoutMs?: number }
): Promise<string> {
  const apiKey = config.apiKey || process.env.LLM_API_KEY || ''
  const rawUrl = config.apiUrl || process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions'
  const apiUrl = normalizeChatUrl(rawUrl)
  const model = config.model || process.env.LLM_MODEL || 'gpt-3.5-turbo'

  if (!apiKey) {
    throw new Error('未配置API Key，请在设置中填写')
  }

  const timeoutMs = config.timeoutMs || 30000 // 默认30秒超时
  console.log(`[LLM] 请求: ${apiUrl}, 模型: ${model}, 超时: ${timeoutMs}ms`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`LLM请求超时（${timeoutMs / 1000}秒），请稍后重试`)
    }
    throw new Error(`LLM请求失败: ${err instanceof Error ? err.message : String(err)}`)
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const errText = await response.text()
    let errMsg = `API请求失败 (${response.status})`
    try {
      const errJson = JSON.parse(errText)
      errMsg = errJson.error?.message || errJson.message || errMsg
    } catch {
      // 无法解析JSON，使用默认错误信息
    }
    throw new Error(errMsg)
  }

  const data = (await response.json()) as LLMResponse
  return data.choices[0].message.content
}

/**
 * 翻译段落
 */
async function translateParagraphs(
  texts: string[],
  config: { apiKey?: string; apiUrl?: string; model?: string }
): Promise<string[]> {
  const systemPrompt = `你是一个专业的高中英语翻译助手。你的任务是将英语文章翻译成中文。
翻译要求：
1. 翻译要准确、通顺，符合中文表达习惯
2. 对于长难句，要拆分翻译，保持语义完整
3. 对于专有名词，保留英文并在括号内标注中文
4. 返回JSON数组格式，每个元素对应一段的翻译
5. 只返回JSON数组，不要其他任何内容

示例输入: ["Hello world", "How are you"]
示例输出: ["你好世界", "你好吗"]`

  const userPrompt = JSON.stringify(texts)

  const result = await callLLMAPI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    config
  )

  // 解析LLM返回的JSON数组
  try {
    const parsed = JSON.parse(result)
    if (Array.isArray(parsed)) {
      return parsed.map(String)
    }
  } catch {
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed)) {
          return parsed.map(String)
        }
      } catch {
        // JSON提取也失败
      }
    }
  }

  return texts.map((_, i) => `翻译段落${i + 1}解析失败`)
}

// ==================== 词典数据库 ====================

// ECDICT 词典数据库（懒加载）
let dictDb: Database.Database | null = null

function getDictDb(): Database.Database | null {
  if (dictDb) return dictDb
  
  const fullDbPath = path.join(process.cwd(), 'data', 'stardict_full.db')
  const liteDbPath = path.join(process.cwd(), 'data', 'stardict.db')
  
  let dbPath = liteDbPath
  if (fs.existsSync(fullDbPath)) {
    dbPath = fullDbPath
    console.log(`[Dictionary] 发现 Ultimate 版词典，优先使用: ${dbPath}`)
  }

  try {
    dictDb = new Database(dbPath, { readonly: true })
    console.log(`[Dictionary] 词典数据库已加载: ${dbPath}`)
    return dictDb
  } catch (err) {
    console.warn(`[Dictionary] 词典数据库未找到或加载失败，查词功能不可用: ${dbPath}`)
    return null
  }
}

// 搭配缓存数据库（可读写）
let cacheDb: Database.Database | null = null

function getCacheDb(): Database.Database | null {
  if (cacheDb) return cacheDb
  const dbPath = path.join(process.cwd(), 'data', 'cache.db')
  try {
    cacheDb = new Database(dbPath)
    // 创建搭配缓存表
    cacheDb.exec(`
      CREATE TABLE IF NOT EXISTS word_usage (
        word TEXT PRIMARY KEY,
        collocations TEXT,
        phrases TEXT,
        usage TEXT,
        created_at INTEGER
      )
    `)
    // 创建长难句分析缓存表
    cacheDb.exec(`
      CREATE TABLE IF NOT EXISTS sentence_analysis (
        sentence_hash TEXT PRIMARY KEY,
        sentence TEXT,
        analysis TEXT,
        created_at INTEGER
      )
    `)
    // 创建上下文释义缓存表
    cacheDb.exec(`
      CREATE TABLE IF NOT EXISTS word_context_cache (
        cache_key TEXT PRIMARY KEY,
        word TEXT,
        result TEXT,
        created_at INTEGER
      )
    `)
    // 创建收藏表
    cacheDb.exec(`
      CREATE TABLE IF NOT EXISTS collection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        meaning TEXT,
        source_sentence TEXT,
        source_translation TEXT,
        tags TEXT,
        phonetic TEXT,
        extra TEXT,
        created_at INTEGER,
        review_count INTEGER DEFAULT 0,
        last_review_at INTEGER,
        next_review_at INTEGER
      )
    `)
    cacheDb.exec(`CREATE INDEX IF NOT EXISTS idx_collection_type ON collection(type)`)
    // 迁移：为旧表添加 next_review_at 字段
    try {
      cacheDb.exec('ALTER TABLE collection ADD COLUMN next_review_at INTEGER')
    } catch {
      // 字段已存在，忽略
    }
    console.log(`[Cache] 缓存数据库已加载: ${dbPath}`)
    return cacheDb
  } catch (err) {
    console.warn(`[Cache] 缓存数据库创建失败: ${err}`)
    return null
  }
}

interface DictEntry {
  word: string
  phonetic: string | null
  definition: string | null
  translation: string | null
  pos: string | null
  collins: number | null
  oxford: number | null
  tag: string | null
  bnc: number | null
  frq: number | null
  exchange: string | null
}

function formatDictEntry(row: DictEntry) {
  // 解析 exchange 字段: ECDICT词形变化编码
  // 词条格式(如run): p:ran/i:running/d:run/s:runs/3:runs/r:bigger/t:biggest
  // 逆查格式(如running): 0:run/1:i (表示此词是run的现在分词)
  // p:过去式 d:过去分词 i:现在分词 s:第三人称单数 3:复数
  // r:比较级 t:最高级 f:派生词
  // 注意: 0:原型 和 1:形式类型 是逆查格式，不展示给用户
  const exchangeMap: Record<string, string[]> = {}
  if (row.exchange) {
    for (const part of row.exchange.split('/')) {
      const colonIdx = part.indexOf(':')
      if (colonIdx === -1) continue
      const type = part.slice(0, colonIdx)
      const value = part.slice(colonIdx + 1)
      if (!type || !value) continue

      // 跳过逆查格式(0:原型, 1:形式类型码)
      if (type === '0' || type === '1') continue

      // 跳过值是编码字母而非实际单词的条目(如1:s, 1:p等逆查标记)
      if (/^[a-z0-9]$/.test(value)) continue

      const label: Record<string, string> = {
        p: '过去式', d: '过去分词', i: '现在分词',
        s: '第三人称单数', '3': '复数',
        r: '比较级', t: '最高级', f: '派生词',
      }
      const key = label[type] || type
      if (!exchangeMap[key]) exchangeMap[key] = []
      exchangeMap[key].push(value)
    }
  }

  // 解析 tag 字段: 考试标签 "zk gk cet4" (空格分隔) 或 "zk/gk/cet4" (斜杠分隔)
  const tags = row.tag ? row.tag.split(/[\s/]+/).filter(Boolean) : []

  // 音标规范化：ECDICT使用ASCII近似IPA，转为标准Unicode IPA
  const phonetic = normalizePhonetic(row.phonetic)

  return {
    word: row.word,
    phonetic,
    definition: row.definition || '',
    translation: row.translation || '',
    pos: row.pos || '',
    collins: row.collins || 0,
    oxford: row.oxford || 0,
    tags,
    bnc: row.bnc || null,
    frq: row.frq || null,
    exchange: exchangeMap,
  }
}

/**
 * 将ECDICT的ASCII近似音标转为标准Unicode IPA
 * ECDICT格式: 'bju:tiful → /ˈbjuːtɪfəl/
 * 常见替换: '→ˈ(主重音), ,→ˌ(次重音), :→ː(长音), ә→ə, ɒ→ɒ保持, etc.
 */
function normalizePhonetic(phonetic: string | null): string {
  if (!phonetic || phonetic.trim() === '') return ''

  let ipa = phonetic.trim()

  // ASCII近似 → Unicode IPA 映射
  const replacements: [string, string][] = [
    // 重音符号
    ["'", 'ˈ'],    // 主重音
    [',', 'ˌ'],    // 次重音
    // 长音符号
    [':', 'ː'],    // 长音标记
    // 元音替换
    ['ә', 'ə'],    // schwa
    ['ʌ', 'ʌ'],    // 保持（已是Unicode）
    ['æ', 'æ'],    // 保持
    ['ɒ', 'ɒ'],    // 保持
    ['ɪ', 'ɪ'],    // 保持
    ['ʊ', 'ʊ'],    // 保持
    ['ɛ', 'ɛ'],    // 保持
    ['ɜ', 'ɜ'],    // 保持
    ['ɔ', 'ɔ'],    // 保持
    // 常见ASCII替代
    ['A', 'eɪ'],   // 有些词条用A代eɪ
    ['E', 'iː'],   // 有些用E代iː
    ['I', 'aɪ'],   // 有些用I代aɪ
    ['U', 'uː'],   // 有些用U代uː
    ['O', 'əʊ'],   // 有些用O代əʊ
  ]

  for (const [from, to] of replacements) {
    ipa = ipa.split(from).join(to)
  }

  // 添加斜杠包裹
  return `/${ipa}/`
}

// ==================== API路由 ====================

// 首页
app.get('/', (_req, res) => {
  res.json({
    name: '英语应试助手 API',
    version: '0.1.0',
    endpoints: {
      health: 'GET /api/health',
      translate: 'POST /api/translate',
      testConnection: 'POST /api/test-connection',
      models: 'POST /api/models',
      dictionary: 'GET /api/dictionary/:word',
      wordUsage: 'POST /api/word-usage',
      analyzeSentences: 'POST /api/analyze-sentences',
      analyzeSentenceDetail: 'POST /api/analyze-sentence-detail',
    },
  })
})

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// 连接测试
app.post('/api/test-connection', async (req, res) => {
  try {
    const { apiKey, apiUrl, model } = req.body as TestConnectionRequest

    if (!apiKey || !apiUrl || !model) {
      res.status(400).json({ success: false, error: '请填写完整的API配置' })
      return
    }

    // 发送一个简单的测试请求
    const result = await callLLMAPI(
      [
        { role: 'system', content: '你是一个助手。请用一句话回复。' },
        { role: 'user', content: '你好，请回复"连接成功"' },
      ],
      { apiKey, apiUrl, model }
    )

    res.json({
      success: true,
      message: '连接成功',
      modelInfo: model,
      response: result.substring(0, 100),
    })
  } catch (err) {
    res.status(200).json({
      success: false,
      error: err instanceof Error ? err.message : '连接测试失败',
    })
  }
})

// 获取可用模型列表
app.post('/api/models', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.body as ModelsRequest

    if (!apiKey || !apiUrl) {
      res.status(400).json({ success: false, error: '请填写API地址和Key' })
      return
    }

    // 从用户输入的URL提取base URL，然后拼接 /v1/models
    const baseUrl = extractBaseUrl(normalizeChatUrl(apiUrl))
    const modelsUrl = baseUrl + '/v1/models'

    console.log(`[Models] 请求: ${modelsUrl}`)

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errText = await response.text()
      let errMsg = `获取模型列表失败 (${response.status})`
      try {
        const errJson = JSON.parse(errText)
        errMsg = errJson.error?.message || errJson.message || errMsg
      } catch {
        // 无法解析JSON
      }
      res.status(200).json({ success: false, error: errMsg })
      return
    }

    const data = await response.json()
    // OpenAI兼容格式: { data: [{ id: "model-name", ... }, ...] }
    const models: string[] = (data.data || [])
      .map((m: { id?: string }) => m.id)
      .filter(Boolean)
      .sort()

    res.json({ success: true, models })
  } catch (err) {
    res.status(200).json({
      success: false,
      error: err instanceof Error ? err.message : '获取模型列表失败',
    })
  }
})

// 翻译接口
app.post('/api/translate', async (req, res) => {
  try {
    const { texts, apiKey, apiUrl, model } = req.body as TranslateRequest

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      res.status(400).json({ error: '请提供要翻译的文本数组' })
      return
    }

    if (!apiKey && !process.env.LLM_API_KEY) {
      res.status(400).json({
        error: '未配置API Key，请先在设置中填写API Key',
      })
      return
    }

    const translations = await translateParagraphs(texts, { apiKey, apiUrl, model })
    res.json({ translations })
  } catch (err) {
    console.error('翻译错误:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '翻译服务内部错误',
    })
  }
})

// 词典查询接口
app.get('/api/dictionary/:word', (req, res) => {
  try {
    const db = getDictDb()
    if (!db) {
      res.status(503).json({ error: '词典数据库未加载' })
      return
    }

    const word = req.params.word.toLowerCase().trim()
    if (!word) {
      res.status(400).json({ error: '请提供要查询的单词' })
      return
    }

    // 精确查询
    const row = db.prepare(
      'SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange FROM stardict WHERE word = ? COLLATE NOCASE'
    ).get(word) as DictEntry | undefined

    if (row) {
      res.json({ found: true, ...formatDictEntry(row) })
      return
    }

    // 模糊查询：尝试查找词的原型（如 running → run）
    // 通过 exchange 字段反查：如果某词的 exchange 包含该词，则返回
    const fuzzyRows = db.prepare(
      "SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange FROM stardict WHERE exchange LIKE ? COLLATE NOCASE LIMIT 5"
    ).all(`%${word}%`) as DictEntry[]

    if (fuzzyRows.length > 0) {
      // 找到最匹配的（exchange字段中包含该词形变化）
      for (const frow of fuzzyRows) {
        const exchangeParts = (frow.exchange || '').split('/')
        for (const part of exchangeParts) {
          const [, value] = part.split(':')
          if (value && value.toLowerCase() === word) {
            res.json({ found: true, ...formatDictEntry(frow), searchedForm: word })
            return
          }
        }
      }
    }

    res.json({ found: false, word })
  } catch (err) {
    console.error('词典查询错误:', err)
    res.status(500).json({ error: '词典查询失败' })
  }
})

// 单词搭配/短语/用法接口（LLM生成 + 本地缓存）
app.post('/api/word-usage', async (req, res) => {
  try {
    const { word, apiKey, apiUrl, model, forceRefresh } = req.body as {
      word: string
      apiKey?: string
      apiUrl?: string
      model?: string
      forceRefresh?: boolean
    }

    if (!word) {
      res.status(400).json({ error: '请提供单词' })
      return
    }

    const normalizedWord = word.toLowerCase().trim()
    console.log(`[word-usage] word=${normalizedWord}, forceRefresh=${forceRefresh}`)

    // 1. 先查本地缓存（除非强制刷新）
    const cache = getCacheDb()
    if (cache && !forceRefresh) {
      const cached = cache.prepare(
        'SELECT collocations, phrases, usage FROM word_usage WHERE word = ?'
      ).get(normalizedWord) as { collocations: string; phrases: string; usage: string } | undefined

      if (cached) {
        console.log(`[Cache] 命中搭配缓存: ${normalizedWord}`)
        res.json({
          found: true,
          collocations: JSON.parse(cached.collocations || '[]'),
          phrases: JSON.parse(cached.phrases || '[]'),
          usage: JSON.parse(cached.usage || '[]'),
          cached: true,
        })
        return
      }
    }

    // 2. 缓存未命中，调用LLM生成
    const effectiveApiKey = apiKey || process.env.LLM_API_KEY
    if (!effectiveApiKey) {
      res.status(400).json({ error: '未配置API Key，请先在设置中填写' })
      return
    }

    const systemPrompt = `你是一个高中英语教学专家。为给定单词提供常见搭配、短语和用法。
要求：
1. 返回JSON格式，包含以下字段：
   - collocations: 常见搭配数组，每项含{en:英文搭配, zh:中文释义}
   - phrases: 常用短语数组，每项含{en:英文短语, zh:中文释义}
   - usage: 用法要点数组，每项含{point:用法说明, example:例句, translation:例句翻译}
2. 内容聚焦高中英语应试，优先选择高考高频搭配
3. 搭配和短语各3-5个，用法要点2-3个
4. 只返回JSON，不要其他内容`

    const userPrompt = normalizedWord

    const result = await callLLMAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { apiKey: effectiveApiKey, apiUrl, model }
    )

    // 解析LLM返回的JSON
    let parsed: { collocations?: unknown[]; phrases?: unknown[]; usage?: unknown[] } | null = null
    try {
      parsed = JSON.parse(result)
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
      }
    }

    if (parsed && (parsed.collocations || parsed.phrases || parsed.usage)) {
      // 3. 保存到缓存
      if (cache) {
        try {
          cache.prepare(
            'INSERT OR REPLACE INTO word_usage (word, collocations, phrases, usage, created_at) VALUES (?, ?, ?, ?, ?)'
          ).run(
            normalizedWord,
            JSON.stringify(parsed.collocations || []),
            JSON.stringify(parsed.phrases || []),
            JSON.stringify(parsed.usage || []),
            Date.now()
          )
          console.log(`[Cache] 搭配已缓存: ${normalizedWord}`)
        } catch (err) {
          console.warn(`[Cache] 缓存写入失败: ${err}`)
        }
      }

      res.json({ found: true, ...parsed, cached: false })
      return
    }

    res.json({ found: false })
  } catch (err) {
    console.error('单词用法查询错误:', err)
    res.status(500).json({ error: '查询失败' })
  }
})

// ==================== 词组扫描（本地ECDICT匹配） ====================

app.post('/api/scan-phrases', (req, res) => {
  try {
    const { text, sentence, sentenceTranslation } = req.body as {
      text: string
      sentence?: string
      sentenceTranslation?: string
    }

    if (!text) {
      res.status(400).json({ error: '请提供文本' })
      return
    }

    const dict = getDictDb()
    if (!dict) {
      res.status(500).json({ error: '词典数据库不可用' })
      return
    }

    // 清理文本：去除标点，分词
    const cleanText = text.replace(/[^a-zA-Z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
    const words = cleanText.split(' ').filter(w => w.length > 0)

    // 生成2-4词N-gram并查ECDICT
    const foundPhrases: Array<{
      phrase: string
      translation: string
      startIndex: number
      endIndex: number
      words: string[]
    }> = []

    const matchedSet = new Set<string>() // 去重

    // 从长到短扫描（优先匹配长词组）
    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join(' ').toLowerCase()

        // 跳过已匹配范围内的子串
        const overlap = foundPhrases.some(
          p => i >= p.startIndex && i < p.endIndex
        )
        if (overlap) continue

        if (matchedSet.has(ngram)) continue

        // 在ECDICT中查找
        const row = dict.prepare(
          'SELECT word, translation FROM stardict WHERE word = ? COLLATE NOCASE'
        ).get(ngram) as { word: string; translation: string } | undefined

        if (row && row.translation) {
          // 过滤：只保留有中文释义的（排除专有名词等）
          const hasChinese = /[\u4e00-\u9fff]/.test(row.translation)
          if (!hasChinese) continue

        // 过滤：排除太泛的词组（全是功能词+1个实词的2词组合通常太泛）
          if (n === 2) {
            const contentWords = words.slice(i, i + n).filter(
              w => !/^(a|an|the|to|of|in|on|at|for|with|by|from|as|is|am|are|was|were|be|been|being|do|does|did|have|has|had|it|he|she|we|they|this|that|these|those|and|but|or|so|if|not|no|up|out|off)$/i.test(w)
            )
            // 2词组合至少要有2个实词
            if (contentWords.length < 2) continue
          }

          // 过滤：排除释义为纯网络用语的（[网络]开头且太短）
          if (row.translation.startsWith('[网络]') && row.translation.length < 20) continue

          matchedSet.add(ngram)

          // 规范化：尝试去掉前导/尾随功能词，匹配更精确的核心词组
          let phraseWords = words.slice(i, i + n)
          let actualStart = i
          const leadingStopWords = /^(to|a|an|the|of|in|on|at|for|with|by|from)$/i
          while (phraseWords.length > 2 && leadingStopWords.test(phraseWords[0])) {
            phraseWords.shift()
            actualStart++
          }
          const trailingStopWords = /^(of|in|on|at|for|with|by|from|to|the|a|an)$/i
          while (phraseWords.length > 2 && trailingStopWords.test(phraseWords[phraseWords.length - 1])) {
            phraseWords.pop()
          }
          const corePhrase = phraseWords.join(' ').toLowerCase()

          // 如果裁剪后的核心词组在ECDICT中也有记录，用核心版本
          if (corePhrase !== ngram) {
            const coreRow = dict.prepare(
              'SELECT word, translation FROM stardict WHERE word = ? COLLATE NOCASE'
            ).get(corePhrase) as { word: string; translation: string } | undefined
            if (coreRow && coreRow.translation && /[\u4e00-\u9fff]/.test(coreRow.translation)) {
              foundPhrases.push({
                phrase: coreRow.word,
                translation: coreRow.translation.split('\n')[0].substring(0, 100),
                startIndex: actualStart,
                endIndex: actualStart + phraseWords.length,
                words: phraseWords,
              })
              continue
            }
          }

          foundPhrases.push({
            phrase: row.word,
            translation: row.translation.split('\n')[0].substring(0, 100),
            startIndex: i,
            endIndex: i + n,
            words: words.slice(i, i + n),
          })
        }
      }
    }

    // 按startIndex排序
    foundPhrases.sort((a, b) => a.startIndex - b.startIndex)

    console.log(`[Phrases] 文本扫描发现 ${foundPhrases.length} 个词组`)

    res.json({
      found: foundPhrases.length > 0,
      phrases: foundPhrases,
      sourceSentence: sentence || null,
      sourceTranslation: sentenceTranslation || null,
    })
  } catch (err) {
    console.error('词组扫描错误:', err)
    res.status(500).json({ error: '扫描失败' })
  }
})

// ==================== 单词上下文释义 ====================

app.post('/api/word-context', async (req, res) => {
  try {
    const { word, sentence, translation, apiKey, apiUrl, model, forceRefresh } = req.body as {
      word: string
      sentence: string
      translation: string
      apiKey?: string
      apiUrl?: string
      model?: string
      forceRefresh?: boolean
    }

    if (!word || !sentence) {
      res.status(400).json({ error: '请提供单词和上下文句子' })
      return
    }

    const normalizedWord = word.toLowerCase().trim()
    console.log(`[word-context] word=${normalizedWord}, forceRefresh=${forceRefresh}`)

    // 1. 先查本地缓存（除非强制刷新）
    const cache = getCacheDb()
    const cacheKey = `${normalizedWord}:${sentence.slice(0, 50)}`
    if (cache && !forceRefresh) {
      const cached = cache.prepare(
        'SELECT result FROM word_context_cache WHERE cache_key = ?'
      ).get(cacheKey) as { result: string } | undefined

      if (cached) {
        console.log(`[Cache] 命中上下文释义缓存: ${normalizedWord}`)
        res.json({ found: true, ...JSON.parse(cached.result), cached: true })
        return
      }
    }

    // 2. 缓存未命中，调用LLM（上下文释义用较短超时15秒）
    const effectiveApiKey = apiKey || process.env.LLM_API_KEY
    if (!effectiveApiKey) {
      res.json({ found: false, error: '未配置API Key，语境分析不可用' })
      return
    }

    const systemPrompt = `你是一个高中英语教学专家。根据单词在句子中的上下文，判断其具体含义和是否属于词组。

要求：
1. 返回JSON格式，包含以下字段：
   - matchedIndex: 整数，该词在此语境下最匹配的释义序号（从0开始，对应词典释义列表的索引）
   - contextMeaning: 字符串，该词在此语境下的简明中文释义（10字以内）
   - phrase: 对象或null，如果该词属于某个词组/搭配，则包含：
     - text: 词组完整文本（如 "a glass of"）
     - meaning: 词组的中文释义
     - words: 数组，词组中每个词的文本（如 ["a", "glass", "of"]）
   如果该词不属于词组，phrase为null
2. 只返回JSON，不要其他内容
3. 判断词组时，向前向后各看2-3个词，识别常见搭配模式`

    const userPrompt = `单词: ${word}
英文句子: ${sentence}
${translation ? `中文翻译: ${translation}` : ''}`

    const result = await callLLMAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { apiKey: effectiveApiKey, apiUrl, model, timeoutMs: 15000 }
    )

    // 解析LLM返回的JSON
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(result)
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
      }
    }

    if (parsed && parsed.contextMeaning) {
      // 校验并规范化
      const contextResult = {
        matchedIndex: typeof parsed.matchedIndex === 'number' ? parsed.matchedIndex : -1,
        contextMeaning: String(parsed.contextMeaning || ''),
        phrase: parsed.phrase && typeof parsed.phrase === 'object' ? {
          text: String((parsed.phrase as Record<string, unknown>).text || ''),
          meaning: String((parsed.phrase as Record<string, unknown>).meaning || ''),
          words: Array.isArray((parsed.phrase as Record<string, unknown>).words) 
            ? ((parsed.phrase as Record<string, unknown>).words as unknown[]).map(String) : [],
        } : null,
      }

      // 3. 保存到缓存
      if (cache) {
        try {
          cache.prepare(
            'INSERT OR REPLACE INTO word_context_cache (cache_key, word, result, created_at) VALUES (?, ?, ?, ?)'
          ).run(cacheKey, normalizedWord, JSON.stringify(contextResult), Date.now())
          console.log(`[Cache] 上下文释义已缓存: ${normalizedWord}`)
        } catch (err) {
          console.warn(`[Cache] 缓存写入失败: ${err}`)
        }
      }

      res.json({ found: true, ...contextResult, cached: false })
      return
    }

    res.json({ found: false, error: 'LLM未返回有效结果' })
  } catch (err) {
    console.error('上下文释义查询错误:', err)
    const errMsg = err instanceof Error ? err.message : '查询失败'
    // 返回200但带error字段，让前端能正常解析并展示错误
    res.json({ found: false, error: errMsg })
  }
})

// ==================== 收藏本 CRUD ====================

// 收藏项类型
interface CollectionItem {
  id: number
  type: 'word' | 'phrase' | 'grammar' | 'sentence'
  content: string
  meaning: string | null
  sourceSentence: string | null
  sourceTranslation: string | null
  tags: string[]
  phonetic: string | null
  extra: Record<string, unknown> | null
  createdAt: number
  reviewCount: number
  lastReviewAt: number | null
  nextReviewAt: number | null
}

// 数据库行 → CollectionItem 转换
function rowToCollectionItem(row: Record<string, unknown>): CollectionItem {
  return {
    id: row.id as number,
    type: row.type as CollectionItem['type'],
    content: row.content as string,
    meaning: row.meaning as string | null,
    sourceSentence: row.source_sentence as string | null,
    sourceTranslation: row.source_translation as string | null,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
    phonetic: row.phonetic as string | null,
    extra: row.extra ? JSON.parse(row.extra as string) : null,
    createdAt: row.created_at as number,
    reviewCount: row.review_count as number,
    lastReviewAt: row.last_review_at as number | null,
    nextReviewAt: row.next_review_at as number | null,
  }
}

// 添加收藏
app.post('/api/collection', (req, res) => {
  try {
    const cache = getCacheDb()
    if (!cache) {
      res.status(500).json({ error: '数据库不可用' })
      return
    }

    const { type, content, meaning, sourceSentence, sourceTranslation, tags, phonetic, extra } = req.body as {
      type: string
      content: string
      meaning?: string
      sourceSentence?: string
      sourceTranslation?: string
      tags?: string[]
      phonetic?: string
      extra?: Record<string, unknown>
    }

    if (!type || !content) {
      res.status(400).json({ error: '请提供类型和内容' })
      return
    }

    // 检查是否已收藏（同类型+同内容）
    const existing = cache.prepare(
      'SELECT id FROM collection WHERE type = ? AND content = ?'
    ).get(type, content) as { id: number } | undefined

    if (existing) {
      res.json({ found: true, id: existing.id, message: '已收藏' })
      return
    }

    const now = Date.now()
    const result = cache.prepare(
      `INSERT INTO collection (type, content, meaning, source_sentence, source_translation, tags, phonetic, extra, created_at, review_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      type,
      content,
      meaning || null,
      sourceSentence || null,
      sourceTranslation || null,
      JSON.stringify(tags || []),
      phonetic || null,
      extra ? JSON.stringify(extra) : null,
      now
    )

    res.json({ found: true, id: result.lastInsertRowid, createdAt: now })
  } catch (err) {
    console.error('添加收藏错误:', err)
    res.status(500).json({ error: '添加收藏失败' })
  }
})

// 删除收藏
app.delete('/api/collection/:id', (req, res) => {
  try {
    const cache = getCacheDb()
    if (!cache) {
      res.status(500).json({ error: '数据库不可用' })
      return
    }

    const id = parseInt(req.params.id)
    if (isNaN(id)) {
      res.status(400).json({ error: '无效ID' })
      return
    }

    cache.prepare('DELETE FROM collection WHERE id = ?').run(id)
    res.json({ success: true })
  } catch (err) {
    console.error('删除收藏错误:', err)
    res.status(500).json({ error: '删除收藏失败' })
  }
})

// 查询收藏列表（支持按类型筛选、分页、搜索、到期复习筛选）
app.get('/api/collection', (req, res) => {
  try {
    const cache = getCacheDb()
    if (!cache) {
      res.status(500).json({ error: '数据库不可用' })
      return
    }

    const { type, tag, search, page = '1', pageSize = '50', dueReview } = req.query as {
      type?: string
      tag?: string
      search?: string
      page?: string
      pageSize?: string
      dueReview?: string
    }

    let whereClause = '1=1'
    const params: unknown[] = []

    if (type) {
      whereClause += ' AND type = ?'
      params.push(type)
    }
    if (tag) {
      whereClause += ' AND tags LIKE ?'
      params.push(`%"${tag}"%`)
    }
    if (search) {
      whereClause += ' AND (content LIKE ? OR meaning LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }
    // 只筛选到期需要复习的（next_review_at <= 当前时间 或 next_review_at IS NULL）
    if (dueReview === 'true') {
      whereClause += ' AND (next_review_at IS NULL OR next_review_at <= ?)'
      params.push(Date.now())
    }

    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const total = (cache.prepare(
      `SELECT COUNT(*) as count FROM collection WHERE ${whereClause}`
    ).get(...params) as { count: number }).count

    const rows = cache.prepare(
      `SELECT * FROM collection WHERE ${whereClause} ORDER BY next_review_at ASC, created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Record<string, unknown>[]

    const items = rows.map(rowToCollectionItem)

    res.json({
      items,
      total,
      page: parseInt(page),
      pageSize: limit,
    })
  } catch (err) {
    console.error('查询收藏错误:', err)
    res.status(500).json({ error: '查询收藏失败' })
  }
})

// 检查是否已收藏
app.get('/api/collection/check', (req, res) => {
  try {
    const cache = getCacheDb()
    if (!cache) {
      res.status(500).json({ error: '数据库不可用' })
      return
    }

    const { type, content } = req.query as { type: string; content: string }
    if (!type || !content) {
      res.status(400).json({ error: '请提供类型和内容' })
      return
    }

    const existing = cache.prepare(
      'SELECT id FROM collection WHERE type = ? AND content = ?'
    ).get(type, content) as { id: number } | undefined

    res.json({ collected: !!existing, id: existing?.id || null })
  } catch (err) {
    console.error('检查收藏错误:', err)
    res.status(500).json({ error: '检查收藏失败' })
  }
})

// 更新复习状态
// 标记复习（支持艾宾浩斯曲线）
app.post('/api/collection/:id/review', (req, res) => {
  try {
    const cache = getCacheDb()
    if (!cache) {
      res.status(500).json({ error: '数据库不可用' })
      return
    }

    const id = parseInt(req.params.id)
    if (isNaN(id)) {
      res.status(400).json({ error: '无效ID' })
      return
    }

    const { known } = req.body as { known?: boolean }
    const now = Date.now()

    // 获取当前复习次数
    const row = cache.prepare(
      'SELECT review_count FROM collection WHERE id = ?'
    ).get(id) as { review_count: number } | undefined

    const currentCount = row?.review_count || 0
    // 艾宾浩斯间隔：1天, 2天, 4天, 7天, 15天, 30天
    const intervals = [1, 2, 4, 7, 15, 30]
    const days = known ? intervals[Math.min(currentCount, intervals.length - 1)] : 0
    const nextReviewAt = known ? now + days * 24 * 60 * 60 * 1000 : null

    cache.prepare(
      'UPDATE collection SET review_count = review_count + 1, last_review_at = ?, next_review_at = ? WHERE id = ?'
    ).run(now, nextReviewAt, id)

    res.json({ success: true, nextReviewAt, days })
  } catch (err) {
    console.error('更新复习错误:', err)
    res.status(500).json({ error: '更新复习失败' })
  }
})

// 提前复习（将next_review_at设为null，使其立即出现在复习队列）
app.post('/api/collection/:id/advance-review', (req, res) => {
  try {
    const cache = getCacheDb()
    if (!cache) {
      res.status(500).json({ error: '数据库不可用' })
      return
    }

    const id = parseInt(req.params.id)
    if (isNaN(id)) {
      res.status(400).json({ error: '无效ID' })
      return
    }

    cache.prepare(
      'UPDATE collection SET next_review_at = NULL WHERE id = ?'
    ).run(id)

    res.json({ success: true })
  } catch (err) {
    console.error('提前复习错误:', err)
    res.status(500).json({ error: '提前复习失败' })
  }
})

// 获取收藏统计
app.get('/api/collection/stats', (_req, res) => {
  try {
    const cache = getCacheDb()
    if (!cache) {
      res.status(500).json({ error: '数据库不可用' })
      return
    }

    const typeCounts = cache.prepare(
      'SELECT type, COUNT(*) as count FROM collection GROUP BY type'
    ).all() as { type: string; count: number }[]

    const total = (cache.prepare('SELECT COUNT(*) as count FROM collection').get() as { count: number }).count

    const byType: Record<string, number> = {}
    for (const { type, count } of typeCounts) {
      byType[type] = count
    }

    res.json({ total, byType })
  } catch (err) {
    console.error('收藏统计错误:', err)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// ==================== 长难句识别与分析 ====================

// 从句标记词（用于规则识别）
const SUBORDINATE_MARKERS = [
  // 定语从句
  'which', 'who', 'whom', 'whose', 'that', 'where', 'when', 'why',
  // 状语从句
  'because', 'although', 'though', 'while', 'if', 'unless', 'since', 'until',
  'before', 'after', 'as', 'once', 'whenever', 'wherever', 'however',
  'whether', 'provided', 'supposing', 'assuming',
  // 名词性从句
  'what', 'how', 'whatever', 'whoever', 'whomever',
]

/**
 * 规则识别长难句
 * 条件（满足任一）：
 * 1. 句子词数 >= 25
 * 2. 包含 >= 2个从句标记词
 * 3. 包含从句标记词且词数 >= 15
 */
function isComplexSentence(sentence: string): boolean {
  const words = sentence.split(/\s+/).filter(w => /[a-zA-Z]/.test(w))
  const wordCount = words.length

  // 统计从句标记词数量
  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
  const markerCount = lowerWords.filter(w => SUBORDINATE_MARKERS.includes(w)).length

  return wordCount >= 25 || markerCount >= 2 || (markerCount >= 1 && wordCount >= 15)
}

/**
 * 从段落文本中提取句子列表
 */
function extractSentences(text: string): string[] {
  // 按句号/问号/感叹号分割，保留分隔符
  const parts = text.split(/(?<=[.!?])\s+/)
  return parts.filter(s => s.trim().length > 0)
}

/**
 * 校验并规范化LLM返回的长难句分析数据
 * 确保每个字段类型正确，防止前端渲染崩溃
 */
function validateSentenceDetail(data: Record<string, unknown>): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null

  const result: Record<string, unknown> = {}

  // 校验trunk：必须是对象，包含subject/predicate/object字符串
  if (data.trunk && typeof data.trunk === 'object' && !Array.isArray(data.trunk)) {
    const trunk = data.trunk as Record<string, unknown>
    result.trunk = {
      subject: typeof trunk.subject === 'string' ? trunk.subject : '',
      predicate: typeof trunk.predicate === 'string' ? trunk.predicate : '',
      object: typeof trunk.object === 'string' ? trunk.object : '',
    }
  } else {
    result.trunk = { subject: '', predicate: '', object: '' }
  }

  // 校验clauses：必须是数组，每项包含type/marker/content/role字符串
  if (Array.isArray(data.clauses)) {
    result.clauses = data.clauses.filter((c: unknown) => c && typeof c === 'object').map((c: Record<string, unknown>) => ({
      type: typeof c.type === 'string' ? c.type : '未知从句',
      marker: typeof c.marker === 'string' ? c.marker : '',
      content: typeof c.content === 'string' ? c.content : '',
      role: typeof c.role === 'string' ? c.role : '',
    }))
  } else {
    result.clauses = []
  }

  // 校验modifiers：必须是数组，每项包含type/content/target字符串
  if (Array.isArray(data.modifiers)) {
    result.modifiers = data.modifiers.filter((m: unknown) => m && typeof m === 'object').map((m: Record<string, unknown>) => ({
      type: typeof m.type === 'string' ? m.type : '修饰',
      content: typeof m.content === 'string' ? m.content : '',
      target: typeof m.target === 'string' ? m.target : '',
    }))
  } else {
    result.modifiers = []
  }

  // 校验structure：必须是数组，每项包含level数字+text/type字符串
  if (Array.isArray(data.structure)) {
    result.structure = data.structure.filter((s: unknown) => s && typeof s === 'object').map((s: Record<string, unknown>) => ({
      level: typeof s.level === 'number' ? s.level : 0,
      text: typeof s.text === 'string' ? s.text : '',
      type: typeof s.type === 'string' ? s.type : '主干',
    }))
  } else {
    result.structure = []
  }

  // 校验tips：必须是字符串数组
  if (Array.isArray(data.tips)) {
    result.tips = data.tips.filter((t: unknown) => typeof t === 'string')
  } else {
    result.tips = []
  }

  // 校验phrases：词组搭配列表
  if (Array.isArray(data.phrases)) {
    result.phrases = data.phrases.filter((p: unknown) => p && typeof p === 'object').map((p: Record<string, unknown>) => ({
      phrase: typeof p.phrase === 'string' ? p.phrase : '',
      meaning: typeof p.meaning === 'string' ? p.meaning : '',
      type: typeof p.type === 'string' ? p.type : '固定搭配',
    }))
  } else {
    result.phrases = []
  }

  // 校验patterns：固定句型列表
  if (Array.isArray(data.patterns)) {
    result.patterns = data.patterns.filter((p: unknown) => p && typeof p === 'object').map((p: Record<string, unknown>) => ({
      pattern: typeof p.pattern === 'string' ? p.pattern : '',
      name: typeof p.name === 'string' ? p.name : '',
      example: typeof p.example === 'string' ? p.example : '',
    }))
  } else {
    result.patterns = []
  }

  // 校验examPoints：考点提示列表
  if (Array.isArray(data.examPoints)) {
    result.examPoints = data.examPoints.filter((e: unknown) => e && typeof e === 'object').map((e: Record<string, unknown>) => ({
      point: typeof e.point === 'string' ? e.point : '',
      description: typeof e.description === 'string' ? e.description : '',
      importance: typeof e.importance === 'string' && ['高', '中', '低'].includes(e.importance) ? e.importance : '中',
    }))
  } else {
    result.examPoints = []
  }

  return result
}

/**
 * 批量识别段落中的长难句
 * 返回：{ sentences: [{index, text, isComplex}] }
 */
app.post('/api/analyze-sentences', (req, res) => {
  try {
    const { paragraphs } = req.body as { paragraphs: string[] }

    if (!paragraphs || !Array.isArray(paragraphs)) {
      res.status(400).json({ error: '请提供段落文本数组' })
      return
    }

    const result: Array<{
      paragraphIndex: number
      sentences: Array<{ index: number; text: string; isComplex: boolean; wordCount: number; markerCount: number }>
    }> = []

    paragraphs.forEach((para, pIdx) => {
      const sentences = extractSentences(para)
      const sentenceData = sentences.map((text, sIdx) => {
        const words = text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w))
        const wordCount = words.length
        const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
        const markerCount = lowerWords.filter(w => SUBORDINATE_MARKERS.includes(w)).length
        return {
          index: sIdx,
          text,
          isComplex: wordCount >= 25 || markerCount >= 2 || (markerCount >= 1 && wordCount >= 15),
          wordCount,
          markerCount,
        }
      })
      result.push({ paragraphIndex: pIdx, sentences: sentenceData })
    })

    res.json({ result })
  } catch (err) {
    console.error('句子识别错误:', err)
    res.status(500).json({ error: '句子识别失败' })
  }
})

/**
 * 长难句深度分析（LLM + 缓存）
 * 返回：主干提取、从句类型标注、修饰成分
 */
app.post('/api/analyze-sentence-detail', async (req, res) => {
  try {
    const { sentence, apiKey, apiUrl, model, forceRefresh } = req.body as {
      sentence: string
      apiKey?: string
      apiUrl?: string
      model?: string
      forceRefresh?: boolean
    }

    if (!sentence) {
      res.status(400).json({ error: '请提供句子' })
      return
    }

    console.log(`[sentence-detail] forceRefresh=${forceRefresh}, sentence=${sentence.slice(0, 30)}...`)

    // 用句子内容的hash作为缓存key
    const sentenceHash = sentence.trim().toLowerCase().replace(/\s+/g, ' ')

    // 1. 查缓存（除非强制刷新）
    const cache = getCacheDb()
    if (cache && !forceRefresh) {
      const cached = cache.prepare(
        'SELECT analysis FROM sentence_analysis WHERE sentence_hash = ?'
      ).get(sentenceHash) as { analysis: string } | undefined

      if (cached) {
        console.log(`[Cache] 命中句子分析缓存: ${sentenceHash.slice(0, 30)}...`)
        const cachedData = JSON.parse(cached.analysis)
        const validated = validateSentenceDetail(cachedData)
        if (validated) {
          res.json({ found: true, ...validated, cached: true })
        } else {
          // 缓存数据损坏，删除并重新分析
          cache.prepare('DELETE FROM sentence_analysis WHERE sentence_hash = ?').run(sentenceHash)
          console.warn(`[Cache] 缓存数据损坏，已删除: ${sentenceHash.slice(0, 30)}...`)
          // 继续往下走，重新调用LLM
        }
        if (validated) return
      }
    }

    // 2. 调用LLM分析
    const effectiveApiKey = apiKey || process.env.LLM_API_KEY
    if (!effectiveApiKey) {
      res.status(400).json({ error: '未配置API Key，请先在设置中填写' })
      return
    }

    const systemPrompt = `你是一个高中英语句法分析专家。分析给定的英语长难句，返回JSON格式。
要求：
1. trunk: 句子主干（主谓宾/主系表），对象格式：{subject: "主语", predicate: "谓语", object: "宾语/表语"}
2. clauses: 从句列表数组，每项格式：
   {type: "从句类型", marker: "引导词", content: "从句内容", role: "语法作用说明"}
   从句类型限选：定语从句/状语从句/名词性从句(主语从句/宾语从句/表语从句/同位语从句)
3. modifiers: 修饰成分列表数组，每项格式：
   {type: "修饰类型", content: "修饰内容", target: "修饰对象"}
   修饰类型限选：定语/状语/插入语/同位语
4. structure: 结构层次描述（用于可视化），数组格式，按层级缩进表示嵌套关系
   每项格式：{level: 层级数字(0=主干), text: "该层内容", type: "主干/从句/修饰"}
5. tips: 分析提示，2-3句话帮助高中生理解这个长难句
6. phrases: 句中重要词组搭配列表，每项格式：
   {phrase: "词组", meaning: "中文释义", type: "搭配类型"}
   搭配类型限选：动词短语/介词短语/固定搭配/形容词短语
   只列出高中阶段应掌握的重要词组，忽略过于简单的组合
7. patterns: 固定句型列表，每项格式：
   {pattern: "句型结构", name: "句型名称", example: "本句中的体现"}
   如：It is...that...强调句型、Not only...but also...并列句型、So...that...结果状语等
8. examPoints: 常考考点提示（可选），数组格式，每项格式：
   {point: "考点名称", description: "考点说明", importance: "高/中/低"}
   只在确实存在高考常考语法点时才列出，没有则返回空数组

只返回JSON，不要其他内容。`

    const result = await callLLMAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sentence },
      ],
      { apiKey: effectiveApiKey, apiUrl, model }
    )

    // 解析LLM返回
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(result)
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
      }
    }

    // 校验并规范化LLM返回数据，确保类型安全
    const validated = parsed ? validateSentenceDetail(parsed) : null

    if (validated) {
      // 3. 写缓存
      if (cache) {
        try {
          cache.prepare(
            'INSERT OR REPLACE INTO sentence_analysis (sentence_hash, sentence, analysis, created_at) VALUES (?, ?, ?, ?)'
          ).run(sentenceHash, sentence, JSON.stringify(validated), Date.now())
          console.log(`[Cache] 句子分析已缓存: ${sentenceHash.slice(0, 30)}...`)
        } catch (err) {
          console.warn(`[Cache] 句子分析缓存写入失败: ${err}`)
        }
      }

      res.json({ found: true, ...validated, cached: false })
      return
    }

    res.json({ found: false })
  } catch (err) {
    console.error('句子分析错误:', err)
    res.status(500).json({ error: '句子分析失败' })
  }
})

// ==================== 熟词生义扫描 ====================

/**
 * 熟词生义扫描 - LLM识别段落中熟词生义的单词
 * 返回：{ found, words: [{word, commonMeaning, contextMeaning, startIndex, endIndex}] }
 */
app.post('/api/scan-uncommon-meanings', async (req, res) => {
  try {
    const { text, translation, apiKey, apiUrl, model, forceRefresh } = req.body as {
      text: string
      translation?: string
      apiKey?: string
      apiUrl?: string
      model?: string
      forceRefresh?: boolean
    }

    if (!text) {
      res.status(400).json({ error: '请提供段落文本' })
      return
    }

    console.log(`[scan-uncommon] forceRefresh=${forceRefresh}, text=${text.slice(0, 30)}...`)

    const effectiveApiKey = apiKey || process.env.LLM_API_KEY
    if (!effectiveApiKey) {
      res.status(400).json({ error: '未配置API Key，请先在设置中填写' })
      return
    }

    // 缓存key
    const textHash = text.trim().toLowerCase().replace(/\s+/g, ' ')

    // 1. 查缓存（除非强制刷新）
    const cache = getCacheDb()
    if (cache && !forceRefresh) {
      const cached = cache.prepare(
        'SELECT analysis FROM sentence_analysis WHERE sentence_hash = ?'
      ).get(`uncommon_v2:${textHash}`) as { analysis: string } | undefined

      if (cached) {
        console.log(`[Cache] 命中熟词生义缓存: ${textHash.slice(0, 30)}...`)
        try {
          const cachedData = JSON.parse(cached.analysis)
          if (Array.isArray(cachedData)) {
            res.json({ found: cachedData.length > 0, words: cachedData, cached: true })
            return
          }
        } catch { /* cache corrupted, continue */ }
        cache.prepare('DELETE FROM sentence_analysis WHERE sentence_hash = ?').run(`uncommon_v2:${textHash}`)
      }
    }

    // 2. 调用LLM（含二次审查自检）
    const systemPrompt = `你是一个高中英语词汇专家。分析给定的英语段落，找出其中"熟词生义"的单词。

"熟词生义"是指：学生已经熟悉该单词的常见含义，但在本文中该词使用了不常见的含义。

例如：
- "address" 常见义"地址"，但本文可能是"处理/解决"
- "strike" 常见义"打击"，但本文可能是"突然想到"
- "observe" 常见义"观察"，但本文可能是"遵守"
- "cover" 常见义"覆盖"，但本文可能是"涉及/讲述"
- "conduct" 常见义"行为"，但本文可能是"进行/实施"

请按以下两步进行：

【第一步：初步识别】
逐词扫描段落，找出所有可能是熟词生义的单词，包括容易忽略的常见词（如cover、work、run等高频词的非常规用法）。

【第二步：自检验证】
对第一步的每个候选词进行二次审查：
1. 该词在本文中的含义是否确实不同于高中学生最熟悉的常见含义？
2. 是否存在遗漏？重新快速扫描段落，检查是否有第一步未识别的熟词生义（尤其是cover、work、run、state、form等高频多义词）。
3. 剔除判断错误的候选词。

输出要求：
1. 只标注经过自检验证的熟词生义，不要标注正常使用的常见义
2. 每个段落最多标注5个最重要的熟词生义
3. 返回JSON数组格式，每项：
   {word: "单词原形", commonMeaning: "常见含义(1-2词)", contextMeaning: "本文含义(1-2词)", reason: "简要说明为什么这是熟词生义"}
4. 如果没有熟词生义，返回空数组 []

只返回JSON数组，不要其他内容。`

    const userContent = translation
      ? `英语段落：\n${text}\n\n中文译文（参考）：\n${translation}`
      : `英语段落：\n${text}`

    const result = await callLLMAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { apiKey: effectiveApiKey, apiUrl, model }
    )

    // 解析LLM返回
    let words: Array<{ word: string; commonMeaning: string; contextMeaning: string; reason: string }> = []
    try {
      const parsed = JSON.parse(result)
      if (Array.isArray(parsed)) {
        words = parsed.filter((w: unknown) => w && typeof w === 'object').map((w: Record<string, unknown>) => ({
          word: typeof w.word === 'string' ? w.word : '',
          commonMeaning: typeof w.commonMeaning === 'string' ? w.commonMeaning : '',
          contextMeaning: typeof w.contextMeaning === 'string' ? w.contextMeaning : '',
          reason: typeof w.reason === 'string' ? w.reason : '',
        })).filter((w: { word: string }) => w.word.length > 0)
      }
    } catch {
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed)) {
            words = parsed.filter((w: unknown) => w && typeof w === 'object').map((w: Record<string, unknown>) => ({
              word: typeof w.word === 'string' ? w.word : '',
              commonMeaning: typeof w.commonMeaning === 'string' ? w.commonMeaning : '',
              contextMeaning: typeof w.contextMeaning === 'string' ? w.contextMeaning : '',
              reason: typeof w.reason === 'string' ? w.reason : '',
            })).filter((w: { word: string }) => w.word.length > 0)
          }
        } catch { /* ignore */ }
      }
    }

    // 在原文中定位每个熟词生义的位置（单词级索引，与词组API一致）
    const cleanText = text.replace(/[^a-zA-Z\s'-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const allWords = cleanText.split(' ').filter(w => w.length > 0)
    const wordsWithPosition = words.map(w => {
      const wordLower = w.word.toLowerCase()
      // 在cleanText的单词数组中查找匹配位置
      const wordIdx = allWords.indexOf(wordLower)
      if (wordIdx >= 0) {
        return {
          ...w,
          startIndex: wordIdx,
          endIndex: wordIdx + 1,
        }
      }
      // 尝试词形匹配（如过去式、复数等）
      for (let i = 0; i < allWords.length; i++) {
        const aw = allWords[i]
        if (aw === wordLower ||
            aw.replace(/(?:ed|es|s|ing|ly|er|est)$/, '') === wordLower.replace(/(?:ed|es|s|ing|ly|er|est)$/, '') ||
            aw.replace(/ied$/, 'y') === wordLower.replace(/ied$/, 'y')) {
          return {
            ...w,
            startIndex: i,
            endIndex: i + 1,
          }
        }
      }
      return null
    }).filter((w): w is NonNullable<typeof w> => w !== null)

    // 3. 写缓存
    if (cache && wordsWithPosition.length > 0) {
      try {
        cache.prepare(
          'INSERT OR REPLACE INTO sentence_analysis (sentence_hash, sentence, analysis, created_at) VALUES (?, ?, ?, ?)'
        ).run(`uncommon_v2:${textHash}`, text, JSON.stringify(wordsWithPosition), Date.now())
        console.log(`[Cache] 熟词生义已缓存: ${textHash.slice(0, 30)}...`)
      } catch (err) {
        console.warn(`[Cache] 熟词生义缓存写入失败: ${err}`)
      }
    }

    res.json({ found: wordsWithPosition.length > 0, words: wordsWithPosition, cached: false })
  } catch (err) {
    console.error('熟词生义扫描错误:', err)
    res.status(500).json({ error: '熟词生义扫描失败' })
  }
})

// ==================== 单词助记生成 ====================

app.post('/api/word-mnemonic', async (req, res) => {
  try {
    const { word, apiKey, apiUrl, model, forceRefresh } = req.body as {
      word: string
      apiKey?: string
      apiUrl?: string
      model?: string
      forceRefresh?: boolean
    }

    if (!word) {
      res.status(400).json({ error: '请提供单词' })
      return
    }

    const normalizedWord = word.toLowerCase().trim()
    console.log(`[word-mnemonic] word=${normalizedWord}, forceRefresh=${forceRefresh}`)

    // 1. 先查本地缓存（除非强制刷新）
    const cache = getCacheDb()
    const cacheKey = `mnemonic:${normalizedWord}`
    if (cache && !forceRefresh) {
      const cached = cache.prepare(
        'SELECT result FROM word_context_cache WHERE cache_key = ?'
      ).get(cacheKey) as { result: string } | undefined

      if (cached) {
        console.log(`[Cache] 命中助记缓存: ${normalizedWord}`)
        res.json({ found: true, mnemonic: cached.result, cached: true })
        return
      }
    }

    // 2. 缓存未命中，调用LLM
    const effectiveApiKey = apiKey || process.env.LLM_API_KEY
    if (!effectiveApiKey) {
      res.status(400).json({ error: '未配置API Key，请先在设置中填写' })
      return
    }

    const systemPrompt = `你是一个记忆大师和英语老师。请为给定的英语单词提供生动、有趣、容易记住的助记方法。
要求：
1. 综合使用多种记忆法，如：谐音记忆、词根词缀分析、联想记忆、小故事顺口溜等。
2. 语言要幽默风趣，通俗易懂，特别适合记单词困难的学生。
3. 结构清晰，分点说明。
4. 直接返回助记内容的文本（支持Markdown格式），不要返回JSON。`

    const userPrompt = `请为单词 "${normalizedWord}" 生成助记内容。`

    const result = await callLLMAPI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { apiKey: effectiveApiKey, apiUrl, model, timeoutMs: 20000 }
    )

    if (result) {
      // 3. 保存到缓存
      if (cache) {
        try {
          cache.prepare(
            'INSERT OR REPLACE INTO word_context_cache (cache_key, word, result, created_at) VALUES (?, ?, ?, ?)'
          ).run(cacheKey, normalizedWord, result, Date.now())
          console.log(`[Cache] 助记已缓存: ${normalizedWord}`)
        } catch (err) {
          console.warn(`[Cache] 缓存写入失败: ${err}`)
        }
      }

      res.json({ found: true, mnemonic: result, cached: false })
      return
    }

    res.json({ found: false, error: 'LLM未返回有效结果' })
  } catch (err) {
    console.error('助记生成错误:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : '助记生成失败' })
  }
})

// ==================== OCR 识别 ====================

app.post('/api/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请上传图片文件' })
      return
    }

    const JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
    const TOKEN = "9658a109a67edf61a60b83b282de50e44bbd05ba"
    const MODEL = "PaddleOCR-VL-1.6"

    const headers = {
      "Authorization": `bearer ${TOKEN}`
    }

    const optionalPayload = {
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useChartRecognition: false
    }

    const formData = new FormData()
    formData.append('model', MODEL)
    formData.append('optionalPayload', JSON.stringify(optionalPayload))
    
    const fileBuffer = fs.readFileSync(req.file.path)
    const blob = new Blob([fileBuffer], { type: req.file.mimetype })
    formData.append('file', blob, req.file.originalname)

    console.log(`[OCR] 提交任务: ${req.file.originalname}`)
    const jobResponse = await fetch(JOB_URL, {
      method: 'POST',
      headers,
      body: formData
    })

    if (!jobResponse.ok) {
      const text = await jobResponse.text()
      throw new Error(`提交任务失败: ${text}`)
    }

    const jobData = await jobResponse.json()
    const jobId = jobData.data.jobId
    console.log(`[OCR] 任务提交成功, jobId: ${jobId}`)

    // 轮询状态
    let jsonlUrl = ""
    while (true) {
      const statusResponse = await fetch(`${JOB_URL}/${jobId}`, { headers })
      if (!statusResponse.ok) throw new Error('查询状态失败')
      
      const statusData = await statusResponse.json()
      const state = statusData.data.state
      
      if (state === 'done') {
        jsonlUrl = statusData.data.resultUrl.jsonUrl
        console.log(`[OCR] 任务完成`)
        break
      } else if (state === 'failed') {
        throw new Error(`任务失败: ${statusData.data.errorMsg}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    // 获取结果
    const jsonlResponse = await fetch(jsonlUrl)
    if (!jsonlResponse.ok) throw new Error('获取结果失败')
    
    const jsonlText = await jsonlResponse.text()
    const lines = jsonlText.trim().split('\n')
    
    let markdownText = ""
    for (const line of lines) {
      if (!line.trim()) continue
      const result = JSON.parse(line).result
      for (const res of result.layoutParsingResults) {
        markdownText += res.markdown.text + "\n\n"
      }
    }

    // 过滤 Markdown 字符
    const plainText = markdownText
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // 粗体
      .replace(/(\*|_)(.*?)\1/g, '$2') // 斜体
      .replace(/~~(.*?)~~/g, '$1') // 删除线
      .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // 代码块
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 链接
      .replace(/^#+\s+(.*)$/gm, '$1') // 标题
      .replace(/^\s*[-*+]\s+(.*)$/gm, '$1') // 无序列表
      .replace(/^\s*\d+\.\s+(.*)$/gm, '$1') // 有序列表
      .replace(/^\s*>\s+(.*)$/gm, '$1') // 引用
      .trim()

    // 清理上传的文件
    fs.unlinkSync(req.file.path)

    res.json({ text: plainText })
  } catch (err) {
    console.error('OCR 错误:', err)
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'OCR 识别失败' })
  }
})

// ==================== 启动 ====================
app.listen(PORT, () => {
  console.log(`英语应试助手后端服务已启动`)
  console.log(`  地址: http://localhost:${PORT}`)
  console.log(`  API文档: http://localhost:${PORT}/`)
})