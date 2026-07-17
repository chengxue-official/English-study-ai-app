import initSqlJs, { Database } from 'sql.js'
import localforage from 'localforage'
import { Capacitor } from '@capacitor/core'

// 词典条目接口
export interface DictEntry {
  word: string
  phonetic: string
  definition: string
  translation: string
  pos: string
  collins: number
  oxford: number
  tags: string[]
  bnc: number | null
  frq: number | null
  exchange: Record<string, string[]>
  searchedForm?: string
  source?: string
  speakUrl?: string
}

class DatabaseService {
  private dictDb: Database | null = null
  private cacheDb: Database | null = null
  private SQL: any = null
  private isInitializing = false
  private initPromise: Promise<void> | null = null

  constructor() {
    // 配置 localforage
    localforage.config({
      name: 'english-exam-app',
      storeName: 'database'
    })
  }

  /**
   * 初始化数据库服务
   */
  public async init(): Promise<void> {
    if (this.initPromise) {
      try {
        await this.initPromise
        return
      } catch (e) {
        console.warn('[DatabaseService] 之前的初始化失败，尝试重新初始化...')
        this.initPromise = null
      }
    }

    this.initPromise = (async () => {
      if (this.isInitializing) return
      this.isInitializing = true

      try {
        console.log('[DatabaseService] 开始初始化 sql.js...')
        const platform = Capacitor.getPlatform()
        console.log(`[DatabaseService] 当前环境: ${platform}, URL: ${window.location.href}`)
        
        // 1. 尝试多个路径加载 WASM
        const wasmPaths = [
          '/sql-wasm.wasm',
          'https://sql.js.org/dist/sql-wasm.wasm', // 官方 CDN 备选
          'https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/sql-wasm.wasm' // jsDelivr 备选
        ]
        
        let wasmBinary: ArrayBuffer | undefined
        for (const path of wasmPaths) {
          try {
            console.log(`[DatabaseService] 尝试从路径加载 WASM: ${path}`)
            const wasmRes = await fetch(path)
            if (wasmRes.ok) {
              wasmBinary = await wasmRes.arrayBuffer()
              console.log(`[DatabaseService] WASM 加载成功: ${path}, 大小: ${wasmBinary.byteLength}`)
              break // 加载成功，跳出循环
            }
          } catch (e) {
            console.warn(`[DatabaseService] 路径 ${path} 加载失败，尝试下一个...`)
          }
        }

        if (!wasmBinary) {
          throw new Error('无法加载 SQL.js WASM 引擎，请检查网络连接或确保 sql-wasm.wasm 已放置在 public 目录')
        }

        // 初始化 sql.js
        this.SQL = await initSqlJs({
          wasmBinary,
          locateFile: (file) => {
            if (file.endsWith('.wasm')) return '/sql-wasm.wasm'
            return file 
          }
        })
        
        if (!this.SQL) {
          throw new Error('sql.js 初始化返回为空')
        }
        console.log('[DatabaseService] sql.js 初始化成功')

        // 2. 加载或创建用户缓存数据库 (cache.db)
        await this.initCacheDb()

        // 3. 尝试加载词典数据库 (stardict.db)
        await this.initDictDb()

        console.log('[DatabaseService] 初始化完成')
      } catch (err: any) {
        console.error('[DatabaseService] 初始化失败:', err)
        this.initPromise = null // 允许下次重试
        throw err
      } finally {
        this.isInitializing = false
      }
    })()

    return this.initPromise
  }

  /**
   * 辅助方法：确保数据为 Uint8Array
   */
  private async ensureUint8Array(data: any): Promise<Uint8Array> {
    if (!data) throw new Error('数据为空')
    if (data instanceof Uint8Array) return data
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    if (data instanceof Blob) {
      return new Uint8Array(await data.arrayBuffer())
    }
    // 某些环境下 localforage 可能会返回普通数组
    if (Array.isArray(data)) return new Uint8Array(data)
    throw new Error(`不支持的数据类型: ${typeof data}`)
  }

