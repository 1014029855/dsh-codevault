# dsh-codevault · 源码阅读档案

<!-- 徽章区：发布后请把 <owner>/<repo> 与版本替换为真实值 -->
[![npm version](https://img.shields.io/npm/v/dsh-codevault)](https://www.npmjs.com/package/dsh-codevault)
[![license](https://img.shields.io/npm/l/dsh-codevault)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-%40deepseek--ai%2Fcordis-blue)](https://github.com/deepseek-ai/deepseek-harness)

一个面向"认真读开源代码的人"的 DeepSeek Harness（dsh）插件：把每次"读懂代码"沉淀成
**可回访的个人阅读档案**。档案本身是 Markdown + JSONL，可当作 Obsidian vault 打开，
用图谱、标签、搜索回看自己读过什么。

定位一句话：**代码读者的第二本笔记本**——不是"AI 替你读仓库"（Repo Mind / CodeAsk 那类），
而是忠实记下"你在读仓库时搞懂了什么"。

## 为什么需要它

读开源代码学习最大的痛点是**读过就忘**：聊天记录沉底、昨天读到哪全凭记忆、同一段机制可能反复重读。
dsh-codevault 让你在读懂的瞬间花 10 秒记一笔（或让模型写一篇坐标式深读笔记），并自动把阅读
按"仓库 → 文件 → 符号"组织成**对象卡片**——同一个对象（如 `plugin.ts` 的 `apply` 机制）无论
重读多少次，都累积在同一张 Obsidian 卡上，Obsidian 里是一张会生长的活卡，而不是碎片流水账。

## 快速开始（含 Obsidian 联动的最小配置）

装好插件并重启后，把下面这段放进 profile 的 `cordis.patch.yml`
（路径按你的机器改；`<DSH_HOME>` 默认 `~/.dsh`）：

```yaml
# <DSH_HOME>/profiles/web/cordis.patch.yml 或 ~/.dsh/cordis.patch.yml
- id: dsh-codevault
  config:
    # 档案写入位置：默认 ~/.dsh/data/dsh-codevault；建议放进 Obsidian vault（或它的子目录）
    dataDir: 'D:/Obsidian/源码阅读'
    # 可选：你的 Obsidian vault 根目录 —— 开启"只读关联"：
    # vault_search / vault_read / vault_suggest 可检索你已有的笔记，
    # read_link 把卡片与它们 [[链接]] 起来
    vaultDir: 'D:/Obsidian'
```

然后：`dsh plugin --profile web add dsh-codevault`（或从 dsh-market 安装）→ 重启 dsh web →
对话里说"记一下"即可。把 `dataDir` 目录用 Obsidian "Open folder as vault" 打开，
就能看到档案图谱。详见下方「自定义数据存放位置」与「接入 Obsidian」。

## 功能速览

- **快记 / 深读 / 先记后深**：`read_capture`（2–4 句要点）、`read_note`（≥200 字坐标式正文）、
  `read_expand`（把已有快记原位升级为深读，同一卡片重写、链接不漂移）；
- **对象卡投影**：同一阅读对象的多次事件合并为一张卡（阅读时间线 + 全部提炼要点去重合并），
  事件流与 Obsidian 视图分离——JSONL 只追加、卡片/hub/MOC 均为可重建派生视图；
- **Obsidian 双向上下文（只读）**：配置 `vaultDir` 后，`vault_search` / `vault_read` /
  `vault_suggest` 把 vault 变成模型可读的关联上下文；`read_link` 给事件补结构化链接，
  卡片自动生成"关联 vault 笔记"小节；
- **纯本地零网络**：不读你的仓库、不调用任何 API，只写自己的数据目录；
- **确定性可测试**：工具只做结构/校验/持久化/聚合，正文由模型按内置"code-reading"技能写作；
  104 项无 cordis 冒烟断言守护核心行为。

## 安装

**从 dsh market 安装**（若已装 [dsh-market](https://github.com/dsh-market/dsh-market)）：

```sh
dsh plugin --profile web add dshmarket      # 首次：装插件市场
# 然后在市场里搜 "dsh-codevault" 一键安装
```

**或手动从 npm 安装**：

```sh
npm i -g dsh-codevault    # 发布后可用
dsh plugin --profile web add dsh-codevault
```

**或从源码开发**：

```powershell
pnpm install && pnpm run build
dsh plugin --profile web add "file:$PWD"
# 并把 "dsh-codevault" 追加到 <DSH_HOME>/profiles/web/package.json 的 dsh.profile.bundles
```

重启 dsh web 后，启动日志应出现 `[dsh-codevault] loaded`。

## 用法（直接对话即可）

1. **快记**：读完一个文件/符号/机制，说
   "把刚才读到的记一下：deepseek-harness 的 src/core/plugin.ts，apply 是插件入口。"
   模型会写 2–4 句要点（机制/关键点/为什么）+ 内容标题（成为 Obsidian 文件名）。
2. **深读笔记**："给 cordis 的 service 注入机制写一篇深读笔记。"
   （按 `code-reading` 技能：对象坐标 → 机制 → 提炼/比较 → 存疑与回访）
3. **重读同一对象**：直接再记一次即可——它不会新建卡片，而是作为新事件追加到
   该对象的卡片时间线（新→旧），卡片顶部 `readCount` 累计，"全部提炼要点"跨事件去重合并。
4. **先记后深**：读到一半先快记保底，之后想深挖同一处时直接说
   "把刚才那条 apply 的快记展开成深读笔记"——插件会用 `read_expand` 原位升级该事件，
   对象卡被重写（文件名不变），链接不漂移。
5. **回看**："我最近读了哪些对象？" / "deepseek-harness 里读过什么？"
   或输入 `/codevault`（用法）、`/codevault vault`（Obsidian 指引）、`/codevault recent`（快照）。
6. **关联已有知识**："有没有我早先写过、和这个机制相关的笔记？" → `vault_suggest`
   列出候选 → 确认后 `read_link` 补链，卡片末尾出现"关联 vault 笔记"小节。

## 自定义数据存放位置

数据默认在 `<DSH_HOME>/data/dsh-codevault/`。按优先级支持三种方式：

1. **插件配置 `dataDir`（推荐）**：在 profile 层或 home 层的 `cordis.patch.yml` 中给本插件补配置：
   ```yaml
   # 例：~/.dsh/cordis.patch.yml 或 <DSH_HOME>/profiles/<profile>/cordis.patch.yml
   - id: dsh-codevault
     config:
       dataDir: 'D:/阅读档案'      # 档案写入位置（Obsidian vault 或其子目录）
       vaultDir: 'D:/Obsidian'     # 可选：vault 根，供模型只读检索/关联已有笔记
   ```
   改配置会触发 cordis HMR 热替换，无需重启（新会话生效）。
2. **环境变量** `DSCODEVAULT_DATA_DIR=<路径>`（改后需重启 dsh web）。
3. **默认**：`dshHomePath('data', 'dsh-codevault')`。

输入 `/codevault vault` 可随时查看当前实际数据根与接入指引。

### vaultDir：把 Obsidian 变成可读上下文（只读）

配置 `vaultDir` 后，模型在会话里可以只读检索/读取你 vault 里的笔记
（`vault_search` / `vault_read` / `vault_suggest`），把读码卡片和你已有的知识关联起来：

- **写前关联**：记卡片前用 `vault_search` 查有没有相关已有笔记，在正文里生成 `[[笔记名]]`；
- **写后补链**：落盘后想找"更早写过、值得关联"的笔记 → `vault_suggest`（按主题词/tag 排序给候选，
  只看你自己的笔记，不含档案卡）→ 你确认哪几篇 → `read_link` 补结构化链接（去重、不改正文）；
  卡片末尾自动生成"**关联 vault 笔记**"小节汇总这些 `[[链接]]`。

安全边界：**只读、路径限定在 vault 内、忽略 .obsidian/node_modules 等目录**，插件从不改动 vault 里的其他笔记。
`vault_search` 默认只搜你的笔记（scope=user），可显式 `scope=archive`/`all` 查询档案卡。

## 接入 Obsidian

- 方式一：Obsidian → "Open folder as vault" → 选择数据根目录（默认即自带 `MOC.md` 的合法 vault）。
- 方式二：把 `dataDir` 配置指向已有 vault 的子目录（见上），重启/热替换后自动写入。

档案结构：

```
library.jsonl          # 唯一事实源（事件流，勿手改）
notes/<对象名>.md       # 对象卡：同一对象的所有阅读合并在这一张卡
                       #   = 头部(读过 N 次) + 阅读时间线 + 全部提炼要点
hub/<repo>.md          # 每个仓库一张 hub（该仓库的对象卡清单）
MOC.md                 # 总览（仓库清单 + 最近阅读对象）
```

- **一对象一卡**：同一个阅读对象（坐标里给到的最深粒度：symbol > path > repo）的所有事件
  累积在同一张卡。重读时新事件追加进"阅读时间线"，不会新建 `-2` 碎片卡。
- **对象卡文件名** = 该对象首次记录的内容标题（如 "cordis 声明式依赖注入机制"）；没给 title
  时退回坐标式（如 `plugin.ts-apply`）。同一对象之后的重读不需要重复给 title。
- 卡片间的 `[[wikilink]]` 由插件按结构化坐标自动生成，Obsidian 图谱开箱即用；
  你也可以手写 `[[链接]]` 把读过的机制和自己项目的笔记串起来。

## 设计原则

- **无评分、无"印象句"**：档案记理解，不评代码（区别于同类聆听/乐评类插件的评分框架）。
- **创作与持久化分离**：正文由模型按技能框架写作，工具只做结构/校验/落盘/聚合 → 确定性、可回放、可测试。
- **纯本地、零网络**：插件不读外部仓库、不调用网络；只写自己的数据目录。
- **事实纪律**：repo/ref 拿不准不编造；symbol 只在确实读到时才填。

## 开发与验证

```powershell
pnpm run build      # tsc 编译 src -> lib
pnpm run typecheck  # 仅类型检查
node smoke.mjs      # 104 项无 cordis 的真实行为断言（校验边界/对象卡聚合/迁移/vault/补链/无损 JSON）
```

## 文档

- [DESIGN.md](DESIGN.md) —— 设计规格与评审记录（事件流与对象投影分离、对象卡、坐标纪律、参赛对齐）
- [DEMO-NARRATIVE.md](DEMO-NARRATIVE.md) —— 参赛/演示故事线（问题→快记→重读生长→知识库关联→dogfooding）
- [THIRD-PARTY.md](THIRD-PARTY.md) —— 《开源及第三方资源使用清单》（来源/版本/许可证/自研边界）
- [LICENSE](LICENSE) —— MIT

## 仓库结构

```
dsh-codevault/
├─ src/
│  ├─ index.ts      # 插件入口：Config(dataDir/vaultDir) + 注册 9 个工具 + code-reading 技能 + /codevault
│  ├─ domain.ts     # 领域模型与纯校验（对象身份 objectKey、tag/link 规范化、事实纪律）
│  ├─ store.ts      # 事件流存储 + 对象卡/hub/MOC 投影（全部可重建、原子写）
│  ├─ vault.ts      # Obsidian vault 只读访问层（scope 分离、路径限定、suggest 排序）
│  ├─ tools.ts      # read_capture/note/expand/query/recent + vault_search/read/suggest + read_link
│  ├─ skill.ts      # "code-reading"阅读框架技能（坐标式写作纪律）
│  └─ commands.ts   # /codevault 命令（用法/vault 指引/快照）
├─ smoke.mjs        # 无 cordis 冒烟测试（104 断言）
└─ cordis.patch.yml # dsh bundle 补丁（声名 dsh.bundle，供 dsh plugin add / market 安装）
```

## License

MIT，见 [LICENSE](LICENSE)。
