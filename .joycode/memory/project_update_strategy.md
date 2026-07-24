---
name: update-strategy
description: 应用内热更新机制与资源分发策略
type: project
---

# 资源分发策略
1. 离线词典 (stardict.db):
   - 精简版: 放置在 client/public/stardict.db，随前端构建分发。
   - 全量版: 托管于 GitHub Releases，提供直链下载。
   - 手动导入: 支持用户通过 DictionaryManager 手动上传 .db 文件。
2. 热更新:
   - 机制: 通过 build-update.js 生成 zip 和 version.json。
   - 托管: 部署至 Cloudflare Pages (https://english-exam-app-updates.pages.dev/)。
   - 部署仓库: `deploy_tmp` 目录，对应 GitHub 仓库 `chengxue-official/english-exam-app-updates`。
   - 流程: 运行 `npm run build:update` 后，将 `client/update-dist/` 内容同步至 `deploy_tmp` 并推送。