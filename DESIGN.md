# dsh-codevault — 设计文档（V2 对象卡）

> 面向"认真读开源代码的人"的 DSH 插件：把每次"读懂代码"沉淀成可回访的个人阅读档案。
> 存储为 Markdown + JSONL，可作为/放进 Obsidian vault，用图谱、标签、搜索回看自己读过什么。
> V2：library.jsonl 存事件，Obsidian 卡片按"阅读对象"投影聚合（同一对象多读 = 一张活卡 + 时间线）。
> 申报赛道：方向（二）"AI 开发工具与开源协作"（附 dogfooding 兼述方向三）。本文为 V2 实现规格。

## 1. 定位与边界

- **不是**：
  - 不是"AI 读仓库 → 输出仓库地图/问答索引"（Repo Mind / CodeAsk / graphify 那片红海）；
  - 不是代码评审、提交信息、changelog、周报、任务看板等研发流程工具；
  - 不是聆听档案的代码版：**没有 0–10 评分、没有一句话"印象"、没有评分分布类统计**——读代码不是乐评；
  - 不扫描/不读取任何外部代码仓库内容，插件自身零网络，只写自己的数据目录。
- **是**：本地优先的**阅读事件档案**。闭环：
  1. **快记（10 秒）**：读完一个文件/符号/机制，记一条"读到了什么/关键点在哪"；
  2. **深读笔记（几分钟）**：按"阅读框架"写"对象坐标 → 机制 → 提炼/比较 → 存疑与回访"，落盘 Markdown；
  3. **回看**：按仓库/路径/符号/时间检索；每次写入自动刷新仓库 hub 与 MOC，Obsidian 图谱由坐标自动连线。
- 全数据存于数据根目录，纯文本可备份，可直接作为 Obsidian vault 打开或放进已有 vault 子目录。

## 2. 应用场景

1. **系统学一个开源项目（主场景）**：每天对话里读 `deepseek-harness` 这类框架的具体文件，
   读懂即快记/深读笔记；次日问"我昨天读到哪"即拉出进度与阅读史，无需翻聊天记录。
2. **技术调研存档**：选型/引入某库前读其源码的关键发现与坑入档；落地后回查免重读。
3. **写作/面试/提 PR 前**：对机制的准确理解与 takeaway 直接当素材；`repo@ref` 坐标保证引用可追溯。
4. **Obsidian 知识复利**：图谱按坐标自动连线、标签筛选、可手写 `[[链接]]` 与自己的项目笔记互联。
5. **比赛演示（dogfooding）**：开发本插件期间对 deepseek-harness 的真实阅读记录即档案；
   答辩可现场展示 Obsidian 图谱与 /codevault 快照——可运行、可验证、可讲述。

## 3. 用户故事（三条主流程）

1. **快记**：用户读完 `src/core/plugin.ts` 后说"把刚才读到的记一下" → `read_capture`
   （repo/path/symbol + 一句要点），落盘一张短卡片。
2. **深读笔记**：用户说"给 cordis 的 service 机制写篇深读笔记" → 模型按"阅读框架"技能组织正文，
   `read_note` 落盘 ≥200 字，沉淀记录并刷新 hub/MOC。
3. **回看**：用户说"我这周读了哪些仓库？"/"deepseek-harness 读过什么"，或直接打开 Obsidian 看
   `MOC.md` 与 hub 时间线；检索走 `read_query` / `read_recent`，纯代码快照走 `/codevault`。

## 4. 数据模型与存储

数据根：`dshHomePath('data', 'dsh-codevault')`，可用 `DSCODEVAULT_DATA_DIR` 覆盖。
默认根目录本身可被 Obsidian "打开为 vault"；也可把该变量指向已有 vault 的某个子目录。

