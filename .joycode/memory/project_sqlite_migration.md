---
name: sqlite-migration-native
description: 从 SQLite WASM/OPFS 迁移到原生 Capacitor SQLite 插件的记录
type: project
---

由于 WebView 的安全限制（缺少 COOP/COEP 头）导致 OPFS 同步接口在真机上不可用，项目已切换到原生插件方案。

**关键决策：**
- 使用 `@capacitor-community/sqlite` 处理原生数据库操作。
- 使用 `@capacitor/filesystem` 处理大文件的分块写入（Base64 转换）。
- `DatabaseService` 实现了双引擎切换：Web 环境继续使用 WASM Worker，原生环境使用 Native Bridge。

**How to apply:**
后续涉及数据库查询或文件导入的修改，需同时考虑 `dbWorker.ts` (Web) 和 `nativeDb.ts` (Native) 的同步。
导入大文件时必须使用 `nativeDb.importDatabase` 的分块逻辑以防 OOM。