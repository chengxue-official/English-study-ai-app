---
name: dictionary-status
description: 词典资源状态与 Ultimate 版转换记录
type: project
---

- **Ultimate 版词典**: 已成功从 `skywind3000/ECDICT-ultimate` 转换。
- **数据量**: 4,324,664 条词目。
- **文件大小**: 616.26 MB (已从项目目录移除，改为按需下载或手动导入)。
- **存储策略**: 为了精简项目体积，Ultimate 版词典不再随包分发。用户可通过 `DictionaryManager` 从云端下载或手动导入。
- **本地保留**: 仅保留精简版 (`stardict.db`, 2.4MB) 用于基础离线功能。
- **转换日期**: 2026-07-20。
- **技术细节**: 使用 Node.js 流式解析 CSV 并通过 SQLite 批量事务写入，解决了 358MB CSV 导致的 OOM 问题。
- **前端适配**: `DictionaryManager.tsx` 已更新，支持下载和手动导入 Ultimate 版。