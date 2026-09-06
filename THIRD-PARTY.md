# dsh-codevault — 《开源及第三方资源使用清单》

> 本文件是参赛材料《开源及第三方资源使用清单》的**雏形**，随插件仓库维护。
> 复核日期：见 git 提交。提交比赛前请逐行核对版本与许可证现状。

## 一、本插件的自研边界

dsh-codevault 为本团队自主开发（TypeScript 编写），自主实现内容包括：

- 领域模型与校验：`ReadingEntry`/subject 坐标、快记/深读笔记规则、tag 宽松规范化（`src/domain.ts`）；
- 档案存储与聚合：JSONL 原子追加、Markdown 卡片、仓库 hub、MOC 总览的生成与刷新、检索/统计（`src/store.ts`）；
- 模型工具：`read_capture` / `read_note` / `read_query` / `read_recent`（`src/tools.ts`）；
- "阅读框架"技能文本（`src/skill.ts`）与 `/codevault` 命令（`src/commands.ts`）；
- 测试：`smoke.mjs`（不依赖 cordis 的真实行为断言）。

AI 参与说明：插件开发过程中使用生成式大模型辅助编写与审查代码；涉及 AI 辅助生成的部分
均经人工阅读、修改与测试验证（见技术报告"AI 工具使用说明"）。AI 生成内容不被当然认定为自主知识产权，
本清单的自主开发边界以上述人工实现与验证为准。

## 二、运行时依赖（直接依赖，均为 MIT 许可证）

| 名称 | 版本 | 来源 | 许可证 | 使用方式 | 关键许可义务/限制 | 自主开发边界 |
|---|---|---|---|---|---|---|
| @deepseek-ai/cordis | 4.0.2 | npm / github.com/deepseek-ai | MIT | 插件宿主框架：插件以 `apply(ctx)` 挂载，利用其服务注册/生命周期 | 保留版权与许可声明；无再分发限制 | 仅作宿主，不改源码 |
| @deepseek-ai/dsh-tools | 0.1.2-rc.1 | npm（deepseek-harness 官方包） | MIT | 用 `defineTool` 定义 4 个模型工具 | 同上 | 仅调用其 API |
| @deepseek-ai/dsh-commands | 0.1.2-rc.1 | npm（官方包） | MIT | 注册 `/codevault` 斜杠命令 | 同上 | 仅调用其 API |
| @deepseek-ai/dsh-skill | 0.1.2-rc.1 | npm（官方包） | MIT | 注册 `code-reading` 技能框架 | 同上 | 仅调用其 API |
| @deepseek-ai/dsh-home-paths | 0.1.2-rc.1 | npm（官方包） | MIT | 解析数据根路径（`dshHomePath`） | 同上 | 仅调用其 API |
| @deepseek-ai/schemastery | 3.18.2 | npm（deepseek-harness 官方包） | MIT | 声明插件配置 `Config`（dataDir schema） | 同上 | 仅调用其 API |

## 三、开发期依赖（不随插件分发）

| 名称 | 版本 | 许可证 | 使用方式 | 说明 |
|---|---|---|---|---|
| typescript | 5.6.3 | Apache-2.0 | 将 `src/` 编译为 `lib/`（构建期） | 编译产物分发，编译器本身不打包 |
| @types/node | 22.x | MIT | TypeScript 类型定义（开发期） | 同上 |
| @deepseek-ai/*（6 包） | 同表二 | MIT | devDependencies 镜像 peer 依赖，供本地构建/测试 | 运行时由宿主 profile 提供 |

## 四、非代码依赖与生态整合（说明性）

| 名称 | 类型 | 关系 | 说明 |
|---|---|---|---|
| Obsidian | 桌面/移动 Markdown 笔记软件（不开源本体） | 可选查看端 | 插件**不打包、不调用** Obsidian；仅产出符合 Obsidian 解析规则的 Markdown + YAML front-matter + wikilink 文件。未使用 Obsidian 商标、API 或闭源代码。 |
| DeepSeek Harness（dsh） | 开源宿主（仓库 github.com/deepseek-ai/deepseek-harness） | 宿主运行环境 | 插件以官方 bundle/patch 协议装入 profile；复读对象亦常为该仓库源码（dogfooding）。 |
| 用户阅读的开源仓库 | — | 档案记录对象 | 插件不读取/不复制任何被读仓库内容，只记录用户主动提供的坐标与自撰理解文本。 |

## 五、合规要点核对（对应评审要求的"关键许可义务"）

- 署名与 LICENSE/NOTICE：本仓库携带 LICENSE（MIT）与本文件；第三方包许可随 node_modules 分发，不另行截留。
- 再分发：无闭源/传染性许可证依赖；Apache-2.0 编译器仅构建期使用，产物不含其代码。
- 衍生作品开放：本插件整体以 MIT 开放，满足所依赖 MIT 包的条件。
- 内容安全：档案正文由用户在对话中确认后落盘；插件不抓取网络内容，不处理个人信息。

> 提交前核对：npm 上各包最新版本与许可证如有变化，以 registry 元数据为准更新本表。
