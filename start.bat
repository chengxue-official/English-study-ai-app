@echo off
@echo off
chcp 65001 >nul
title 英语应试助手 - 启动器

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     英语应试助手 - 一键启动          ║
echo  ╚══════════════════════════════════════╝
echo.

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [错误] 未检测到 Node.js，请先安装: https://nodejs.org
    pause
    exit /b 1
)

:: 检查依赖是否安装
if not exist "server\node_modules" (
    echo  [安装] 正在安装后端依赖...
    cd server && npm install && cd ..
)
if not exist "client\node_modules" (
    echo  [安装] 正在安装前端依赖...
    cd client && npm install && cd ..
)

:: 检查词典数据库
if not exist "server\data\stardict.db" (
    echo  [警告] 未检测到词典数据库 (server\data\stardict.db)
    echo  [警告] 查词功能将不可用，请参考 README 下载 ECDICT 数据库
    echo.
)

echo  [启动] 正在启动后端服务 (端口 3001)...
start "英语应试助手-后端" /min cmd /c "cd /d %~dp0server && npx tsx server.ts"

:: 等待后端启动
timeout /t 3 /nobreak >nul

echo  [启动] 正在启动前端服务 (端口 5173)...
start "英语应试助手-前端" /min cmd /c "cd /d %~dp0client && npx vite --host"

:: 等待前端启动
timeout /t 4 /nobreak >nul

:: 获取本机局域网IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "127.0.0.1"') do (
    set LOCAL_IP=%%a
)
set LOCAL_IP=%LOCAL_IP: =%

echo.
echo  ══════════════════════════════════════
echo  ✅ 服务已启动！
echo.
echo  🖥️  电脑访问:  http://localhost:5173
echo  📱 手机访问:  http://%LOCAL_IP%:5173
echo.
echo  📱 手机使用方法:
echo     1. 确保手机和电脑连接同一WiFi
echo     2. 在手机浏览器输入上面的手机访问地址
echo  ══════════════════════════════════════
echo.

:: 自动打开浏览器
start http://localhost:5173

echo  按任意键关闭此窗口（后端和前端服务将继续运行）...
pause >nul