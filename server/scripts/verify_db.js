import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../client/public/stardict_full.db');
console.log('正在验证数据库:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  console.log('成功连接到数据库');

  const row = db.prepare('SELECT count(*) as count FROM stardict').get();
  console.log('词条总数:', row.count);

  const sample = db.prepare('SELECT word, translation FROM stardict LIMIT 1').get();
  console.log('示例词条:', sample);

  db.close();
} catch (err) {
  console.error('验证失败:', err.message);
  process.exit(1);
}