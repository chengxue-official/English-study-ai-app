import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

let dictDb: any = null
let cacheDb: any = null
let sqlite3: any = null

/**
 * 检查是否为有效的 SQLite 数据库
 */
function isSqlite(data: Uint8Array): boolean {
  if (data.length < 16) return false
  const header = String.fromCharCode(...data.slice(0, 15))
  return header.startsWith('SQLite format 3')
}

/**
 * 从 OPFS 读取文件到内存 (用于不支持同步 VFS 的环境)
 */
async function readFileFromOpfs(filename: string): Promise<Uint8Array | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const fileHandle = await root.getFileHandle(filename)
    const file = await fileHandle.getFile()
    const buffer = await file.arrayBuffer()
    return new Uint8Array(buffer)
  } catch (e) {
    console.error(`[dbWorker] Failed to read ${filename} from OPFS:`, e)
    return null
  }
}

async function init() {
  try {
    console.log('[dbWorker] Loading sqlite3 module...')
    sqlite3 = await sqlite3InitModule()
    console.log('[dbWorker] sqlite3 loaded, version:', sqlite3.version.libVersion)
    console.log('[dbWorker] crossOriginIsolated:', self.crossOriginIsolated)
    console.log('[dbWorker] OPFS in sqlite3:', 'opfs' in sqlite3)
    
    if (sqlite3.capi) {
      console.log('[dbWorker] Checking available VFS...')
      const vfsList = ['opfs', 'memdb', 'unix-none', 'unix-dotfile']
      vfsList.forEach(vfs => {
        const found = sqlite3.capi.sqlite3_vfs_find(vfs)
        console.log(`[dbWorker] VFS '${vfs}' found:`, !!found)
      })
    }
    
    // 1. 初始化缓存数据库 (优先 OPFS)
    if ('opfs' in sqlite3) {
      cacheDb = new sqlite3.oo1.OpfsDb('/cache.db')
    } else {
      const hasOpfsVfs = sqlite3.capi && sqlite3.capi.sqlite3_vfs_find('opfs')
      if (hasOpfsVfs) {
        cacheDb = new sqlite3.oo1.DB({ filename: '/cache.db', vfs: 'opfs' })
      } else {
        console.warn('[dbWorker] OPFS not available for cacheDb, using memory (transient)')
        cacheDb = new sqlite3.oo1.DB('/cache.db', 'ct')
      }
    }

    // 2. 尝试初始化词典数据库
    await tryLoadDict()
    
    initCacheTables()
    postMessage({ type: 'init_success' })
  } catch (err: any) {
    console.error('[dbWorker] Init error:', err)
    postMessage({ type: 'init_error', error: err.message })
  }
}

async function tryLoadDict() {
  if (dictDb) {
    try { dictDb.close() } catch (e) {}
    dictDb = null
  }

  // 方案 A: 优先使用高性能 OPFS 同步接口
  if (sqlite3 && 'opfs' in sqlite3) {
    try {
      dictDb = new sqlite3.oo1.OpfsDb('/stardict.db')
      console.log('[dbWorker] Dict loaded via OpfsDb')
      return
    } catch (e) {
      console.warn('[dbWorker] OpfsDb failed, trying fallback...')
    }
  }

  // 方案 B: 尝试底层 OPFS VFS
  const hasOpfsVfs = sqlite3.capi && sqlite3.capi.sqlite3_vfs_find('opfs')
  if (hasOpfsVfs) {
    try {
      dictDb = new sqlite3.oo1.DB({ filename: '/stardict.db', vfs: 'opfs' })
      console.log('[dbWorker] Dict loaded via capi opfs vfs')
      return
    } catch (e) {
      console.warn('[dbWorker] Capi opfs vfs failed, trying memory fallback...')
    }
  }

  // 方案 C: 内存回退 (针对精简版或不支持 OPFS 同步的环境)
  console.log('[dbWorker] Attempting memory fallback for dict...')
  const data = await readFileFromOpfs('stardict.db')
  if (data) {
    // 检查大小，如果太大（比如 > 100MB）且没有 OPFS，可能会 OOM
    if (data.length > 100 * 1024 * 1024) {
      console.error('[dbWorker] File too large for memory fallback')
      return // 让 check_dict_exists 返回 false
    }
    
    try {
      const p = sqlite3.wasm.allocFromTypedArray(data)
      dictDb = new sqlite3.oo1.DB()
      const rc = sqlite3.capi.sqlite3_deserialize(
        dictDb.pointer, 'main', p, data.length, data.length,
        sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY
      )
      if (rc !== 0) throw new Error('sqlite3_deserialize failed')
      console.log('[dbWorker] Dict loaded into memory (fallback)')
    } catch (e) {
      console.error('[dbWorker] Memory fallback failed:', e)
    }
  }
}

