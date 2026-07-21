import Database from 'better-sqlite3';
import fs from 'fs';
import https from 'https';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_URL = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv';
const DB_PATH = path.resolve(__dirname, '../client/public/stardict.db');
const SERVER_DB_PATH = path.resolve(__dirname, '../server/data/stardict.db');

// 核心词汇标签：zk(中考), gk(高考), cet4(四级), cet6(六级), ky(考研)
const CORE_TAGS = ['zk', 'gk', 'cet4', 'cet6', 'ky'];

function parseCSV(data) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    const nextChar = data[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentField);
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        currentLine.push(currentField);
        if (currentLine.length > 1 || currentLine[0] !== '') {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    lines.push(currentLine);
  }
  return lines;
}

async function downloadCSV(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  const TEMP_CSV = './ecdict_full.csv';
  
  if (!fs.existsSync(TEMP_CSV)) {
    console.log('Downloading CSV (approx. 65MB)...');
    await downloadCSV(CSV_URL, TEMP_CSV);
    console.log('Download complete.');
  } else {
    console.log('Using existing temp CSV file.');
  }

  console.log('Reading CSV file...');
  const csvData = fs.readFileSync(TEMP_CSV, 'utf8');
  
  console.log('Parsing CSV...');
  const rows = parseCSV(csvData);
  if (rows.length === 0) {
    console.error('No rows found in CSV!');
    return;
  }
  
  const headers = rows[0];
  console.log('Headers:', headers.join(', '));
  
  console.log('Filtering core vocabulary...');
  const records = [];
  const tagIndex = headers.indexOf('tag');
  
  if (tagIndex === -1) {
    console.error('Tag column not found in CSV headers!');
    console.log('Available headers:', headers);
    return;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tag = row[tagIndex] || '';
    
    // 检查是否包含核心标签
    const isCore = CORE_TAGS.some(t => tag.includes(t));
    
    if (isCore) {
      const obj = {};
      headers.forEach((header, j) => {
        obj[header] = row[j] || '';
      });
      records.push(obj);
    }
  }

  console.log(`Total records in CSV: ${rows.length - 1}`);
  console.log(`Filtered core records: ${records.length}`);

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE stardict (
      word TEXT PRIMARY KEY,
      phonetic TEXT,
      definition TEXT,
      translation TEXT,
      pos TEXT,
      collins INTEGER,
      oxford INTEGER,
      tag TEXT,
      bnc INTEGER,
      frq INTEGER,
      exchange TEXT,
      detail TEXT,
      audio TEXT
    );
    CREATE INDEX idx_stardict_word ON stardict(word);
  `);

  const insert = db.prepare(`
    INSERT INTO stardict (word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange, detail, audio)
    VALUES (@word, @phonetic, @definition, @translation, @pos, @collins, @oxford, @tag, @bnc, @frq, @exchange, @detail, @audio)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      try {
        insert.run(row);
      } catch (e) {
        // 忽略重复词条（如果有的话）
        if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          throw e;
        }
      }
    }
  });

  console.log('Inserting records into SQLite...');
  insertMany(records);

  console.log('Done! Database created at:', path.resolve(DB_PATH));
  const stats = fs.statSync(DB_PATH);
  console.log(`Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  db.close();

  // 同步到服务端目录
  try {
    const serverDataDir = path.dirname(SERVER_DB_PATH);
    if (!fs.existsSync(serverDataDir)) {
      fs.mkdirSync(serverDataDir, { recursive: true });
    }
    fs.copyFileSync(DB_PATH, SERVER_DB_PATH);
    console.log('Synced to server data directory:', SERVER_DB_PATH);
  } catch (err) {
    console.error('Failed to sync to server data directory:', err.message);
  }
}

main().catch(console.error);