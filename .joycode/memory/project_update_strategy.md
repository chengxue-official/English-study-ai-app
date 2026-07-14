---
name: update-strategy
description: 应用内热更新机制设计策略，封装时实现
type: project
---

## 更新策略设计

**核心思路**：大版本(原生层变更)发新包；小功能更新走应用内热更新。

**热更新机制架构**：
1. 前端资源包版本比对：本地版本号 vs 远程版本号
2. 增量下载：只下载变更的前端资源文件（diff/patch）
3. 本地替换：将新资源覆盖到应用资源目录
4. 应用重载：提示用户重启或自动重载WebView

**关键前置工作**：
- 后端逻辑前端化：sql.js替代better-sqlite3，让更多逻辑可走热更新
- LLM API调用直接从前端发起（CORS配置），减少对Node.js后端依赖
- 版本号管理：package.json版本 + 远程版本检查API

**封装阶段集成**：
- exe端：Electron electron-updater / Tauri内置updater
- apk端：Capacitor Live Update（绕过应用商店审核推送web内容更新）

**Why:** 用户希望小功能更新内嵌在程序里自动完成，避免每次更新都发布新exe/apk
**How to apply:** 封装阶段实现热更新机制，当前Web开发阶段先做好架构准备（后端逻辑前端化）