  /**
   * 辅助方法：检查是否为有效的 SQLite 数据库
   */
  private isSqlite(data: Uint8Array): boolean {
    if (data.length < 16) return false
    const header = String.fromCharCode(...data.slice(0, 15))
    return header.startsWith('SQLite format 3')
  }

  /**
   * 初始化缓存/用户数据数据库
   */
  private async initCacheDb(): Promise<void> {
    try {
      const rawData = await localforage.getItem('cache.db')
      if (rawData) {
        const savedDb = await this.ensureUint8Array(rawData)
        if (this.isSqlite(savedDb)) {
          this.cacheDb = new this.SQL.Database(savedDb)
          console.log('[DatabaseService] 已从 localforage 加载 cache.db')
        } else {
          console.warn('[DatabaseService] 缓存的 cache.db 格式不正确，创建新的')
          this.cacheDb = new this.SQL.Database()
        }
      } else {
        this.cacheDb = new this.SQL.Database()
        console.log('[DatabaseService] 创建全新的 cache.db')
      }

      // 创建表结构
      this.cacheDb!.run(`
        CREATE TABLE IF NOT EXISTS word_usage (
          word TEXT PRIMARY KEY,
          collocations TEXT,
          phrases TEXT,
          usage TEXT,
          created_at INTEGER
        )
      `)

      this.cacheDb!.run(`
        CREATE TABLE IF NOT EXISTS sentence_analysis (
          sentence_hash TEXT PRIMARY KEY,
          sentence TEXT,
          analysis TEXT,
          created_at INTEGER
        )
      `)

      this.cacheDb!.run(`
        CREATE TABLE IF NOT EXISTS word_context_cache (
          cache_key TEXT PRIMARY KEY,
          word TEXT,
          result TEXT,
          created_at INTEGER
        )
      `)

      this.cacheDb!.run(`
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

      this.cacheDb!.run(`CREATE INDEX IF NOT EXISTS idx_collection_type ON collection(type)`)

      // 保存一次以确保表结构持久化
      await this.saveCacheDb()
    } catch (err) {
      console.error('[DatabaseService] 初始化 cache.db 失败:', err)
      throw err
    }
  }

  /**
   * 保存缓存数据库到 localforage
   */
  private async saveCacheDb(): Promise<void> {
    if (!this.cacheDb) return
    try {
      const data = this.cacheDb.export()
      await localforage.setItem('cache.db', data)
    } catch (err) {
      console.error('[DatabaseService] 保存 cache.db 失败:', err)
    }
  }

  /**
   * 初始化词典数据库
   */
  private async initDictDb(): Promise<void> {
    try {
      // 检查本地 localforage 是否缓存了 stardict.db
      const rawCached = await localforage.getItem('stardict.db')
      if (rawCached) {
        const cachedDict = await this.ensureUint8Array(rawCached)
        if (this.isSqlite(cachedDict)) {
          console.log(`[DatabaseService] 从缓存加载词典, 大小: ${cachedDict.length} bytes`)
          this.dictDb = new this.SQL.Database(cachedDict)
          console.log('[DatabaseService] 已从 localforage 加载 stardict.db')
          return
        } else {
          console.warn('[DatabaseService] 缓存的 stardict.db 格式不正确，尝试重新下载')
          await localforage.removeItem('stardict.db')
        }
      }

      // 如果没有缓存，尝试从 public 目录加载
      const dictUrl = '/stardict.db'
      console.log(`[DatabaseService] 尝试从网络/本地资源加载词典: ${dictUrl}`)
      const res = await fetch(dictUrl)
      
      if (res.ok) {
        const buffer = await res.arrayBuffer()
        const data = new Uint8Array(buffer)
        
        if (this.isSqlite(data)) {
          console.log(`[DatabaseService] 词典下载完成, 大小: ${data.length} bytes`)
          this.dictDb = new this.SQL.Database(data)
          // 异步保存到 localforage
          localforage.setItem('stardict.db', data).catch(err => {
            console.warn('[DatabaseService] 缓存 stardict.db 失败:', err)
          })
          console.log('[DatabaseService] 已从资源目录加载并缓存 stardict.db')
        } else {
          console.warn('[DatabaseService] 下载的文件不是有效的 SQLite 数据库 (可能是 SPA 路由返回的 index.html)')
        }
      } else {
        console.warn(`[DatabaseService] 未找到 stardict.db: ${res.status} ${res.statusText}`)
      }
    } catch (err) {
      console.error('[DatabaseService] 加载 stardict.db 过程中发生错误:', err)
    }
  }

  /**
   * 手动导入词典数据库
   */
  public async importDictDb(data: Uint8Array): Promise<void> {
    await this.init()
    if (!this.SQL) throw new Error('SQL.js 未初始化')
    
    const validData = await this.ensureUint8Array(data)
    if (!this.isSqlite(validData)) {
      throw new Error('导入的文件不是有效的 SQLite 数据库格式')
    }

    if (this.dictDb) {
      this.dictDb.close()
    }
    this.dictDb = new this.SQL.Database(validData)
    await localforage.setItem('stardict.db', validData)
    console.log('[DatabaseService] 成功导入并缓存 stardict.db')
  }

  /**
   * 检查词典是否已加载
   */
  public isDictLoaded(): boolean {
    return !!this.dictDb
  }

  /**
   * 查询单词
   */
  public async queryWord(word: string): Promise<{ found: boolean; data?: DictEntry; word: string }> {
    await this.init()
    if (!this.dictDb) {
      return { found: false, word }
    }

    const cleaned = word.toLowerCase().trim()
    if (!cleaned) return { found: false, word }

    // 1. 精确查询
    let stmt = this.dictDb.prepare(
      'SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange FROM stardict WHERE word = ?'
    )
    stmt.bind([cleaned])
    
    if (stmt.step()) {
      const row = stmt.getAsObject() as any
      stmt.free()
      return { found: true, data: this.formatDictEntry(row), word: cleaned }
    }
    stmt.free()

    // 2. 模糊查询：尝试查找词的原型（如 running -> run）
    stmt = this.dictDb.prepare(
      'SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange FROM stardict WHERE exchange LIKE ? LIMIT 5'
    )
    stmt.bind([`%${cleaned}%`])

    const fuzzyRows: any[] = []
    while (stmt.step()) {
      fuzzyRows.push(stmt.getAsObject())
    }
    stmt.free()

    if (fuzzyRows.length > 0) {
      for (const row of fuzzyRows) {
        const exchangeParts = (row.exchange || '').split('/')
        for (const part of exchangeParts) {
          const [, value] = part.split(':')
          if (value && value.toLowerCase() === cleaned) {
            return { found: true, data: { ...this.formatDictEntry(row), searchedForm: cleaned }, word: cleaned }
          }
        }
      }
    }

    return { found: false, word: cleaned }
  }

  /**
   * 格式化词典条目
   */
  private formatDictEntry(row: any): DictEntry {
    const exchangeMap: Record<string, string[]> = {}
    if (row.exchange) {
      for (const part of row.exchange.split('/')) {
        const colonIdx = part.indexOf(':')
        if (colonIdx === -1) continue
        const type = part.slice(0, colonIdx)
        const value = part.slice(colonIdx + 1)
        if (!type || !value) continue

        if (type === '0' || type === '1') continue
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

    const tags = row.tag ? row.tag.split(/[\s/]+/).filter(Boolean) : []
    const phonetic = this.normalizePhonetic(row.phonetic)

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
   * 音标规范化
   */
  private normalizePhonetic(phonetic: string | null): string {
    if (!phonetic || phonetic.trim() === '') return ''
    let ipa = phonetic.trim()
    const replacements: [string, string][] = [
      ["'", 'ˈ'],
      [',', 'ˌ'],
      [':', 'ː'],
      ['ә', 'ə'],
      ['A', 'eɪ'],
      ['E', 'iː'],
      ['I', 'aɪ'],
      ['U', 'uː'],
      ['O', 'əʊ'],
    ]
    for (const [from, to] of replacements) {
      ipa = ipa.split(from).join(to)
    }
    return `/${ipa}/`
  }

  // ==================== 缓存与用户数据操作 ====================

  /**
   * 获取单词用法缓存
   */
  public async getWordUsage(word: string): Promise<any | null> {
    await this.init()
    if (!this.cacheDb) return null

    const stmt = this.cacheDb!.prepare('SELECT collocations, phrases, usage FROM word_usage WHERE word = ?')
    stmt.bind([word.toLowerCase().trim()])
    if (stmt.step()) {
      const row = stmt.getAsObject() as any
      stmt.free()
      return {
        collocations: JSON.parse(row.collocations || '[]'),
        phrases: JSON.parse(row.phrases || '[]'),
        usage: JSON.parse(row.usage || '[]'),
      }
    }
    stmt.free()
    return null
  }

  /**
   * 保存单词用法缓存
   */
  public async saveWordUsage(word: string, data: { collocations: any[]; phrases: any[]; usage: any[] }): Promise<void> {
    await this.init()
    if (!this.cacheDb) return

    this.cacheDb!.run(
      'INSERT OR REPLACE INTO word_usage (word, collocations, phrases, usage, created_at) VALUES (?, ?, ?, ?, ?)',
      [
        word.toLowerCase().trim(),
        JSON.stringify(data.collocations),
        JSON.stringify(data.phrases),
        JSON.stringify(data.usage),
        Date.now()
      ]
    )
    await this.saveCacheDb()
  }

  /**
   * 获取上下文释义缓存
   */
  public async getWordContext(cacheKey: string): Promise<any | null> {
    await this.init()
    if (!this.cacheDb) return null

    const stmt = this.cacheDb!.prepare('SELECT result FROM word_context_cache WHERE cache_key = ?')
    stmt.bind([cacheKey])
    if (stmt.step()) {
      const row = stmt.getAsObject() as any
      stmt.free()
      return JSON.parse(row.result)
    }
    stmt.free()
    return null
  }

  /**
   * 保存上下文释义缓存
   */
  public async saveWordContext(cacheKey: string, word: string, result: any): Promise<void> {
    await this.init()
    if (!this.cacheDb) return

    this.cacheDb!.run(
      'INSERT OR REPLACE INTO word_context_cache (cache_key, word, result, created_at) VALUES (?, ?, ?, ?)',
      [cacheKey, word.toLowerCase().trim(), JSON.stringify(result), Date.now()]
    )
    await this.saveCacheDb()
  }

  /**
   * 获取句子分析缓存
   */
  public async getSentenceAnalysis(sentenceHash: string): Promise<any | null> {
    await this.init()
    if (!this.cacheDb) return null

    const stmt = this.cacheDb!.prepare('SELECT analysis FROM sentence_analysis WHERE sentence_hash = ?')
    stmt.bind([sentenceHash])
    if (stmt.step()) {
      const row = stmt.getAsObject() as any
      stmt.free()
      return JSON.parse(row.analysis)
    }
    stmt.free()
    return null
  }

  /**
   * 保存句子分析缓存
   */
  public async saveSentenceAnalysis(sentenceHash: string, sentence: string, analysis: any): Promise<void> {
    await this.init()
    if (!this.cacheDb) return

    this.cacheDb!.run(
      'INSERT OR REPLACE INTO sentence_analysis (sentence_hash, sentence, analysis, created_at) VALUES (?, ?, ?, ?)',
      [sentenceHash, sentence, JSON.stringify(analysis), Date.now()]
    )
    await this.saveCacheDb()
  }

  /**
   * 删除句子分析缓存
   */
  public async deleteSentenceAnalysis(sentenceHash: string): Promise<void> {
    await this.init()
    if (!this.cacheDb) return

    this.cacheDb!.run('DELETE FROM sentence_analysis WHERE sentence_hash = ?', [sentenceHash])
    await this.saveCacheDb()
  }

  /**
   * 扫描词组 (本地匹配)
   */
  public async scanPhrases(text: string): Promise<any[]> {
    await this.init()
    if (!this.dictDb) return []

    const cleanText = text.replace(/[^a-zA-Z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
    const words = cleanText.split(' ').filter(w => w.length > 0)
    const foundPhrases: any[] = []
    const matchedSet = new Set<string>()

    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join(' ').toLowerCase()
        const overlap = foundPhrases.some(p => i >= p.startIndex && i < p.endIndex)
        if (overlap) continue
        if (matchedSet.has(ngram)) continue

        const stmt = this.dictDb.prepare('SELECT word, translation FROM stardict WHERE word = ?')
        stmt.bind([ngram])
        if (stmt.step()) {
          const row = stmt.getAsObject() as any
          if (row.translation && /[\u4e00-\u9fff]/.test(row.translation)) {
            // 2词组合实词过滤
            if (n === 2) {
              const contentWords = words.slice(i, i + n).filter(
                w => !/^(a|an|the|to|of|in|on|at|for|with|by|from|as|is|am|are|was|were|be|been|being|do|does|did|have|has|had|it|he|she|we|they|this|that|these|those|and|but|or|so|if|not|no|up|out|off)$/i.test(w)
              )
              if (contentWords.length < 2) {
                stmt.free()
                continue
              }
            }

            matchedSet.add(ngram)
            foundPhrases.push({
              phrase: row.word,
              translation: row.translation.split('\n')[0].substring(0, 100),
              startIndex: i,
              endIndex: i + n,
              words: words.slice(i, i + n),
            })
          }
        }
        stmt.free()
      }
    }

    foundPhrases.sort((a, b) => a.startIndex - b.startIndex)
    return foundPhrases
  }

  // ==================== 收藏本 CRUD ====================

  /**
   * 获取收藏列表
   */
  public async getCollectionItems(params: {
    page: number
    pageSize: number
    type?: string
    tag?: string
    search?: string
    dueReview?: boolean
  }): Promise<{ items: any[]; total: number }> {
    await this.init()
    if (!this.cacheDb) return { items: [], total: 0 }

    let query = 'SELECT * FROM collection WHERE 1=1'
    const args: any[] = []

    if (params.type && params.type !== 'all') {
      query += ' AND type = ?'
      args.push(params.type)
    }
    if (params.tag) {
      query += ' AND tags LIKE ?'
      args.push(`%"${params.tag}"%`)
    }
    if (params.search) {
      query += ' AND (content LIKE ? OR meaning LIKE ?)'
      args.push(`%${params.search}%`, `%${params.search}%`)
    }
    if (params.dueReview) {
      query += ' AND (next_review_at IS NULL OR next_review_at <= ?)'
      args.push(Date.now())
    }

    // 获取总数
    let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count')
    let stmt = this.cacheDb!.prepare(countQuery)
    stmt.bind(args)
    let total = 0
    if (stmt.step()) {
      total = (stmt.getAsObject() as any).count
    }
    stmt.free()

    // 分页查询
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    const limit = params.pageSize
    const offset = (params.page - 1) * params.pageSize
    stmt = this.cacheDb!.prepare(query)
    stmt.bind([...args, limit, offset])

    const items: any[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as any
      items.push({
        id: row.id,
        type: row.type,
        content: row.content,
        meaning: row.meaning,
        sourceSentence: row.source_sentence,
        sourceTranslation: row.source_translation,
        tags: row.tags ? JSON.parse(row.tags) : [],
        phonetic: row.phonetic,
        extra: row.extra ? JSON.parse(row.extra) : null,
        createdAt: row.created_at,
        reviewCount: row.review_count,
        lastReviewAt: row.last_review_at,
        nextReviewAt: row.next_review_at,
      })
    }
    stmt.free()

    return { items, total }
  }

  /**
   * 添加收藏
   */
  public async addCollection(item: {
    type: string
    content: string
    meaning?: string
    sourceSentence?: string
    sourceTranslation?: string
    tags?: string[]
    phonetic?: string
    extra?: any
  }): Promise<{ id: number; createdAt: number }> {
    await this.init()
    if (!this.cacheDb) throw new Error('数据库未加载')

    const createdAt = Date.now()
    this.cacheDb!.run(
      `INSERT INTO collection (type, content, meaning, source_sentence, source_translation, tags, phonetic, extra, created_at, review_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        item.type,
        item.content,
        item.meaning || null,
        item.sourceSentence || null,
        item.sourceTranslation || null,
        item.tags ? JSON.stringify(item.tags) : '[]',
        item.phonetic || null,
        item.extra ? JSON.stringify(item.extra) : null,
        createdAt
      ]
    )
    await this.saveCacheDb()

    // 获取自增ID
    const stmt = this.cacheDb!.prepare('SELECT last_insert_rowid() as id')
    stmt.step()
    const id = (stmt.getAsObject() as any).id
    stmt.free()

    return { id, createdAt }
  }

  /**
   * 移除收藏
   */
  public async removeCollection(id: number): Promise<void> {
    await this.init()
    if (!this.cacheDb) return

    this.cacheDb!.run('DELETE FROM collection WHERE id = ?', [id])
    await this.saveCacheDb()
  }

  /**
   * 检查是否已收藏
   */
  public async checkCollected(type: string, content: string): Promise<boolean> {
    await this.init()
    if (!this.cacheDb) return false

    const stmt = this.cacheDb!.prepare('SELECT id FROM collection WHERE type = ? AND content = ?')
    stmt.bind([type, content])
    const collected = stmt.step()
    stmt.free()
    return collected
  }

  /**
   * 获取收藏统计
   */
  public async getCollectionStats(): Promise<{ total: number; byType: Record<string, number> }> {
    await this.init()
    if (!this.cacheDb) return { total: 0, byType: {} }

    const stats = { total: 0, byType: {} as Record<string, number> }
    
    let stmt = this.cacheDb!.prepare('SELECT COUNT(*) as count FROM collection')
    if (stmt.step()) {
      stats.total = (stmt.getAsObject() as any).count
    }
    stmt.free()

    stmt = this.cacheDb!.prepare('SELECT type, COUNT(*) as count FROM collection GROUP BY type')
    while (stmt.step()) {
      const row = stmt.getAsObject() as any
      stats.byType[row.type] = row.count
    }
    stmt.free()

    return stats
  }

  /**
   * 更新复习进度 (艾宾浩斯记忆曲线)
   */
  public async updateReview(id: number, known: boolean): Promise<{ success: boolean; nextReviewAt?: number; days?: number }> {
    await this.init()
    if (!this.cacheDb) return { success: false }

    const stmt = this.cacheDb!.prepare('SELECT review_count FROM collection WHERE id = ?')
    stmt.bind([id])
    if (!stmt.step()) {
      stmt.free()
      return { success: false }
    }
    const row = stmt.getAsObject() as any
    stmt.free()

    let reviewCount = row.review_count || 0
    let days = 1

    if (known) {
      reviewCount += 1
      // 艾宾浩斯复习间隔天数: 1, 2, 4, 7, 15, 30
      const intervals = [1, 2, 4, 7, 15, 30]
      days = intervals[Math.min(reviewCount - 1, intervals.length - 1)]
    } else {
      // 不认识，重置复习次数，间隔设为1天
      reviewCount = 0
      days = 1
    }

    const nextReviewAt = Date.now() + days * 24 * 60 * 60 * 1000
    this.cacheDb!.run(
      'UPDATE collection SET review_count = ?, last_review_at = ?, next_review_at = ? WHERE id = ?',
      [reviewCount, Date.now(), nextReviewAt, id]
    )
    await this.saveCacheDb()

    return { success: true, nextReviewAt, days }
  }

  /**
   * 提前复习
   */
  public async advanceReview(id: number): Promise<boolean> {
    await this.init()
    if (!this.cacheDb) return false

    this.cacheDb!.run(
      'UPDATE collection SET next_review_at = ? WHERE id = ?',
      [Date.now(), id]
    )
    await this.saveCacheDb()
    return true
  }
}

export const dbService = new DatabaseService()