```
<root>/
  library.jsonl     # 唯一事实源：EVENTS（一行一次阅读），只追加、原子写
  notes/<file>.md   # 对象卡（投影）：同一对象的所有事件合并到一张卡
                    #   头部(计数/首末时间) + 阅读时间线 + 全部提炼要点（去重）
  hub/<slug>.md     # 每个仓库一张 hub：该仓库的全部对象卡清单（自动维护）
  MOC.md            # 总览：仓库清单/对象计数/最近阅读对象（自动维护）
```

**V2 核心模型：事件流与对象卡分离**（裁决见 §10）
- `library.jsonl` 只存**阅读事件**（每次 read_capture/read_note 一条），可回放、可统计；
- Obsidian 卡片是**对象投影**：`objectKey(subject)`（symbol → repo+path+symbol；path → repo+path；仅 repo）相同的事件合到一张对象卡；
- 卡片文件名在对象**首个事件**定名并冻结（存于每行 `noteFile`），重读只往时间线追加、绝不新建 `-2` 卡；
- 升级（read_expand）作用于单事件，效果落在其对象卡（同一文件重写）。

### 档案事件（ReadingEntry，library.jsonl 每行）

```jsonc
{
  "id": "C8f2k1",
  "kind": "capture" | "note",
  "readAt": "2026-09-05T10:20:00.000Z",
  "subject": {
    "repo": "deepseek-ai/deepseek-harness",   // 必填；支持 owner/name 或本地名
    "ref": "0.1.2-rc.1",                       // 可选：版本/commit/分支，拿不准不填
    "path": "src/core/plugin.ts",              // 可选：文件相对路径
    "symbol": "apply"                          // 可选：函数/类/模块/符号
  },
  "context": "读插件加载机制时追到 apply 的调用链。",  // 可选：为什么读到这/当时问题
  "title": "cordis 声明式依赖注入机制",               // 可选：内容标题（对象首事件的 title 成为文件名）
  "note": "要点 2–4 句（capture 必填）",
  "bodyMarkdown": "…",                               // note 正文（≥200 字）
  "takeaway": ["可复用要点 1", "要点 2"],             // note 推荐 ≥1
  "tags": ["cordis", "依赖注入"],                     // 可选自由主题词（Obsidian 检索用，不进统计）
  "noteFile": "cordis 声明式依赖注入机制",            // 所属对象卡的冻结文件名（无 .md）
  "updatedAt": "…"
}
```

- 事件读取：整文件流式解析；写入：**原子追加**（同盘 tmp+rename）；进程内同步 IO；多会话最后写者胜（V1 接受）。
- **回访语义（V2）**：同一对象再读 = 新事件，追加进该对象的卡片时间线（新→旧），
  卡片顶部 `readCount` 累计、`全部提炼要点` 跨事件去重合并——理解随重读生长，碎片消失。
- **旧数据兼容**：V1 事件卡（每行独立 noteFile）由 `migrateLegacyNoteFiles()` 在 apply 时幂等合并为对象卡
  （同对象行共享一个 noteFile；无改名需要时也会重投影为 V2 卡片布局）。

### 卡片 front-matter 与 Obsidian 链接

- 每张卡 front-matter（YAML 单行标量）写全坐标：`id/kind/readAt/title/repo/ref/path/symbol/context/tags/takeaway`；
- 卡片 **front-matter**（对象卡）：`kind:object/noteFile/readCount/firstReadAt/lastReadAt/title/repo/path?/symbol?/tags`；
- **对象卡正文结构**：`# 标题` + 坐标/次数头 + `## 阅读时间线（新→旧）`（每条事件一段：
  日期+类型+id、为什么读到这、快记 note 或深读正文）+ `## 全部提炼要点（去重合并）` + `## 同仓其他对象`；
- **对象身份**：`objectKey(subject)` —— 给了 symbol 就是 (repo,path,symbol)；只给 path 是 (repo,path)；仅 repo 是 (repo)。
  同对象事件共享一张卡；坐标写法漂移会把对象拆成两张卡（技能约束模型保持一致写法）；
