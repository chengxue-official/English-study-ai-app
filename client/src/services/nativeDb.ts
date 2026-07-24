import { Capacitor } from '@capacitor/core';
import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { Filesystem, Directory } from '@capacitor/filesystem';

class NativeDatabaseService {
  private sqlite: SQLiteConnection | null = null;
  private dictDb: SQLiteDBConnection | null = null;
  private cacheDb: SQLiteDBConnection | null = null;
  private isNative = Capacitor.isNativePlatform();

  constructor() {
    if (this.isNative) {
      this.sqlite = new SQLiteConnection(CapacitorSQLite);
      console.log('[NativeDb] SQLite Connection initialized');
    }
  }

  public async init(): Promise<void> {
    if (!this.isNative || !this.sqlite) return;

    try {
      console.log('[NativeDb] Initializing native database...');
      
      // 检查连接一致性
      try {
        await this.sqlite.checkConnectionsConsistency();
      } catch (e) {
        console.warn('[NativeDb] checkConnectionsConsistency failed:', e);
      }

      this.cacheDb = await this.sqlite.createConnection('cache', false, 'no-encryption', 1, false);
      await this.cacheDb.open();
      await this.initCacheTables();
      await this.tryLoadDict();
    } catch (err) {
      console.error('[NativeDb] Init failed:', err);
      throw err;
    }
  }

  private async initCacheTables(): Promise<void> {
    if (!this.cacheDb) return;
    const sql = `
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
    `;
    await this.cacheDb.execute(sql);
  }

  public async tryLoadDict(): Promise<boolean> {
    if (!this.isNative || !this.sqlite) return false;

    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        console.log(`[NativeDb] Checking for database "stardict" (attempt ${retry + 1})...`);
        
        // 尝试多种可能的名称
        const names = ['stardict', 'stardictSQLite', 'stardict.db', 'stardict.dbSQLite'];
        for (const name of names) {
          const exists = await this.sqlite.isDatabase(name);
          if (exists.result) {
            console.log(`[NativeDb] Found database with name: ${name}`);
            if (this.dictDb) {
              try {
                await this.sqlite.closeConnection(name, false);
              } catch (e) {}
            }
            this.dictDb = await this.sqlite.createConnection(name, false, 'no-encryption', 1, false);
            try {
              await this.dictDb.open();
              console.log(`[NativeDb] Dict loaded successfully using name: ${name}`);
              return true;
            } catch (openErr: any) {
              console.error(`[NativeDb] Failed to open dict database (${name}):`, openErr);
            }
          }
        }
        
        if (retry < maxRetries - 1) {
          console.log('[NativeDb] Database not found yet, waiting 500ms before retry...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.warn(`[NativeDb] Attempt ${retry + 1} failed:`, err);
      }
    }

    // 如果找不到，检查 files/ 目录下是否有 stardict.db，如果有则尝试迁移
    try {
      const stat = await Filesystem.stat({ path: 'stardict.db', directory: Directory.Data });
      if (stat) {
        console.log(`[NativeDb] Found stardict.db in files/ (size: ${stat.size}), but not in databases/.`);
      }
    } catch (e) {}

    // 列出所有数据库以供调试
    const dbList = await this.sqlite.getDatabaseList();
    console.log('[NativeDb] Current database list from plugin:', JSON.stringify(dbList.values));
    
    return false;
  }