function initCacheTables() {
  if (!cacheDb) return
  try {
    cacheDb.exec(`
      CREATE TABLE IF NOT EXISTS word_usage (
        word TEXT PRIMARY KEY,
        collocations TEXT,
        phrases TEXT,
        usage TEXT,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS sentence_analysis (
        sentence_hash TEXT PRIMARY KEY,
        sentence TEXT,
        analysis TEXT,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS word_context_cache (
        cache_key TEXT PRIMARY KEY,
        word TEXT,
        result TEXT,
        created_at INTEGER
      );
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
      );
      CREATE INDEX IF NOT EXISTS idx_collection_type ON collection(type);
    `)
  } catch (e) {
    console.error('[dbWorker] Failed to init cache tables', e)
  }
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data
  
  if (type === 'init') {
    await init()
    return
  }
  
  try {
    if (type === 'query_dict') {
      if (!dictDb) throw new Error('词典数据库未加载')
      const { sql, bind } = payload
      const rows: any[] = []
      dictDb.exec({
        sql,
        bind,
        rowMode: 'object',
        callback: (row: any) => { rows.push(row) }
      })
      postMessage({ id, result: rows })
    } else if (type === 'query_cache') {
      if (!cacheDb) throw new Error('缓存数据库未加载')
      const { sql, bind } = payload
      const rows: any[] = []
      cacheDb.exec({
        sql,
        bind,
        rowMode: 'object',
        callback: (row: any) => { rows.push(row) }
      })
      postMessage({ id, result: rows })
    } else if (type === 'exec_cache') {
      if (!cacheDb) throw new Error('缓存数据库未加载')
      const { sql, bind } = payload
      cacheDb.exec({ sql, bind })
      postMessage({ id, result: true })
    } else if (type === 'exec_cache_get_id') {
      if (!cacheDb) throw new Error('缓存数据库未加载')
      const { sql, bind } = payload
      cacheDb.exec({ sql, bind })
      let lastId = 0
      cacheDb.exec({
        sql: 'SELECT last_insert_rowid() as id',
        rowMode: 'object',
        callback: (row: any) => { lastId = row.id }
      })
      postMessage({ id, result: lastId })
    } else if (type === 'import_dict') {
      const { buffer } = payload
      const data = new Uint8Array(buffer)
      
      if (!isSqlite(data)) {
        throw new Error('导入的文件不是有效的 SQLite 数据库格式')
      }
      
      // 写入 OPFS (Async API 通常总是可用的)
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle('stardict.db', { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(data)
      await writable.close()
      
      // 重新加载
      await tryLoadDict()
      postMessage({ id, result: true })
    } else if (type === 'check_dict_exists') {
      let exists = false
      if (dictDb) {
        try {
          dictDb.exec({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='stardict'",
            callback: () => { exists = true }
          })
        } catch (e) {}
      }
      postMessage({ id, result: exists })
    } else if (type === 'reload_dict') {
      await tryLoadDict()
      postMessage({ id, result: true })
    }
  } catch (err: any) {
    console.error('[dbWorker] Error executing', type, err)
    postMessage({ id, error: err.message })
  }
}