- 卡片文件名 = **对象首个事件** title 的清洗版（`cardFileName`：保留 CJK/字母数字/`._-`，其余换 `-`，限长 72），
  重名自动 `-2/-3`，冻结进每行 `noteFile` 后不再变化，保证链接稳定；
- 卡片底部"同仓其他对象"：同 repo 的其它对象卡 `[[notes/<noteFile>|标题]]`；
- 卡片新增"**关联 vault 笔记**"小节：模型写在正文/提炼里的**外部 wikilink**（非 `notes/`/`hub/` 前缀，
  如 `[[ReAct、Plan-and-Solve、Reflection]]`）会被汇总成可扫视清单；占位词（"链接"等）自动过滤；
- `hub/<slug>.md`：每仓库一张，列出该仓库全部对象卡（标题/次数/最近）；
- `MOC.md`：仓库清单 + 最近阅读对象 → **图谱的边由结构化坐标自动生成**，不依赖手写链接；
  用户仍可随意补 `[[…]]`。slug 由 repo 名清洗而来（小写、字母数字、`_-.`、其余换 `-`；空则加短哈希兜底）。

## 5. 模型工具（`ctx.tools.register` + `defineTool`）

| 工具 | 用途 | 关键参数 | canonical 输出 |
|---|---|---|---|
| `read_capture` | 快记一次阅读（事件） | `subject{repo,ref?,path?,symbol?}`、`title?`、`context?`、`note`、`tags?` | `{id, kind, repo, notePath, libraryCount}` |
| `read_note` | 落一篇深读笔记（事件） | `subject`、`title?`、`context`(必填)、`bodyMarkdown`(≥200)、`takeaway[]`、`tags?` | `{id, kind, repo, notePath, libraryCount}` |
| `read_expand` | 把已有快记事件升级为深读（原位） | `id`、`context?`、`bodyMarkdown`(≥200)、`takeaway[]` | `{id, kind:note, repo, noteFile, notePath}` |
| `read_query` | 检索档案（对象视图） | `filter{repo?, path?, symbol?, tag?, kind?, since?}`、`limit` | `{total, objects[]}`（objects 含 readCount/first/last/tags/events[]） |
| `read_recent` | 最近阅读对象快照 | `days?`、`limit?`(默认 8) | `{total, objects[]}` |
| `vault_search` | 只读检索 Obsidian vault（正文/标题/标签/目录） | `query?/title?/tag?/folder?/scope?/limit` | `{total, notes[]}`（path/basename/title/tags/inArchive/snippet） |
| `vault_read` | 只读读取 vault 内一篇笔记（限量） | `path`(vault 相对)、`maxChars?` | `{path, content}` |
| `vault_suggest` | 按主题词/tag 找候选相关用户笔记（排序） | `words[]`、`limit?` | `{total, suggestions[]}`（含 matched/hits） |
| `read_link` | 给事件补结构化外部链接（去重、不改正文） | `id`、`links[]` | `{id, kind, links[], notePath}` |

- 语义：模型负责写作（按技能框架），工具只做结构/校验/持久化/聚合/刷新投影——确定性、可回放、可 smoke。
- **快记正文容量**：`note` ≤2000 字符（2–4 句：机制/关键点/为什么），不再是"一句话"。
- **对象卡聚合**：capture/note 是"事件"；落到 Obsidian 时按 objectKey 归并到同一对象卡。
- **先记后深**：`read_expand` 用事件 id 定位，原位补正文/takeaway、kind 变 note；该事件所属对象卡被重写（同一文件不换名）。
- **补链闭环**：`vault_suggest`（只读候选）→ 用户确认 → `read_link` 追加事件 `links[]`（去重、≤20）；
  卡片"关联 vault 笔记"小节 = 各事件 `links[]` ∪ 正文中采集的外部 wikilink（`[[notes/]]`/`[[hub/]]` 与占位词排除），渲染统一去重。
