import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用国内极速 GitHub 代理
const ZIP_URL = 'https://ghproxy.net/https://github.com/skywind3000/ECDICT-ultimate/releases/download/1.0.0/ecdict-ultimate-sqlite.zip';
const ZIP_PATH = path.resolve(__dirname, '../ecdict_ultimate_sqlite.zip');
const EXTRACT_PATH = path.resolve(__dirname, '../data');
const TARGET_DB = path.resolve(__dirname, '../data/stardict_full.db');
const CLIENT_DB = path.resolve(__dirname, '../../client/public/stardict_full.db');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    // 处理重定向
    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }
        
        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
            const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
            process.stdout.write(`\rDownloading: ${percent}% (${mb}MB / ${totalMb}MB)`);
          } else {
            const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
            process.stdout.write(`\rDownloading: ${mb}MB`);
          }
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log('\nDownload finished successfully!');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    
    request(url);
  });
}

async function main() {
  try {
    console.log(`Downloading from fast mirror: ${ZIP_URL}...`);
    
    // 确保目录存在
    if (!fs.existsSync(EXTRACT_PATH)) {
      fs.mkdirSync(EXTRACT_PATH, { recursive: true });
    }

    await downloadFile(ZIP_URL, ZIP_PATH);
    
    console.log('Extracting zip archive...');
    // 使用 PowerShell 解压
    const extractCmd = `powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${EXTRACT_PATH}' -Force"`;
    execSync(extractCmd, { stdio: 'inherit' });
    
    console.log('Extraction complete.');
    
    // 重命名 ecdict.db 为 stardict_full.db
    const extractedDb = path.resolve(EXTRACT_PATH, 'ecdict.db');
    if (fs.existsSync(extractedDb)) {
      if (fs.existsSync(TARGET_DB)) fs.unlinkSync(TARGET_DB);
      fs.renameSync(extractedDb, TARGET_DB);
      console.log(`Renamed to ${TARGET_DB}`);
    }

    // 复制到客户端目录
    const clientPublicDir = path.dirname(CLIENT_DB);
    if (!fs.existsSync(clientPublicDir)) {
      fs.mkdirSync(clientPublicDir, { recursive: true });
    }
    fs.copyFileSync(TARGET_DB, CLIENT_DB);
    console.log(`Copied to client public directory: ${CLIENT_DB}`);

    // 清理 zip
    if (fs.existsSync(ZIP_PATH)) {
      fs.unlinkSync(ZIP_PATH);
    }
    console.log('All done! 616MB Ultimate dictionary is now ready in your folders!');
  } catch (error) {
    console.error('\nError:', error.message);
  }
}

main();