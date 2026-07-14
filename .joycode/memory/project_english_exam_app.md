---
name: english-exam-app-project
description: 高中英语应试App项目状态和技术架构
type: project
---

## 项目状态 (2026-07-12)

### 已完成功能
1. **文章导入与翻译** - 粘贴文本导入、双栏展示(原文+译文)、段落自动分割、翻译缓存、API配置界面(模型/密钥/端点)
2. **单词点击查询** - ECDICT词典(340万词条SQLite)、ClickableText组件、WordPopup弹窗(音标/释义/词形变化/考试标签/柯林斯星级/牛津3000)、词形反查(running→run)

### 技术架构
- **前端**: React + Vite + TypeScript + Zustand + Tailwind CSS (port 5173)
- **后端**: Node.js + Express + TypeScript (port 3001)
- **词典**: ECDICT stardict.db (851MB, 340万词条) + better-sqlite3
- **翻译**: OpenAI兼容API接口

### 关键文件
- `server/server.ts` - 后端主文件(翻译+词典API)
- `server/data/stardict.db` - ECDICT词典数据库
- `client/src/store/dictStore.ts` - 词典状态管理
- `client/src/components/WordPopup.tsx` - 词典弹窗组件
- `client/src/components/ArticleView.tsx` - 文章展示+ClickableText
- `client/src/store/configStore.ts` - API配置管理

### 下一步功能(按计划)
- 长难句识别与拆解(Phase 2核心功能)
- 短语/搭配自动标注
- 单词搭配展示(collocations)
- 生词本功能(收藏/复习)

### 运维注意
- 后端需手动启动: `cd server && npx tsx server.ts`
- 前端需手动启动: `cd client && npx vite --host`
- 词典数据库懒加载，首次查询时自动打开