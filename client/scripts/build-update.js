import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 切换到 client 目录
const clientDir = path.join(__dirname, '..');
process.chdir(clientDir);
console.log(`Current working directory: ${process.cwd()}`);

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

console.log(`Building update package for version ${version}...`);

// 1. 构建项目
try {
  console.log('Running npm run build...');
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

// 2. 创建 update-dist 目录
const updateDistDir = 'update-dist';
if (!fs.existsSync(updateDistDir)) {
  fs.mkdirSync(updateDistDir);
}

// 3. 创建 zip 文件
async function createZip() {
  return new Promise((resolve, reject) => {
    const zipFileName = `dist-${version}.zip`;
    const zipFilePath = path.join(updateDistDir, zipFileName);
    const output = fs.createWriteStream(zipFilePath);
    const archive = new ZipArchive({
      zlib: { level: 9 }
    });

    output.on('close', function() {
      console.log(`${zipFileName} has been created in ${updateDistDir}. Total bytes: ${archive.pointer()}`);
      
      // 4. 生成 version.json
      let baseUrl = process.env.UPDATE_BASE_URL || 'https://english-exam-app-updates.pages.dev';
      baseUrl = baseUrl.replace(/\/$/, '');
      
      const versionInfo = {
        version: version,
        url: `${baseUrl}/${zipFileName}`,
        date: new Date().toISOString(),
        notes: `Release version ${version}`
      };
      
      fs.writeFileSync(path.join(updateDistDir, 'version.json'), JSON.stringify(versionInfo, null, 2));
      console.log(`version.json has been generated in ${updateDistDir}.`);

      // 5. 生成 index.html
      const indexHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>英语应试App 更新服务器</title>
</head>
<body>
    <h1>英语应试App 更新服务器</h1>
    <p>当前最新版本: v${version}</p>
    <p><a href="version.json">查看 version.json</a></p>
</body>
</html>
      `;
      fs.writeFileSync(path.join(updateDistDir, 'index.html'), indexHtml);
      console.log(`index.html has been generated in ${updateDistDir}.`);

      // 6. 复制 stardict.db
      const stardictSource = path.join('public', 'stardict.db');
      const stardictDest = path.join(updateDistDir, 'stardict.db');
      if (fs.existsSync(stardictSource)) {
        fs.copyFileSync(stardictSource, stardictDest);
        console.log(`stardict.db has been copied to ${updateDistDir}.`);
      }
      resolve();
    });

    archive.on('error', function(err) {
      console.error('Archive error:', err);
      reject(err);
    });

    archive.pipe(output);

    if (fs.existsSync('dist')) {
      console.log('Adding dist directory to archive...');
      archive.directory('dist/', false);
      archive.finalize();
    } else {
      console.error('dist directory not found!');
      reject(new Error('dist directory not found'));
    }
  });
}

createZip().then(() => {
  console.log('Build update process completed successfully.');
}).catch(err => {
  console.error('Build update process failed:', err);
  process.exit(1);
});