- **无损 JSON**：所有工具输出不含 `undefined` 键（宿主校验会拒绝"非无损 JSON"），smoke 用 lossless 断言守护。
- 错误：`repo` 缺失/空、`bodyMarkdown` 过短、`note` 空、升级不存在的 id / 已升级的 note → throw（isError），不落任何数据。

## 6. "阅读框架"技能（`ctx.skills.register`）——本插件的魂

注册名：`code-reading`。激活时机：模型判断用户正在读源码、希望记录"读懂了什么"或回看档案时加载。

### 6.1 核心姿势（技能前言）
> 你不是在写读后感，而是在**给这次阅读存档坐标**：先写清"读了仓库/文件/符号里的什么机制、它为什么长这样"，
> 再写清"我因此多懂了什么、还能怎么用"。给具体名字（repo、版本、函数、调用关系），不要泛泛而谈。
> 不要给代码打分或写情绪化"印象"——档案记的是**理解**，不是评价。

### 6.2 深读笔记模板骨架
1. **对象坐标**：repo@ref；path；symbol；它处在什么位置（谁调用它、它调用谁、为什么存在）。
2. **机制**：它怎么工作——关键路径/数据流/数据结构，以及 1–2 个最值得记住的设计决定与取舍。
3. **提炼与比较**：可复用的要点；与已知另一种实现/标准库方案比较，差异点。
4. **存疑与回访**：没搞懂的、想验证的、待版本更新后复查的点。

### 6.3 记录约定（约束模型如何调用工具）
- 快记 → `read_capture`：note 写 2–4 句（是什么机制/关键点/为什么），尽量给 title；
- 先记后深 → 对已有快记调 `read_expand`（原位升级，同卡重写，不重报坐标）；
- 深挖 → 先想清坐标，`read_note`，中文 ≥200 字，`takeaway` ≥1，`context` 必填；
- 事实纪律：repo/path/symbol 写准确；`ref` 拿不准不编造、省略；symbol 只在确实读到该符号时填；
- 完成后用返回 id/路径做一句简短确认。

## 7. 会话命令（`ctx.commands.register`，纯代码）

| 命令 | 行为 |
|---|---|
| `/codevault` | 用法 + 当前条数/仓库数 + 数据根路径 + 最近 5 条 |
| `/codevault vault` | vault 打开指引（路径、如何在 Obsidian 打开/挂载） |

其余动作走对话（模型 → 工具）。

## 8. 插件骨架

```
dsh-codevault/
  package.json  cordis.patch.yml  tsconfig.json  LICENSE  .gitignore
  THIRD-PARTY.md                  # 《开源及第三方资源使用清单》雏形（评审材料附件可直接扩展）
  src/
    index.ts    # apply(ctx)：注册 skills + tools + commands，准备数据目录
    domain.ts   # ReadingEntry / subject 校验等纯函数（无 I/O）
    store.ts    # JSONL 原子追加 + notes/hub/MOC 写与刷新 + slug
    tools.ts    # read_capture / read_note / read_query / read_recent
    skill.ts    # "阅读框架"技能文本（§6）
    commands.ts # /codevault
  DESIGN.md  smoke.mjs  README.md
```

## 9. 验收标准（V2 完成 = 全部通过）

1. `pnpm run build` 零错误；`node smoke.mjs` 全过（校验边界拒绝、原子写入、对象卡聚合、同对象多读=一卡、
   时间线/合并提炼、read_expand 原位升级、迁移幂等、无损 JSON）。
2. 装入 web profile 重启后日志出现 `[dsh-codevault] loaded`；旧库自动迁移为对象卡。
3. 对话演练用户故事各一次；落盘文件可被 Obsidian 打开，对象卡时间线/提炼与 hub/MOC 对应。
4. 数据根结构符合 §4；删一条事件后其对象卡正确重建或移除，不影响其他对象。
5. THIRD-PARTY.md 与实际依赖一致（名称/版本/来源/许可证/使用方式/自研边界）。

