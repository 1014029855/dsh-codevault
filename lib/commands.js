/**
 * /codevault — deterministic, model-free session command.
 *
 * A slash-command handler runs WITHOUT the model: it must be pure code.
 * That is why /codevault only prints usage, plain-text snapshots and vault
 * guidance; every content-creating action (capture / note) flows through the
 * chat so the model can shape it against the code-reading skill.
 */
import { archiveStats, dataRoot, recentEntries } from './store.js';
import { subjectLabel } from './domain.js';
export const READ_COMMAND_NAME = 'codevault';
function usageText() {
    const stats = archiveStats();
    const head = [
        'dsh-codevault · 源码阅读档案（本地数据根：' + dataRoot() + '）',
        '',
        '三种用法（直接对话即可，模型会帮你调用工具）：',
        '',
        '1) 快记：读完一个文件/符号/机制，说',
        '   “把刚才读到的记一下：deepseek-ai/deepseek-harness 的 src/core/plugin.ts，apply 就是插件入口。”',
        '2) 深读笔记：想深挖某个机制时直接说',
        '   “给 cordis 的 service 注入机制写一篇深读笔记。”',
        '   （会按 code-reading 技能：对象坐标 → 机制 → 提炼/比较 → 存疑与回访）',
        '3) 回看/统计：随时问',
        '   “我最近读了什么？” / “deepseek-harness 里我都读过哪些符号？”',
        '',
        '当前档案：' + stats.total + ' 条记录（' + stats.notes + ' 篇深读笔记 + ' + stats.captures + ' 条快记，覆盖 ' + stats.repos + ' 个仓库）。',
        '输入 /codevault vault 查看如何用 Obsidian 打开档案。',
    ].join('\n');
    return { kind: 'success', text: head };
}
function vaultText() {
    const root = dataRoot();
    const lines = [
        'dsh-codevault 的数据根目录是一个天然的 Markdown vault：',
        '  ' + root,
        '',
        '两种接入 Obsidian 的方式：',
        '1) 打开 Obsidian → "Open folder as vault" → 选择上面的数据根目录；',
        '2) 或先建/选一个已有 vault，再把数据根改成其子目录。',
        '',
        '如何自定义数据存放位置（优先级：插件配置 > 环境变量 > 默认目录）：',
        '· 插件配置：在 profile 的 cordis.patch.yml（或 ~/.dsh/cordis.patch.yml）里写',
        '    - id: dsh-codevault',
        '      config:',
        "        dataDir: 'D:/我的库/源码阅读'",
        '· 环境变量：DSCODEVAULT_DATA_DIR=<路径>（改后重启 dsh）。',
        '',
        '档案结构：',
        '  library.jsonl    # 唯一事实源（勿手改）',
        '  notes/<id>.md    # 每条记录一张卡（front-matter 坐标 + 正文 + 同仓链接）',
        '  hub/<repo>.md    # 每仓库一张 hub（时间线）',
        '  MOC.md           # 总览（仓库清单 + 最近阅读）',
        '',
        '图谱：卡片间与 hub/MOC 的 [[链接]] 由插件按坐标自动生成，Obsidian 图谱视图直接可用。',
    ].join('\n');
    return { kind: 'success', text: lines };
}
function recentText() {
    const stats = archiveStats();
    const recent = recentEntries(undefined, 5);
    const lines = [
        `源码阅读档案快照：${stats.objects} 个对象 / ${stats.total} 次阅读（${stats.notes} 篇深读 + ${stats.captures} 条快记，${stats.repos} 个仓库）`,
    ];
    if (recent.objects.length > 0) {
        lines.push('', '最近阅读对象：');
        for (const o of recent.objects) {
            lines.push(`- ${o.lastReadAt.slice(0, 10)} · ${o.title} · ${o.readCount} 次 (${o.noteFile})`);
            lines.push(`  ${subjectLabel({ repo: o.repo, path: o.path, symbol: o.symbol })}`);
        }
    }
    return { kind: 'success', text: lines.join('\n') };
}
/** Pure handler core, exported so smoke.mjs can test it without a cordis ctx. */
export function codevaultCommandHandler(rawInput) {
    const arg = rawInput.trim();
    try {
        if (arg === '')
            return usageText();
        if (arg === 'vault' || arg.startsWith('vault '))
            return vaultText();
        if (arg === 'recent' || arg.startsWith('recent '))
            return recentText();
        return {
            kind: 'success',
            text: ['/codevault 支持：空参数（用法）、/codevault vault（Obsidian 指引）、/codevault recent（快照）。', '', usageText().text ?? ''].join('\n'),
        };
    }
    catch (error) {
        return { kind: 'error', text: `读取源码阅读档案失败：${error instanceof Error ? error.message : String(error)}` };
    }
}
export function registerCodevaultCommand(ctx) {
    ctx.commands.register({
        name: READ_COMMAND_NAME,
        description: '源码阅读档案（dsh-codevault）：/codevault 用法；/codevault vault Obsidian 指引；/codevault recent 档案快照。',
        input: { hint: '留空 / vault / recent' },
        handler: (invocation) => codevaultCommandHandler(invocation.rawInput),
    });
}
//# sourceMappingURL=commands.js.map