  public async moveAndLoad(dbName: string): Promise<boolean> {
    if (!this.isNative || !this.sqlite) return false;
    
    try {
      console.log(`[NativeDb] Moving ${dbName} from files/ to databases/...`);
      
      // 迁移前验证文件是否存在
      try {
        const stat = await Filesystem.stat({ path: `${dbName}.db`, directory: Directory.Data });
        console.log(`[NativeDb] Pre-migration check: ${dbName}.db exists, size: ${stat.size}`);
      } catch (e) {
        console.error(`[NativeDb] Pre-migration check failed: ${dbName}.db not found in files/`);
        return false;
      }

      // 迁移前强制同步一次
      try {
        await this.sqlite.checkConnectionsConsistency();
      } catch (e) {}

      // 插件要求提供文件夹路径（相对于 files/）和数据库列表
      await (this.sqlite as any).moveDatabasesAndAddSuffix('', [dbName]);
      console.log('[NativeDb] moveDatabasesAndAddSuffix call finished, waiting 500ms for OS to sync...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 验证迁移结果
      const names = [dbName, `${dbName}SQLite`, `${dbName}.db`, `${dbName}.dbSQLite`].filter(Boolean);
      let found = false;
      for (const name of names) {
        const exists = await this.sqlite.isDatabase(name);
        if (exists.result) {
          console.log(`[NativeDb] Migration verified! Database exists as: ${name}`);
          found = true;
          break;
        }
      }

      if (found) {
        // 只有确认迁移成功（插件能看到）后，才删除原文件
        try {
          await Filesystem.deleteFile({ path: `${dbName}.db`, directory: Directory.Data });
          console.log(`[NativeDb] Cleaned up temporary file: ${dbName}.db`);
        } catch (e) {
          console.warn('[NativeDb] Failed to delete temp file, but migration succeeded:', e);
        }
        return true;
      } else {
        console.error('[NativeDb] moveDatabasesAndAddSuffix returned but plugin still cannot see the database.');
        const dbList = await this.sqlite.getDatabaseList();
        console.log('[NativeDb] Database list after failed migration:', JSON.stringify(dbList.values));
        return false;
      }
    } catch (e) {
      console.warn('[NativeDb] moveAndLoad exception:', e);
      return false;
    }
  }

  public async isDictLoaded(): Promise<boolean> {
    if (!this.dictDb) return false;
    try {
      const res = await this.dictDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name='stardict'");
      return (res.values?.length ?? 0) > 0;
    } catch (e) {
      return false;
    }
  }

  public async query(dbType: 'dict' | 'cache', sql: string, params: any[] = []): Promise<any[]> {
    const db = dbType === 'dict' ? this.dictDb : this.cacheDb;
    if (!db) throw new Error(`${dbType} database not initialized`);

    const res = await db.query(sql, params);
    return res.values || [];
  }

  public async execute(dbType: 'dict' | 'cache', sql: string, params: any[] = []): Promise<void> {
    const db = dbType === 'dict' ? this.dictDb : this.cacheDb;
    if (!db) throw new Error(`${dbType} database not initialized`);

    await db.run(sql, params);
  }

  public async executeGetId(dbType: 'dict' | 'cache', sql: string, params: any[] = []): Promise<number> {
    const db = dbType === 'dict' ? this.dictDb : this.cacheDb;
    if (!db) throw new Error(`${dbType} database not initialized`);

    const res = await db.run(sql, params);
    return res.changes?.lastId ?? 0;
  }

  public async importDatabase(dbName: string, data: Uint8Array): Promise<void> {
    if (!this.isNative || !this.sqlite) return;

    try {
      console.log(`[NativeDb] Importing ${dbName}, size: ${data.length} bytes`);
      
      const filename = `${dbName}.db`;
      
      // 尝试删除旧文件
      try {
        await Filesystem.deleteFile({ path: filename, directory: Directory.Data });
      } catch (e) {}

      const chunkSize = 1024 * 1024; // 1MB chunks
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const base64Data = this.uint8ArrayToBase64(chunk);
        await (Filesystem.writeFile as any)({
          path: filename,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
          ...(i > 0 ? { append: true } : {})
        });
        if (i % (10 * chunkSize) === 0) {
          console.log(`[NativeDb] Import progress: ${((i / data.length) * 100).toFixed(1)}%`);
        }
      }

      // 移动并加载
      await this.moveAndLoad(dbName);

      const loaded = await this.tryLoadDict();
      if (!loaded) {
        throw new Error('Database file written but could not be loaded by SQLite plugin');
      }
    } catch (err) {
      console.error('[NativeDb] Import failed:', err);
      throw err;
    }
  }

  /**
   * 内存安全地从 Blob/File 导入数据库
   */
  public async importDatabaseFromBlob(dbName: string, file: Blob, onProgress?: (prog: number) => void): Promise<void> {
    if (!this.isNative || !this.sqlite) return;

    try {
      console.log(`[NativeDb] Importing ${dbName} from Blob, size: ${file.size} bytes`);
      const filename = `${dbName}.db`;
      
      // 尝试删除旧文件
      try {
        await Filesystem.deleteFile({ path: filename, directory: Directory.Data });
      } catch (e) {}

      const chunkSize = 1024 * 1024; // 1MB chunks
      let offset = 0;
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        const buffer = await chunk.arrayBuffer();
        const base64Data = this.uint8ArrayToBase64(new Uint8Array(buffer));
        
        await (Filesystem.writeFile as any)({
          path: filename,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
          append: offset > 0
        });

        offset += chunk.size;
        if (onProgress) {
          onProgress(offset / file.size);
        }
        if (Math.floor((offset - chunk.size) / (10 * chunkSize)) !== Math.floor(offset / (10 * chunkSize))) {
          console.log(`[NativeDb] Blob Import progress: ${((offset / file.size) * 100).toFixed(1)}%`);
        }
      }

      // 移动并加载
      await this.moveAndLoad(dbName);

      const loaded = await this.tryLoadDict();
      if (!loaded) {
        throw new Error('Database file written but could not be loaded by SQLite plugin');
      }
    } catch (err) {
      console.error('[NativeDb] Blob Import failed:', err);
      throw err;
    }
  }

  public async getDatabaseSize(dbType: 'dict' | 'cache'): Promise<number> {
    const db = dbType === 'dict' ? this.dictDb : this.cacheDb;
    if (!db) return 0;
    try {
      const pageSizeRes = await db.query('PRAGMA page_size');
      const pageCountRes = await db.query('PRAGMA page_count');
      const pageSize = pageSizeRes.values?.[0]?.page_size || 0;
      const pageCount = pageCountRes.values?.[0]?.page_count || 0;
      return pageSize * pageCount;
    } catch (e) {
      console.warn(`[NativeDb] Failed to get ${dbType} size:`, e);
      return 0;
    }
  }

  private uint8ArrayToBase64(arr: Uint8Array): string {
    // 使用更高效的分块转换方法，避免大数组导致的栈溢出或性能问题
    let binary = '';
    const len = arr.byteLength;
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
      const sub = arr.subarray(i, Math.min(i + chunk, len));
      binary += String.fromCharCode.apply(null, sub as any);
    }
    return btoa(binary);
  }
}

export const nativeDb = new NativeDatabaseService();