## 10. 定稿决议（评审待定项 → 结论）

| 项 | 决议 |
|---|---|
| 插件 id / 技能 / 命令 | `dsh-codevault` / 技能 `code-reading` / 命令 `/codevault`（与内置查重后再定） |
| 对象模型（V2） | `library.jsonl` = 事件流（只追加）；Obsidian 卡 = 对象投影（`objectKey` 归并），一对象一卡，重读进时间线 |
| 卡片命名 | 对象首事件 title 清洗版；省略则坐标式；同标题 `-2/-3`；冻结进 `noteFile`；V1 数据由迁移合并 |
| 配置项 | `dataDir`（插件配置 > env `DSCODEVAULT_DATA_DIR` > 默认目录）；`vaultDir`（可选，只读 vault 根）；cordis standard Config + schemastery |
| vault 上下文 | `vaultDir` 配置后 `vault_search`/`vault_read` 只读生效（忽略 .obsidian/node_modules/.git/.dsh*；路径限定 vault 内）；`scope` 区分 user（默认，排除档案卡）/archive/all，命中带 `inArchive` 标记；卡片"关联 vault 笔记"小节汇总外部 wikilink |
| tags | 保留可选自由词（Obsidian 检索用），宽松校验：trim→小写→压缩空白→2–40 字符；不做统计 |
| context | 深读笔记必填、快记可选 |
| repo 格式 | 接受 `owner/name` 或本地名；hub 文件名用清洗后 slug（空则哈希兜底） |
| 回访 | 同一对象重读 = 追加事件到同一张卡（时间线 + 合并 takeaway），理解随重读生长 |
| 事件升级 | read_expand 用事件 id 原位补正文；对象卡同文件重写，不新建卡 |

## 11. 参赛对齐（材料由用户撰写；本插件提供数据基础）

对照 AIC·AI+开源评分规则（问题与场景价值 15 / 创新性 20 / AI 与开源融合 20 / 实现完成度 25 / 开放成果 15 / 材料 5）：

- **方向**：申报"AI 开发工具与开源协作"（其说明点名"代码理解与辅助、知识库与检索"——本插件正中）。
- **AI 必要性**：正文的"理解"由模型按技能框架产出；**插件本体贡献在确定性结构层**——坐标校验/事实纪律、
  JSONL 原子追加、hub/MOC/图谱链接自动生成、检索聚合。报告中对比"无插件 = 读过即忘、聊天记录沉底"。
- **开源融合**：宿主 DeepSeek Harness（cordis 生态）+ Obsidian 文件格式（不打包 Obsidian 本体）+ 阅读对象为开源仓库；
  逐项披露见 `THIRD-PARTY.md`（来源/版本/许可证/使用方式/自研边界/许可义务）。
- **可验证**：smoke 断言 + 对话实录 + dogfooding 阅读档案；演示视频 3–5 分钟按 §9 验收录制即可。
- **材料完整性**：初赛 = 形式审查；技术报告 ≤15 页 PDF ≤10MB；附《开源及第三方资源使用清单》；成果链接需评审期有效。
- **公平性**：报告/视频/PPT 不得出现学校名称、LOGO、指导教师信息（录制演示时注意）。
- **AI 工具使用说明**：插件开发过程中 AI 参与环节（本对话）应在报告"团队分工与过程记录/关键实现"中如实说明。

## 12. 开工前查证（实现时确认，不阻塞评审）

- 命令名 `/codevault` 与 dsh 内置命令查重（冲突则前缀族 `/cr` 或改 `read` 风格）。
- skill 是否需要用户手动启用（若影响，把框架前 300 字放进工具 description 兜底）。
- dsh web 新会话生效时机（dsh-textkit/listening 已验证过）。
