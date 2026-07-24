import { Capacitor } from '@capacitor/core';
import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { logger } from './logger';

class NativeDatabaseService {
  private sqlite: SQLiteConnection | null = null;
  private dictDb: SQLiteDBConnection | null = null;
  private cacheDb: SQLiteDBConnection | null = null;
  private isNative = Capacitor.isNativePlatform();

  constructor() {
    if (this.isNative) {
      this.sqlite = new SQLiteConnection(CapacitorSQLite);
      logger.info('[NativeDb] SQLite Connection initialized');
    }
  }

  public async init(): Promise<void> {
    if (!this.isNative || !this.sqlite) return;

    try {
      logger.info('[NativeDb] Initializing native database...');
      
      // 检查连接一致性
      try {
        await this.sqlite.checkConnectionsConsistency();
      } catch (e) {
        logger.warn('[NativeDb] checkConnectionsConsistency failed:', e);
      }

      this.cacheDb = await this.sqlite.createConnection('cache', false, 'no-encryption', 1, false);
      await this.cacheDb.open();
      await this.initCacheTables();
      await this.tryLoadDict();
    } catch (err) {
      logger.error('[NativeDb] Init failed:', err);
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
        logger.info(`[NativeDb] Checking for database "stardict" (attempt ${retry + 1})...`);
        
        const names = ['stardict', 'stardictSQLite', 'stardict.db', 'stardict.dbSQLite'];
        for (const name of names) {
          const exists = await this.sqlite.isDatabase(name);
          if (exists.result) {
            logger.info(`[NativeDb] Found database with name: ${name}`);
            if (this.dictDb) {
              try {
                await this.sqlite.closeConnection(name, false);
              } catch (e) {}
            }
            this.dictDb = await this.sqlite.createConnection(name, false, 'no-encryption', 1, false);
            try {
              await this.dictDb.open();
              logger.info(`[NativeDb] Dict loaded successfully using name: ${name}`);
              return true;
            } catch (openErr: any) {
              logger.error(`[NativeDb] Failed to open dict database (${name}):`, openErr);
            }
          }
        }
        
        if (retry < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        logger.warn(`[NativeDb] Attempt ${retry + 1} failed:`, err);
      }
    }
    return false;
  }

  private async listDataDirectory() {
    try {
      const result = await Filesystem.readdir({
        path: '',
        directory: Directory.Data
      });
      logger.info(`[NativeDb] Files in Directory.Data: ${result.files.map(f => f.name).join(', ')}`);
    } catch (e: any) {
      logger.error(`[NativeDb] Failed to list Directory.Data: ${e.message}`);
    }
  }

  public async moveAndLoad(dbName: string): Promise<boolean> {
    if (!this.isNative || !this.sqlite) return false;
    
    try {
      await this.listDataDirectory();
      
      const fileName = `${dbName}.db`;
      try {
        const stat = await Filesystem.stat({
          path: fileName,
          directory: Directory.Data
        });
        logger.info(`[NativeDb] Source file ${fileName} size: ${stat.size}`);
      } catch (e) {
        logger.warn(`[NativeDb] Source file ${fileName} not found before move`);
      }

      logger.info(`[NativeDb] Moving ${dbName} from files/ to databases/...`);
      
      // moveDatabasesAndAddSuffix 会将文件从 Directory.Data 移动到插件私有目录
      // 并且会自动添加 .db 后缀（如果原本没有）
      await (this.sqlite as any).moveDatabasesAndAddSuffix('', [dbName]);
      logger.info(`[NativeDb] moveDatabasesAndAddSuffix done`);
      
      // 等待一下确保文件系统同步
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.listDataDirectory();

      const exists = await this.sqlite.isDatabase(dbName);
      logger.info(`[NativeDb] isDatabase(${dbName}) result: ${exists.result}`);

      if (exists.result) {
        try {
          await Filesystem.deleteFile({ path: fileName, directory: Directory.Data });
          logger.info(`[NativeDb] Cleaned up temporary file ${fileName}`);
        } catch (e) {}
        return true;
      } else {
        logger.error(`[NativeDb] Database ${dbName} does not exist after move`);
        // 尝试用带 .db 的名字再查一次
        const existsWithExt = await this.sqlite.isDatabase(`${dbName}.db`);
        logger.info(`[NativeDb] isDatabase(${dbName}.db) result: ${existsWithExt.result}`);
        return false;
      }
    } catch (e: any) {
      logger.warn('[NativeDb] moveAndLoad exception:', e);
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
      logger.info(`[NativeDb] Importing ${dbName}, size: ${data.length} bytes`);
      const filename = `${dbName}.db`;
      
      try {
        await Filesystem.deleteFile({ path: filename, directory: Directory.Data });
      } catch (e) {}

      const chunkSize = 1024 * 1024;
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
      }

      await this.moveAndLoad(dbName);
      await this.tryLoadDict();
    } catch (err) {
      logger.error('[NativeDb] Import failed:', err);
      throw err;
    }
  }

  public async importDatabaseFromBlob(dbName: string, file: Blob, onProgress?: (prog: number) => void): Promise<void> {
    if (!this.isNative || !this.sqlite) return;

    try {
      logger.info(`[NativeDb] Importing ${dbName} from Blob, size: ${file.size} bytes`);
      const filename = `${dbName}.db`;
      
      try {
        await Filesystem.deleteFile({ path: filename, directory: Directory.Data });
      } catch (e) {}

      const chunkSize = 1024 * 1024;
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
        if (onProgress) onProgress(offset / file.size);
      }

      logger.info(`[NativeDb] File ${dbName}.db written successfully, size: ${offset} bytes`);
      await this.moveAndLoad(dbName);
      await this.tryLoadDict();
    } catch (err) {
      logger.error('[NativeDb] Blob Import failed:', err);
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
      logger.warn(`[NativeDb] Failed to get ${dbType} size:`, e);
      return 0;
    }
  }

  private uint8ArrayToBase64(arr: Uint8Array): string {
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