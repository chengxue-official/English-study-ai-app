import { Capacitor } from '@capacitor/core';
import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
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
      
      const uri = await Filesystem.getUri({
        path: '',
        directory: Directory.Data
      });
      logger.info(`[NativeDb] Directory.Data URI: ${uri.uri}`);
    } catch (e: any) {
      logger.error(`[NativeDb] Failed to list Directory.Data: ${e.message}`);
    }
  }

  public async moveAndLoad(dbName: string): Promise<boolean> {
    if (!this.isNative || !this.sqlite) return false;
    
    try {
      await this.listDataDirectory();
      
      const possibleSourceFiles = [`${dbName}.db`, dbName];
      let actualSourceFile = '';
      
      for (const f of possibleSourceFiles) {
        try {
          const stat = await Filesystem.stat({
            path: f,
            directory: Directory.Data
          });
          logger.info(`[NativeDb] Found source file: ${f}, size: ${stat.size}`);
          actualSourceFile = f;
          break;
        } catch (e) {}
      }

      if (!actualSourceFile) {
        logger.error(`[NativeDb] No source file found for ${dbName} in Directory.Data`);
        return false;
      }

      // 尝试多种迁移策略
      const moveStrategies = [
        { name: dbName, desc: 'original name' },
        { name: `${dbName}.db`, desc: 'name with .db' },
        { name: actualSourceFile.replace('.db', ''), desc: 'stripped name' }
      ];

      for (const strategy of moveStrategies) {
        logger.info(`[NativeDb] Strategy: Moving ${strategy.name} (${strategy.desc})...`);
        try {
          await (this.sqlite as any).moveDatabasesAndAddSuffix('', [strategy.name]);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const exists = await this.sqlite.isDatabase(dbName);
          if (exists.result) {
            logger.info(`[NativeDb] Success! Database exists as: ${dbName}`);
            try { await Filesystem.deleteFile({ path: actualSourceFile, directory: Directory.Data }); } catch (e) {}
            return true;
          }
        } catch (e: any) {
          logger.warn(`[NativeDb] Strategy ${strategy.name} failed: ${e.message}`);
        }
      }

      // 激进策略：手动移动到 databases 目录 (Android 专用)
      if (Capacitor.getPlatform() === 'android') {
        logger.info(`[NativeDb] Attempting manual move to databases folder...`);
        try {
          const targetPath = `../databases/${dbName}.db`;
          await Filesystem.copy({
            from: actualSourceFile,
            to: targetPath,
            directory: Directory.Data
          });
          logger.info(`[NativeDb] Manual copy to ${targetPath} successful`);
          
          const exists = await this.sqlite.isDatabase(dbName);
          if (exists.result) {
            logger.info(`[NativeDb] Manual move success!`);
            return true;
          }
        } catch (e: any) {
          logger.error(`[NativeDb] Manual move failed: ${e.message}`);
        }
      }

      logger.error(`[NativeDb] All move strategies failed for ${dbName}`);
      return false;
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

      const chunkSize = 1024 * 1023; 
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const base64Data = this.uint8ArrayToBase64(chunk);
        
        if (i === 0) {
          await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: Directory.Data,
            recursive: true
          });
        } else {
          await Filesystem.appendFile({
            path: filename,
            data: base64Data,
            directory: Directory.Data
          });
        }
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

      const chunkSize = 1024 * 1023; 
      let offset = 0;
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        const buffer = await chunk.arrayBuffer();
        const base64Data = this.uint8ArrayToBase64(new Uint8Array(buffer));
        
        if (offset === 0) {
          await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: Directory.Data,
            recursive: true
          });
        } else {
          await Filesystem.appendFile({
            path: filename,
            data: base64Data,
            directory: Directory.Data
          });
        }

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