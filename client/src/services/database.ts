import localforage from 'localforage'
import { downloadToOPFS } from './opfs'
import { nativeDb } from './nativeDb'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

export interface DictEntry {
// ... (rest of the interface)
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
  ukphone?: string
  usphone?: string
  ukspeech?: string
  usspeech?: string
  sentences?: { en: string; zh: string }[]
  synonyms?: { pos: string; tran: string; words: string[] }[]
  phrases?: { en: string; zh: string }[]
}

class DatabaseService {
  private worker: Worker | null = null
  private messageId = 0
  private resolves: Map<number, { resolve: Function; reject: Function }> = new Map()
  private isInitializing = false
  private initPromise: Promise<void> | null = null
  private dictLoaded = false

  constructor() {
    localforage.config({
      name: 'english-exam-app',
      storeName: 'database'
    })
  }

  /**
   * 向 Worker 发送消息并等待响应
   */
  public async sendMessage(type: string, payload?: any): Promise<any> {
    if (Capacitor.isNativePlatform()) {
      // 原生平台不使用 Worker 消息机制，而是直接调用 nativeDb
      // 这里为了兼容性，我们可以把一些通用的消息映射到 nativeDb 的方法
      switch (type) {
        case 'check_dict_exists':
          // 先检查是否已加载，如果没加载则尝试加载（这会触发自动迁移）
          if (await nativeDb.isDictLoaded()) return true;
          return await nativeDb.tryLoadDict();
        case 'query_dict':
          return await nativeDb.query('dict', payload.sql, payload.bind);
        case 'query_cache':
          return await nativeDb.query('cache', payload.sql, payload.bind);
        case 'exec_cache':
          return await nativeDb.execute('cache', payload.sql, payload.bind);
        case 'exec_cache_get_id':
          return await nativeDb.executeGetId('cache', payload.sql, payload.bind);
        case 'reload_dict':
          return await nativeDb.tryLoadDict();
        case 'import_dict':
          await nativeDb.importDatabase('stardict', new Uint8Array(payload.buffer));
          return true;
        default:
          throw new Error(`Unsupported message type on native: ${type}`);
      }
    }

    await this.init()
    if (!this.worker) throw new Error('Worker not initialized')
    return new Promise((resolve, reject) => {
      const id = ++this.messageId
      this.resolves.set(id, { resolve, reject })
      this.worker!.postMessage({ id, type, payload })
    })
  }

  public async init(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      if (this.initPromise) return this.initPromise;
      this.initPromise = (async () => {
        await nativeDb.init();
        this.dictLoaded = await nativeDb.isDictLoaded();
      })();
      return this.initPromise;
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      if (this.isInitializing) return
      this.isInitializing = true

      try {
        console.log('[DatabaseService] Initializing worker...')
        // 确保 URL 正确，Vite 会处理这个 URL
        this.worker = new Worker(new URL('./dbWorker.ts', import.meta.url), { type: 'module' })
        
        this.worker.onmessage = (e) => {
          const { id, type, result, error } = e.data
          
          // 处理初始化相关的消息
          if (type === 'init_success') {
            console.log('[DatabaseService] Worker reported init_success')
            return
          }
          if (type === 'init_error') {
            console.error('[DatabaseService] Worker reported init_error:', error)
            return
          }
          
          // 处理查询响应
          if (id && this.resolves.has(id)) {
            const { resolve, reject } = this.resolves.get(id)!
            this.resolves.delete(id)
            if (error) reject(new Error(error))
            else resolve(result)
          }
        }

        this.worker.onerror = (err) => {
          console.error('[DatabaseService] Worker error:', err)
        }

        // 等待 Worker 初始化完成，增加超时处理
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.worker?.removeEventListener('message', handler)
            reject(new Error('Worker initialization timeout (15s)'))
          }, 15000)

