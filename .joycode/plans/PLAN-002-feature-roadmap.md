# 功能路线图 - 收藏体系 + 词组标注 + 长难句增强 + 熟词生义

## 核心设计决策

### 决策1：词组标注方案 → 本地为主 + LLM 按需
- 文章加载时用 ECDICT 本地搭配数据扫描标注（零 token）
- 用户点击标注的词组 → 按需调 LLM 看语境含义（复用现有 /api/word-context）
- 理由：一篇文章几百词全扫 LLM 太贵，本地数据覆盖大部分常见搭配

### 决策2：收藏体系 → 统一收藏本 + 类型标签
- 一个 CollectionStore 管所有收藏，每条带 type 字段
- 类型：word（单词）/ phrase（词组）/ grammar（语法点）/ sentence（长难句）
- 顶部 tab 筛选，默认显示全部
- 熟词生义收藏的单词额外打 tag: "熟词生义"
- 理由：一个入口，维护简单，用户不迷路

### 决策3：来源追踪 → 收藏时缓存来源句子
- 每条收藏存 sourceSentence + sourceTranslation
- 整篇文章收藏 → 文章顶部收藏按钮 + hover 问号提示

---

## TODO: P0 - 统一收藏本基础

- [ ] 设计 CollectionItem 数据模型
  ```
  { id, type: 'word'|'phrase'|'grammar'|'sentence',
    content, meaning, sourceSentence, sourceTranslation,
    tags: string[], createdAt, reviewCount, lastReviewAt }
  ```
- [ ] 后端：创建 collection.db + CRUD API（/api/collection）
- [ ] 前端：collectionStore.ts（Zustand）
- [ ] 前端：CollectionPanel 组件（侧边栏/底部面板）
- [ ] 收藏/取消收藏交互（各入口统一调 addCollection / removeCollection）

## TODO: P1 - 单词本 + 背单词

- [ ] 查词弹窗加"收藏生词"按钮 → type=word
- [ ] 收藏本 word 类型展示：单词 + 音标 + 释义 + 来源句子
- [ ] 简易复习模式：随机抽取 → 显示单词 → 点击翻转看释义 → 标记认识/不认识
- [ ] 复习算法：不认识的加权出现（简化版 SM-2）

## TODO: P1 - 词组标注 + 词组收藏

- [ ] 后端：/api/scan-phrases 接口（段落文本 → 本地搭配匹配结果）
- [ ] 前端：ArticleView 加"词组标注"开关（类似长难句开关）
- [ ] 标注的词组可点击 → 弹窗显示词组释义 + 语境含义（按需 LLM）
- [ ] 词组弹窗加"收藏词组"按钮 → type=phrase
- [ ] 收藏本 phrase 类型展示：词组 + 释义 + 来源句子

## TODO: P2 - 长难句分析增强

- [ ] 增强 /api/analyze-sentence-detail 的 LLM prompt：
  - 新增 phrases 字段：句中词组搭配列表
  - 新增 patterns 字段：固定句型（如 It is...that...）
  - 新增 examPoints 字段：常考考点提示（可选，LLM 判断有无）
- [ ] SentenceAnalysis 组件增加展示区域：
  - 词组搭配卡片（可点击收藏）
  - 固定句型标注
  - 考点提示（如有）
- [ ] 长难句整体收藏 → type=sentence

## TODO: P2 - 熟词生义

- [ ] 后端：/api/scan-uncommon-meanings 接口（LLM 扫描段落，标出熟词生义）
- [ ] 前端：ArticleView 加"熟词生义"开关
- [ ] 标红的熟词生义可点击 → 弹窗显示常见义 vs 本文义
- [ ] 收藏时自动打 tag: "熟词生义"，收藏本可按 tag 筛选
- [ ] 收藏本增加"熟词生义"专项复习模式

## TODO: 功能联动

- [ ] 文章顶部加"收藏本文"按钮 + hover 问号提示
- [ ] 收藏本中点击条目 → 展开详情（含来源句子 + 译文）
- [ ] 各标注开关状态持久化（localStorage）

---

## 技术要点

- 收藏数据存 SQLite（collection.db），与缓存库分开
- 词组本地扫描：用 ECDICT 的 collocations 字段做字符串匹配
- 熟词生义扫描：整段送给 LLM 一次处理（不是逐词），控制 token 消耗
- 所有 LLM 调用都走缓存，同一内容不重复消耗 token