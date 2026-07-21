# 收尾与发布规划 (Release Roadmap)

## TODO: 1. 架构改造：后端逻辑前端化 (独立运行基础)
- [x] 将 SQLite 查询逻辑迁移至前端 (使用 sql.js)
- [x] 将 LLM API 调用直接移至前端发起 (llmService)
- [x] 彻底移除对 Node.js Express 后端的依赖

## TODO: 2. 词典按需下载功能
- [x] 设计启动引导页，提供词典下载选项 (DictionaryManager)
- [x] 实现词典文件的下载进度显示逻辑
- [x] 实现词典文件在本地 (IndexedDB) 的存储与读取
- [x] (可选) 提供“轻量版”词典下载选项 (已准备精简版数据库 stardict_lite.db)

## TODO: 3. 内置热更新机制
- [x] 建立版本号比对策略 (本地 vs 远程 version.json)
- [x] 实现前端资源包的静默下载与替换逻辑 (使用 @capgo/capacitor-updater)
- [x] 添加更新完成后的应用重载提示

## TODO: 4. 多端独立封装 (PC与移动端分离)
- [ ] PC端封装：集成 Tauri 或 Electron
- [ ] 移动端封装：集成 Capacitor
- [ ] 适配各端的本地文件系统权限 (用于读取词典)

## TODO: 5. 全面测试
- [ ] PC端独立运行与离线查词测试
- [ ] 移动端独立运行与离线查词测试
- [ ] 词典下载与热更新流程端到端测试

## TODO: 6. 发布 Release
- [ ] 编写 Release Notes
- [ ] 编译生成 .exe 和 .apk 安装包
- [ ] 将安装包及词典资源文件上传至 GitHub Release