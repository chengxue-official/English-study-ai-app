---
name: english-exam-app-project
description: 高中英语应试App项目状态和技术架构
type: project
---

## 项目状态 (2026-07-24)

### 当前版本: 0.1.2
- **核心修复**: 解决 1.1GB 词典导入 OOM 问题。
- **技术实现**: `Blob.slice` 分块读取 + 原生 SQLite 迁移。
- **稳定性**: 增加多名称探测、重试机制及深度诊断。

### 已完成功能
1. **文章翻译**: 粘贴导入、双栏展示、API 配置。
2. **单词查询**: ECDICT 词典、ClickableText、WordPopup。
3. **原生迁移**: 迁移至 Capacitor SQLite，支持超大文件。
4. **复习系统**: 艾宾浩斯曲线、拼写测试、音标发音。

### 技术架构
- **前端**: React + Vite + TS + Zustand + Tailwind。
- **原生**: Capacitor + SQLite + Filesystem。
- **词典**: ECDICT (2.4MB/1.1GB)。
- **热更新**: 支持逻辑层热更新。

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