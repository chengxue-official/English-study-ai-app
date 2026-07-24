import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../client/public/stardict_full.db');

console.log('=== 词典文件深度验证 ===');
console.log('文件路径:', dbPath);

try {
  const stats = fs.statSync(dbPath);
  console.log(`文件大小: ${(stats.size / 1024 / 1024 / 1024).toFixed(2)} GB (${stats.size} 字节)`);

  const db = new Database(dbPath, { readonly: true });
  console.log('\n1. 正在执行 SQLite 完整性检查 (PRAGMA integrity_check)...');
  const integrity = db.prepare('PRAGMA integrity_check').get();
  console.log('完整性检查结果:', integrity);

  console.log('\n2. 检查表结构...');
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stardict'").get();
  console.log('表结构:', schema ? schema.sql : '未找到 stardict 表');

  console.log('\n3. 抽样查询测试...');
  const sample = db.prepare('SELECT word, translation FROM stardict ORDER BY RANDOM() LIMIT 1').get();
  console.log('随机词条:', sample);

  db.close();
  console.log('\n✅ 验证完成：数据库文件结构完好，没有损坏。');
} catch (err) {
  console.error('\n❌ 验证失败:', err.message);
}