import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.resolve(__dirname, '../ecdict_full.csv');
const DB_PATH = path.resolve(__dirname, '../client/public/stardict_full.db');
const SERVER_DB_PATH = path.resolve(__dirname, '../server/data/stardict_full.db');

function parseCSVLine(line) {
  const fields = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

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
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  fields.push(currentField);
  return fields;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV file not found at:', CSV_PATH);
    return;
  }

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

  console.log('Processing CSV line by line...');
  
  const fileStream = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let headers = null;
  let count = 0;
  let batch = [];
  const BATCH_SIZE = 10000;

  const runBatch = db.transaction((rows) => {
    for (const row of rows) {
      try {
        insert.run(row);
      } catch (e) {
        if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          // Ignore duplicate keys
        }
      }
    }
  });

  for await (const line of rl) {
    const fields = parseCSVLine(line);
    if (!headers) {
      headers = fields;
      console.log('Headers:', headers.join(', '));
      continue;
    }

    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = fields[i] || '';
    });

    batch.push(obj);
    count++;

    if (batch.length >= BATCH_SIZE) {
      runBatch(batch);
      batch = [];
      process.stdout.write(`\rProgress: ${count} records processed`);
    }
  }

  if (batch.length > 0) {
    runBatch(batch);
  }

  console.log('Done! Total ${count} records processed.');
  console.log('Database created at:', DB_PATH);
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