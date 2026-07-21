import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 切换到 client 目录（确保在正确的路径运行）
process.chdir(path.join(__dirname, '..'));

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

  // 5. 生成 index.html (防止 404)
  const indexHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>英语应试App 更新服务器</title>
    <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5; }
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        h1 { color: #1a73e8; }
        .version { font-size: 1.2rem; font-weight: bold; margin: 1rem 0; }
        .link { color: #5f6368; text-decoration: none; border-bottom: 1px solid #dadce0; }
    </style>
</head>
<body>
    <div class="card">
        <h1>英语应试App 更新服务器</h1>
        <p>当前最新版本</p>
        <div class="version">v${version}</div>
        <p><a href="version.json" class="link">查看 version.json</a></p>
        <p><small>最后更新: ${new Date().toLocaleString()}</small></p>
    </div>
</body>
</html>
  `;
  fs.writeFileSync(path.join(updateDistDir, 'index.html'), indexHtml);
  console.log(`index.html has been generated in ${updateDistDir}.`);
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// 将 dist 目录下的所有文件添加到压缩包
if (fs.existsSync('dist')) {
  archive.directory('dist/', false);
  archive.finalize();
} else {
  console.error('dist directory not found! Build might have failed.');
  process.exit(1);
}