---
name: dictionary-status
description: 词典资源状态与 Ultimate 版转换记录
type: project
---

- **Ultimate 版词典**: 已成功部署至本地开发环境。
- **数据量**: 4,324,665 条词目。
- **文件大小**: 1.13 GB (解压后)。
- **存储路径**: `client/public/stardict_full.db`。
- **部署状态**: 2026-07-23 完成。已通过 PowerShell 解压并移动至静态资源目录。
- **前端适配**: `database.ts` 会优先尝试加载 `/stardict_full.db`。`DictionaryManager.tsx` 已支持识别并下载该文件。
- **性能验证**: 已通过 Node.js 脚本验证数据库完整性，查询响应正常。
- **内存建议**: 1.1GB 数据库在浏览器中加载会占用大量内存 (ArrayBuffer)，建议在 8GB+ 内存的设备上使用，或考虑使用 IndexedDB 分片存储（待优化）。