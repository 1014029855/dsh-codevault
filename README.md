# dsh-codevault · 源码阅读档案

[![dsh plugin](https://img.shields.io/badge/dsh_plugin-DeepSeek_Harness-blue)](https://github.com/deepseek-ai/deepseek-harness)
[![release](https://img.shields.io/github/v/release/1014029855/dsh-codevault)](https://github.com/1014029855/dsh-codevault/releases)
[![license](https://img.shields.io/github/license/1014029855/dsh-codevault)](LICENSE)

读开源代码的时候，我们经常"这次懂了，下次又忘了"。这个插件干的事很简单：在读懂的那一刻记一笔，按仓库、文件、符号归档，以后想回看随时能翻出来。

档案就是 Markdown + JSONL 文件，可以直接用 Obsidian 打开。同一个对象（比如 `plugin.ts` 的 `apply` 机制）读多少次都记在同一张卡上，卡片会随着你的阅读长起来，不是一条条碎片流水账。


## 安装

已装 [dsh-market](https://github.com/dsh-market/dsh-market) 的话：

```sh
dsh plugin --profile web add dshmarket      # 第一次先装市场
# 然后在市场里搜 "dsh-codevault" 一键安装
```

或者手动：

```sh
dsh plugin --profile web add dsh-codevault
```


重启 dsh web，启动日志里出现 `[dsh-codevault] loaded` 就算装好了。

## 配置

数据默认写在 `<DSH_HOME>/data/dsh-codevault/`。建议把 `dataDir` 指到 Obsidian vault（或它的子目录），改 profile 的 `cordis.patch.yml`：

```yaml
# <DSH_HOME>/profiles/web/cordis.patch.yml
- id: dsh-codevault
  config:
    # 档案写入位置：默认 ~/.dsh/data/dsh-codevault；放进 Obsidian vault（或其子目录）最顺手
    dataDir: 'D:/Obsidian/源码阅读'
    # 可选：你的 Obsidian vault 根目录。配了之后模型才能只读搜你的笔记、给卡片挂链接
    vaultDir: 'D:/Obsidian'
```

改 `dataDir`/`vaultDir` 会触发 cordis 热替换，不用重启（新会话生效）。改环境变量 `DSCODEVAULT_DATA_DIR` 则要重启 dsh web。

配了 `vaultDir` 后，对话里模型可以只读检索你 vault 里的笔记（`vault_search` / `vault_read` / `vault_suggest`），找到值得关联的旧笔记，你确认后由 `read_link` 把 `[[链接]]` 补到卡片上。插件对 vault 只读，不会改动其他笔记。

## 怎么用

读完一个文件或机制，直接说：

> 把刚才读到的记一下：deepseek-harness 的 src/core/plugin.ts，apply 是插件入口。

模型会写 2–4 句要点（这个机制做了什么、关键点在哪、为什么这样设计）并起个标题。觉得值得深挖的，就说：

> 给 cordis 的 service 注入机制写一篇深读笔记。

它会按内置的 `code-reading` 技能框架写（对象坐标 → 机制 → 提炼/比较 → 存疑与回访），要求 ≥200 字。

几个常见场景：

- **重读同一段代码**：直接再记一次。不会开新卡，新事件会追加到那张卡的时间线里，顶部的 `readCount` 加一，各次提炼的要点去重合并。
- **先记后深**：读到一半先快记保底，之后说"把刚才那条 apply 的快记展开成深读笔记"，`read_expand` 会把这条快记原位升级成深读，同一张卡重写，文件名和链接都不漂移。
- **回看**：问"我最近读了哪些对象？"、"deepseek-harness 里读过什么？"，或输入 `/codevault`（用法）、`/codevault recent`（最近快照）、`/codevault history`（历史回放）、`/codevault vault`（当前数据目录与 Obsidian 接入指引）。
- **串起旧知识**：问"有没有我早先写过、和这个机制相关的笔记？"，`vault_suggest` 会给候选，你挑几篇，`read_link` 补链，卡片末尾会出现"关联 vault 笔记"一节。
- **回看当时的理解**：问"这个机制我上次是怎么理解的？"，`read_history` 会把那张卡倒回到第 N 次阅读或某个日期之前的版本——事件流只追加，所以任意时点的卡片都能精确重放。
- **记错了就删**：说"把刚才那条删掉"，`read_delete` 移除该条事件并重建卡片（需要确认，删了不可恢复）。

每次记录还可以带上 2–3 条**回访问题**（`revisit`）：卡片末尾会攒成一个"回访问题"小节，下次回看时先自己答一遍，再决定补什么——这不是装饰，是让档案在你回看时触发一次主动回忆。

## 工具一览

11 个工具：

- 记录：`read_capture`（快记）、`read_note`（深读笔记）、`read_expand`（快记升级）
- 检索：`read_query`（按仓库/路径/符号/标签查历史）、`read_recent`（最近读过）
- 历史与撤销：`read_history`（回放到第 N 次阅读 / 某日期之前）、`read_delete`（删除一条记录，需确认）
- vault 联动（配置 `vaultDir` 后可用）：`vault_search` / `vault_read` / `vault_suggest`（只读检索你已有的笔记）、`read_link`（补结构化链接）

另有 `/codevault` 命令和 `code-reading` 技能。

标签有个小纪律：`tags` 只接受档案里**已有**的标签（避免标签越攒越乱）；档案还没有任何标签时，第一批记录写入的标签会成为词表起点，之后要新增主题词就用 `newTags`。人工写过的标签永远保留。

## 数据目录

```
library.jsonl          # 唯一的记录源，只追加，别手改
notes/<对象名>.md       # 对象卡：同一个对象的所有阅读合并在这一张
                       #   每条时间线记录都带出处（坐标 + ref + 记录时间）
hub/<repo>.md          # 每个仓库一张清单
MOC.md                 # 总览
```

一条记录是一次阅读。对象按你给的最深坐标归并：`符号 > 文件 > 仓库`。卡片文件名用第一次记录时的标题（没给标题就退回坐标式，如 `plugin.ts-apply`），之后重读不用再给标题。

因为事件流只追加、卡片是生成出来的视图，删掉任何一条事件后卡片都能重建成正确的样子；也能用 `read_history` 看任意时点的那一版——版本历史不需要额外存储，它就是事件流本身。

卡片之间的 `[[wikilink]]` 由插件按坐标自动生成，Obsidian 图谱开箱即用；也可以自己手写 `[[链接]]`，把读过的机制和你自己的项目笔记串起来。

## 边界

- 纯本地：不读你的仓库、不联网、不调用外部 API，只写自己的数据目录。
- 正文由模型按技能框架写，工具只做校验、整理、落盘，所以行为是可测的。`smoke.mjs` 覆盖边界校验、对象卡聚合、历史回放、标签纪律、vault 关联与无损 JSON（无 cordis 依赖），改代码前后跑一下。
- 记不准就不编：repo/ref 拿不准不写，symbol 只在确实读到的时候填。
- 不做评分、没有"印象分"那套。档案记的是你读懂了什么，不是代码好不好。
- 工具不会自作主张：vault 关联、升级深读、删除记录都需要你确认（`read_link` / `read_expand` / `read_delete confirm=true`）。

## 开发

```powershell
pnpm install
pnpm run build      # tsc 编译 src -> lib
pnpm run typecheck  # 只查类型
node smoke.mjs      # 行为断言（真实 execute() + /codevault handler）
# 本地联调：dsh plugin --profile web add "file:$PWD"
```

改完记得同步提交 `lib/`（已入库，GitHub 源码安装直接可用，无构建步骤）。

## 更多文档

- [CHANGELOG.md](CHANGELOG.md) —— 版本变更记录
- [DESIGN.md](DESIGN.md) —— 设计规格与评审记录
- [DEMO-NARRATIVE.md](DEMO-NARRATIVE.md) —— 演示故事线（问题 → 快记 → 重读生长 → 知识库关联）
- [THIRD-PARTY.md](THIRD-PARTY.md) —— 开源及第三方资源清单
- [LICENSE](LICENSE) —— MIT

## 仓库结构

```
dsh-codevault/
├─ src/
│  ├─ index.ts      # 插件入口：配置 + 注册 11 个工具 + code-reading 技能 + /codevault
│  ├─ domain.ts     # 领域模型与校验（对象身份、tag/link/revisit 规范化、标签纪律）
│  ├─ store.ts      # 事件流存储 + 对象卡/hub/MOC 生成 + 历史回放
│  ├─ vault.ts      # Obsidian vault 只读访问（scope 分离、路径限定）
│  ├─ tools.ts      # 11 个工具的 defineTool 定义
│  ├─ skill.ts      # code-reading 阅读框架
│  └─ commands.ts   # /codevault 命令
├─ lib/             # 编译产物（已入库）
├─ smoke.mjs        # 无 cordis 冒烟测试
└─ cordis.patch.yml # dsh bundle 补丁
```