          const handler = (e: MessageEvent) => {
            if (e.data.type === 'init_success') {
              clearTimeout(timeout)
              this.worker!.removeEventListener('message', handler)
              resolve()
            } else if (e.data.type === 'init_error') {
              clearTimeout(timeout)
              this.worker!.removeEventListener('message', handler)
              reject(new Error(e.data.error))
            }
          }
          this.worker!.addEventListener('message', handler)
          this.worker!.postMessage({ type: 'init' })
        })

        console.log('[DatabaseService] Worker initialized, checking dict...')

        // 检查词典是否存在 - 使用直接 postMessage 避免 sendMessage 递归调用 init
        this.dictLoaded = await new Promise<boolean>((resolve, reject) => {
          const id = ++this.messageId
          console.log(`[DatabaseService] Sending check_dict_exists (id: ${id})`)
          this.resolves.set(id, { 
            resolve: (res: boolean) => {
              console.log(`[DatabaseService] check_dict_exists resolved: ${res}`)
              resolve(res)
            }, 
            reject: (err: any) => {
              console.error(`[DatabaseService] check_dict_exists rejected:`, err)
              reject(err)
            } 
          })
          this.worker!.postMessage({ id, type: 'check_dict_exists' })
          
          // 为这个特定检查也增加超时
          setTimeout(() => {
            if (this.resolves.has(id)) {
              console.warn(`[DatabaseService] check_dict_exists timeout (id: ${id})`)
              this.resolves.delete(id)
              reject(new Error('check_dict_exists timeout'))
            }
          }, 5000)
        })
        
        console.log('[DatabaseService] Dict loaded status:', this.dictLoaded)

      } catch (err) {
        console.error('[DatabaseService] Init failed:', err)
        this.initPromise = null // 允许重试
        throw err
      } finally {
        this.isInitializing = false
      }
    })()

    return this.initPromise
  }

  /**
   * 检查当前环境是否支持 OPFS
   */
  public async isOpfsSupported(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) return true; // 原生平台我们认为总是支持（通过原生 SQLite）
    return typeof navigator !== 'undefined' && !!navigator.storage && !!navigator.storage.getDirectory
  }

  public async loadDictFromPublic(): Promise<void> {
    await this.init()
    
    if (this.dictLoaded) return

    try {
      console.log('[DatabaseService] Downloading dict...')
      
      const success = await downloadToOPFS('/stardict_full.db', 'stardict.db', (progress) => {
        console.log(`[DatabaseService] Download progress: ${(progress * 100).toFixed(1)}%`)
      })
      
      if (success) {
        if (Capacitor.isNativePlatform()) {
          // 在原生平台上，downloadToOPFS 已经将文件写入了 Directory.Data
          // 我们只需要触发加载（这会触发自动迁移）
          await nativeDb.tryLoadDict()
        } else {
          await this.sendMessage('reload_dict')
        }
        this.dictLoaded = await this.sendMessage('check_dict_exists')
        console.log('[DatabaseService] Dict loaded:', this.dictLoaded)
      } else {
        throw new Error('Failed to download dict')
      }
    } catch (e) {
      console.error('[DatabaseService] loadDictFromPublic failed:', e)
      throw e
    }
  }

  public async importDictDb(data: Uint8Array): Promise<void> {
    await this.init()
    console.log(`[DatabaseService] Importing dict, size: ${data.length} bytes, platform: ${Capacitor.getPlatform()}`)
    if (Capacitor.isNativePlatform()) {
      try {
        await nativeDb.importDatabase('stardict', data)
      } catch (e: any) {
        console.error('[DatabaseService] Native import failed:', e)
        throw new Error(`原生导入失败: ${e.message || '未知错误'}`)
      }
    } else {
      await this.sendMessage('import_dict', { buffer: data.buffer })
    }
    this.dictLoaded = await this.sendMessage('check_dict_exists')
    console.log(`[DatabaseService] Import finished, dictLoaded: ${this.dictLoaded}`)
  }

  /**
   * 内存安全地导入词典文件 (Blob/File)
   */
  public async importDictFile(file: Blob, onProgress?: (prog: number) => void): Promise<void> {
    await this.init()
    console.log(`[DatabaseService] Importing dict file, size: ${file.size} bytes, platform: ${Capacitor.getPlatform()}`)
    if (Capacitor.isNativePlatform()) {
      try {
        await nativeDb.importDatabaseFromBlob('stardict', file, onProgress)
      } catch (e: any) {
        console.error('[DatabaseService] Native file import failed:', e)
        throw new Error(`原生导入失败: ${e.message || '未知错误'}`)
      }
    } else {
      const buffer = await file.arrayBuffer()
      await this.sendMessage('import_dict', { buffer })
    }
    this.dictLoaded = await this.sendMessage('check_dict_exists')
    console.log(`[DatabaseService] File import finished, dictLoaded: ${this.dictLoaded}`)
  }

  public async getDictSize(): Promise<number> {
    try {
      if (Capacitor.isNativePlatform()) {
        // 优先尝试通过 PRAGMA 获取已加载数据库的大小
        const size = await nativeDb.getDatabaseSize('dict');
        if (size > 0) return size;

        // 如果没加载，尝试检查 files/ 目录下的临时文件
        try {
          const stat = await Filesystem.stat({
            path: 'stardict.db',
            directory: Directory.Data
          });
          return stat.size;
        } catch (e) {}
        return 0;
      }
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle('stardict.db')
      const file = await fileHandle.getFile()
      return file.size
    } catch (e) {
      return 0
    }
  }

  public isDictLoaded(): boolean {
    return this.dictLoaded
  }

  /**
   * 强制刷新词典加载状态
   */
  public async refreshStatus(): Promise<boolean> {
    await this.init()
    this.dictLoaded = await this.sendMessage('check_dict_exists')
    return this.dictLoaded
  }

  public async queryWord(word: string): Promise<{ found: boolean; data?: DictEntry; word: string }> {
    await this.init()
    if (!this.dictLoaded) return { found: false, word }

    const cleaned = word.toLowerCase().trim()
    if (!cleaned) return { found: false, word }

    const rows = await this.sendMessage('query_dict', {
      sql: 'SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange FROM stardict WHERE word = ?',
      bind: [cleaned]
    })

    if (rows.length > 0) {
      return { found: true, data: this.formatDictEntry(rows[0]), word: cleaned }
    }

    const fuzzyRows = await this.sendMessage('query_dict', {
      sql: 'SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange FROM stardict WHERE exchange LIKE ? LIMIT 5',
      bind: [`%${cleaned}%`]
    })

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

  private normalizePhonetic(phonetic: string | null): string {
    if (!phonetic || phonetic.trim() === '') return ''
    let ipa = phonetic.trim()
    const replacements: [string, string][] = [
      ["'", 'ˈ'], [',', 'ˌ'], [':', 'ː'], ['ә', 'ə'],
      ['A', 'eɪ'], ['E', 'iː'], ['I', 'aɪ'], ['U', 'uː'], ['O', 'əʊ'],
    ]
    for (const [from, to] of replacements) {
      ipa = ipa.split(from).join(to)
    }
    return `/${ipa}/`
  }

  public async getWordUsage(word: string): Promise<any | null> {
    await this.init()
    const rows = await this.sendMessage('query_cache', {
      sql: 'SELECT collocations, phrases, usage FROM word_usage WHERE word = ?',
      bind: [word.toLowerCase().trim()]
    })
    if (rows.length > 0) {
      return {
        collocations: JSON.parse(rows[0].collocations || '[]'),
        phrases: JSON.parse(rows[0].phrases || '[]'),
        usage: JSON.parse(rows[0].usage || '[]'),
      }
    }
    return null
  }

  public async saveWordUsage(word: string, data: { collocations: any[]; phrases: any[]; usage: any[] }): Promise<void> {
    await this.init()
    await this.sendMessage('exec_cache', {
      sql: 'INSERT OR REPLACE INTO word_usage (word, collocations, phrases, usage, created_at) VALUES (?, ?, ?, ?, ?)',
      bind: [word.toLowerCase().trim(), JSON.stringify(data.collocations), JSON.stringify(data.phrases), JSON.stringify(data.usage), Date.now()]
    })
  }

  public async getWordContext(cacheKey: string): Promise<any | null> {
    await this.init()
    const rows = await this.sendMessage('query_cache', {
      sql: 'SELECT result FROM word_context_cache WHERE cache_key = ?',
      bind: [cacheKey]
    })
    if (rows.length > 0) return JSON.parse(rows[0].result)
    return null
  }

  public async saveWordContext(cacheKey: string, word: string, result: any): Promise<void> {
    await this.init()
    await this.sendMessage('exec_cache', {
      sql: 'INSERT OR REPLACE INTO word_context_cache (cache_key, word, result, created_at) VALUES (?, ?, ?, ?)',
      bind: [cacheKey, word.toLowerCase().trim(), JSON.stringify(result), Date.now()]
    })
  }

  public async getSentenceAnalysis(sentenceHash: string): Promise<any | null> {
    await this.init()
    const rows = await this.sendMessage('query_cache', {
      sql: 'SELECT analysis FROM sentence_analysis WHERE sentence_hash = ?',
      bind: [sentenceHash]
    })
    if (rows.length > 0) return JSON.parse(rows[0].analysis)
    return null
  }

  public async saveSentenceAnalysis(sentenceHash: string, sentence: string, analysis: any, _skipSave: boolean = false): Promise<void> {
    await this.init()
    await this.sendMessage('exec_cache', {
      sql: 'INSERT OR REPLACE INTO sentence_analysis (sentence_hash, sentence, analysis, created_at) VALUES (?, ?, ?, ?)',
      bind: [sentenceHash, sentence, JSON.stringify(analysis), Date.now()]
    })
  }

  public async forceSaveCacheDb(): Promise<void> {
    // OPFS is auto-saved
  }

  public async deleteSentenceAnalysis(sentenceHash: string): Promise<void> {
    await this.init()
    await this.sendMessage('exec_cache', {
      sql: 'DELETE FROM sentence_analysis WHERE sentence_hash = ?',
      bind: [sentenceHash]
    })
  }

  public async scanPhrases(text: string): Promise<any[]> {
    await this.init()
    if (!this.dictLoaded) return []

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

        const rows = await this.sendMessage('query_dict', {
          sql: 'SELECT word, translation FROM stardict WHERE word = ?',
          bind: [ngram]
        })

        if (rows.length > 0) {
          const row = rows[0]
          if (row.translation && /[\u4e00-\u9fff]/.test(row.translation)) {
            if (n === 2) {
              const contentWords = words.slice(i, i + n).filter(
                w => !/^(a|an|the|to|of|in|on|at|for|with|by|from|as|is|am|are|was|were|be|been|being|do|does|did|have|has|had|it|he|she|we|they|this|that|these|those|and|but|or|so|if|not|no|up|out|off)$/i.test(w)
              )
              if (contentWords.length < 2) continue
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
      }
    }

    foundPhrases.sort((a, b) => a.startIndex - b.startIndex)
    return foundPhrases
  }

  public async getCollectionItems(params: {
    page: number
    pageSize: number
    type?: string
    tag?: string
    search?: string
    dueReview?: boolean
  }): Promise<{ items: any[]; total: number }> {
    await this.init()

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

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count')
    const countRows = await this.sendMessage('query_cache', { sql: countQuery, bind: args })
    const total = countRows.length > 0 ? countRows[0].count : 0

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    const limit = params.pageSize
    const offset = (params.page - 1) * params.pageSize
    const rows = await this.sendMessage('query_cache', { sql: query, bind: [...args, limit, offset] })

    const items = rows.map((row: any) => ({
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
    }))

    return { items, total }
  }

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
    const cleanedContent = item.content.toLowerCase().trim()

    const existingId = await this.checkCollected(item.type, cleanedContent)
    if (existingId !== null) {
      const rows = await this.sendMessage('query_cache', {
        sql: 'SELECT created_at FROM collection WHERE id = ?',
        bind: [existingId]
      })
      return { id: existingId, createdAt: rows.length > 0 ? rows[0].created_at : Date.now() }
    }

    const createdAt = Date.now()
    const id = await this.sendMessage('exec_cache_get_id', {
      sql: `INSERT INTO collection (type, content, meaning, source_sentence, source_translation, tags, phonetic, extra, created_at, review_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      bind: [
        item.type, cleanedContent, item.meaning || null, item.sourceSentence || null,
        item.sourceTranslation || null, item.tags ? JSON.stringify(item.tags) : '[]',
        item.phonetic || null, item.extra ? JSON.stringify(item.extra) : null, createdAt
      ]
    })

    return { id, createdAt }
  }

  public async removeCollection(id: number): Promise<void> {
    await this.init()
    await this.sendMessage('exec_cache', {
      sql: 'DELETE FROM collection WHERE id = ?',
      bind: [id]
    })
  }

  public async checkCollected(type: string, content: string): Promise<number | null> {
    await this.init()
    const cleanedContent = content.toLowerCase().trim()
    const rows = await this.sendMessage('query_cache', {
      sql: 'SELECT id FROM collection WHERE type = ? AND content = ?',
      bind: [type, cleanedContent]
    })
    return rows.length > 0 ? rows[0].id : null
  }

  public async getCollectionStats(): Promise<{ total: number; byType: Record<string, number> }> {
    await this.init()
    const stats = { total: 0, byType: {} as Record<string, number> }
    
    const totalRows = await this.sendMessage('query_cache', { sql: 'SELECT COUNT(*) as count FROM collection' })
    if (totalRows.length > 0) stats.total = totalRows[0].count

    const typeRows = await this.sendMessage('query_cache', { sql: 'SELECT type, COUNT(*) as count FROM collection GROUP BY type' })
    for (const row of typeRows) {
      stats.byType[row.type] = row.count
    }

    return stats
  }

  public async updateReview(id: number, known: boolean): Promise<{ success: boolean; nextReviewAt?: number; days?: number }> {
    await this.init()
    const rows = await this.sendMessage('query_cache', {
      sql: 'SELECT review_count FROM collection WHERE id = ?',
      bind: [id]
    })
    if (rows.length === 0) return { success: false }

    let reviewCount = rows[0].review_count || 0
    let days = 1

    if (known) {
      reviewCount += 1
      const intervals = [1, 2, 4, 7, 15, 30]
      days = intervals[Math.min(reviewCount - 1, intervals.length - 1)]
    } else {
      reviewCount = 0
      days = 1
    }

    const nextReviewAt = Date.now() + days * 24 * 60 * 60 * 1000
    await this.sendMessage('exec_cache', {
      sql: 'UPDATE collection SET review_count = ?, last_review_at = ?, next_review_at = ? WHERE id = ?',
      bind: [reviewCount, Date.now(), nextReviewAt, id]
    })

    return { success: true, nextReviewAt, days }
  }

  public async getReviewStats(): Promise<{ stage: number; count: number; label: string }[]> {
    await this.init()
    const stageLabels = ['新学习', '1天后', '2天后', '4天后', '7天后', '15后', '30天后']
    const statsMap: Record<number, number> = {}
    
    const rows = await this.sendMessage('query_cache', {
      sql: 'SELECT review_count, COUNT(*) as count FROM collection WHERE type = "word" GROUP BY review_count'
    })
    
    for (const row of rows) {
      const rc = row.review_count || 0
      const count = row.count || 0
      const stage = Math.min(rc, 6)
      statsMap[stage] = (statsMap[stage] || 0) + count
    }

    return stageLabels.map((label, stage) => ({
      stage,
      label,
      count: statsMap[stage] || 0
    }))
  }

  public async advanceReview(id: number): Promise<boolean> {
    await this.init()
    await this.sendMessage('exec_cache', {
      sql: 'UPDATE collection SET next_review_at = ? WHERE id = ?',
      bind: [Date.now(), id]
    })
    return true
  }
}

export const dbService = new DatabaseService()