/**
 * Model-facing tools of dsh-codevault.
 *
 * Division of labour (by design, same as dsh-listening):
 *  - The MODEL does the writing: it thinks against the code-reading skill and
 *    hands the plugin structured subject coordinates + finished prose.
 *  - The TOOLS only validate, persist, aggregate and refresh the hub/MOC.
 *    None of them "creates content", which keeps them deterministic and small.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { MIN_NOTE_BODY, applyTagPolicy, buildEntry, entryObjectKey, entryTitle, objectKey, subjectLabel, } from './domain.js';
import { addLinks, commitEntry, deleteEntry, expandEntry, groupByObject, noteFilePath, objectHistory, queryEntries, readEntries, recentEntries, tagsOfObjectKey, vocabularyTags, } from './store.js';
import { readVaultNote, searchVault, suggestVault, vaultRoot } from './vault.js';
function buildProposal(subject, tags, kind) {
    const key = objectKey(subject);
    const events = groupByObject(readEntries()).get(key) ?? [];
    const readCount = events.length;
    const hasNote = events.some((e) => e.kind === 'note');
    const suggestUpgrade = kind === 'capture' && !hasNote && readCount >= 2;
    const relatedNotes = [];
    if (vaultRoot() && tags.length > 0) {
        try {
            for (const s of suggestVault({ words: [...tags], limit: 3 }).suggestions) {
                relatedNotes.push({ basename: s.basename, path: s.path });
            }
        }
        catch {
            // Related-note discovery is optional context; never block a write.
        }
    }
    return { readCount, suggestUpgrade, relatedNotes };
}
/** Render at most `max` characters of card Markdown for a tool result. */
function clipMarkdown(markdown, max = 8000) {
    if ([...markdown].length <= max)
        return { text: markdown, truncated: false };
    return { text: `${[...markdown].slice(0, max).join('')}\n\n…（卡片较长，已截断）`, truncated: true };
}
/** Shared param: revisit questions (retrieval prompts stored with the event). */
const REVISIT_PARAM = {
    type: 'array',
    items: { type: 'string' },
    description: '可选 2–3 条"回访问题"：下次回看这张卡时用来逼自己重想机制（如"这个注入在生命周期哪一步触发？"），' +
        '不要写能直接搜到答案的琐碎问题。会合并进卡片的"回访问题"小节。',
};
/** Shared param: NEW tag words (bypasses the existing-vocabulary filter). */
const NEW_TAGS_PARAM = {
    type: 'array',
    items: { type: 'string' },
    description: '可选：确实要新增的主题词（不在已有标签表里时才用）。tags 只接受档案里已存在的标签，避免标签爆炸。',
};
const TAGS_PARAM = {
    type: 'array',
    items: { type: 'string' },
    description: '可选主题词（2–40 字符，自动小写），供 Obsidian 标签检索、不做统计。' +
        '只接受档案里已有的标签（或本对象已有的）；档案还没有任何标签时，第一批记录写入的标签会作为词表起点。全新主题词请放 newTags。',
};
/** Shared nested subject descriptor used by every tool. */
const SUBJECT_PARAM = {
    type: 'object',
    additionalProperties: false,
    description: '阅读对象坐标。repo 必填；ref/path/symbol 能确定才填，拿不准不编造。',
    properties: {
        repo: {
            type: 'string',
            required: true,
            description: '仓库标识（必填）：owner/name（如 deepseek-ai/deepseek-harness）或本地目录名。',
        },
        ref: {
            type: 'string',
            description: '可选：所读版本/commit/分支。拿不准就省略，不要编造。',
        },
        path: {
            type: 'string',
            description: '可选：文件相对路径（如 src/core/plugin.ts）。',
        },
        symbol: {
            type: 'string',
            description: '可选：读到的函数/类/模块/符号名。只在确实读到该符号时填。',
        },
    },
};
const SUBJECT_REQUIRED = { ...SUBJECT_PARAM, required: true };
// ---------------------------------------------------------------------------
export const readCaptureTool = defineTool({
    name: 'read_capture',
    description: '把一次阅读"快记"进源码阅读档案（dsh-codevault）：阅读对象坐标（repo 必填，ref/path/symbol 可选）' +
        ' + 内容要点（读到了什么机制/关键点在哪/为什么这样设计）+ 可选 title + 可选 context + 可选 tags。' +
        '用于读完一个文件/符号/机制后随手记一笔；之后可随时用 read_expand 把这条升级成深读笔记。',
    parameters: {
        subject: SUBJECT_REQUIRED,
        title: {
            type: 'string',
            description: '可选：简短内容标题（≤120 字符，会成为 Obsidian 里笔记的名字，如 "defineTool 一站推导类型"）。省略则用坐标自动生成文件名。',
        },
        note: {
            type: 'string',
            required: true,
            description: '要点（≤2000 字符）：这次读到了什么机制、关键点在哪、它为什么这样设计——写 2–4 句，别只写一句。',
        },
        context: {
            type: 'string',
            description: '可选：为什么读到这 / 当时在解决什么问题。',
        },
        revisit: REVISIT_PARAM,
        tags: TAGS_PARAM,
        newTags: NEW_TAGS_PARAM,
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'string', required: true, description: '档案条目 id。' },
                kind: { type: 'string', const: 'capture', required: true },
                repo: { type: 'string', required: true },
                notePath: { type: 'string', required: true, description: '已落盘的 Markdown 卡片绝对路径。' },
                libraryCount: { type: 'integer', required: true, description: '档案总条数。' },
                readCount: { type: 'integer', required: true, description: '该阅读对象累计阅读次数（含本次）。' },
                droppedTags: { type: 'array', required: true, items: { type: 'string' }, description: '被拒的标签（不在既有词表里）；需要时改用 newTags。' },
                suggestUpgrade: { type: 'boolean', required: true, description: '是否建议把该对象升级为深读笔记（建议，未执行）。' },
                relatedNotes: {
                    type: 'array',
                    required: true,
                    description: '可能相关的 vault 旧笔记候选（只读建议，未写入链接）。',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            basename: { type: 'string', required: true },
                            path: { type: 'string', required: true },
                        },
                    },
                },
            },
        },
        render: (args, value) => {
            const lines = [
                `已快记入源码阅读档案：${subjectLabel(args.subject)} · ${value.id}` +
                    (value.libraryCount > 1 ? `（档案共 ${value.libraryCount} 条）` : '（档案第一条！）'),
                `卡片：${value.notePath}`,
            ];
            if (value.droppedTags.length > 0) {
                lines.push(`（忽略了不在既有标签表里的：${value.droppedTags.join(', ')}——确实要新增请用 newTags）`);
            }
            if (value.suggestUpgrade) {
                lines.push(`这个对象已经读过 ${value.readCount} 次、还只有快记。要不要我用 read_expand 把它升级成一篇深读笔记？你确认我再动。`);
            }
            if (value.relatedNotes.length > 0) {
                lines.push(`可能相关的旧笔记：${value.relatedNotes.map((n) => `[[${n.basename}]]`).join('、')}（你确认哪几篇，我用 read_link 挂上）`);
            }
            return [{ type: 'text', text: lines.join('\n') }];
        },
    },
    async execute(args) {
        const vocabulary = vocabularyTags();
        const policy = applyTagPolicy(args.tags, args.newTags, vocabulary, tagsOfObjectKey(objectKey(args.subject)), vocabulary.length === 0);
        const entry = buildEntry({
            kind: 'capture',
            subject: args.subject,
            title: args.title,
            context: args.context,
            note: args.note,
            revisit: args.revisit,
            tags: policy.accepted,
        });
        const { notePath } = commitEntry(entry);
        const proposal = buildProposal(entry.subject, entry.tags, 'capture');
        return {
            id: entry.id,
            kind: 'capture',
            repo: entry.subject.repo,
            notePath,
            libraryCount: readEntries().length,
            readCount: proposal.readCount,
            droppedTags: [...policy.dropped],
            suggestUpgrade: proposal.suggestUpgrade,
            relatedNotes: proposal.relatedNotes.map((n) => ({ basename: n.basename, path: n.path })),
        };
    },
});
// ---------------------------------------------------------------------------
export const readNoteTool = defineTool({
    name: 'read_note',
    description: `把一篇源码深读笔记（正文 ≥${MIN_NOTE_BODY} 字，按"code-reading"技能模板：对象坐标 → 机制 → 提炼/比较 → 存疑与回访）` +
        '写入 dsh-codevault 档案：正文落盘为 Markdown 卡片，同时沉淀一条带坐标的记录并刷新仓库 hub 与 MOC。' +
        '写作由模型完成，本工具只负责持久化。context（为什么读到这）与至少 1 条 takeaway 为必填。',
    parameters: {
        subject: SUBJECT_REQUIRED,
        title: {
            type: 'string',
            description: '可选：简短内容标题（≤120 字符，会成为 Obsidian 里笔记的名字，如 "cordis 声明式依赖注入机制"）。省略则用坐标自动生成文件名。',
        },
        context: {
            type: 'string',
            required: true,
            description: '必填：为什么读到这 / 当时在解决什么问题（阅读动机是档案的坐标之一）。',
        },
        bodyMarkdown: {
            type: 'string',
            required: true,
            description: `笔记正文（Markdown，中文，≥${MIN_NOTE_BODY} 字）：对象坐标 → 机制 → 提炼/比较 →（可选）存疑与回访。`,
        },
        takeaway: {
            type: 'array',
            items: { type: 'string' },
            description: '至少 1 条：自己提炼的可复用要点。',
        },
        revisit: REVISIT_PARAM,
        tags: TAGS_PARAM,
        newTags: NEW_TAGS_PARAM,
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'string', required: true },
                kind: { type: 'string', const: 'note', required: true },
                repo: { type: 'string', required: true },
                notePath: { type: 'string', required: true, description: '已落盘的 Markdown 卡片绝对路径。' },
                libraryCount: { type: 'integer', required: true },
                readCount: { type: 'integer', required: true, description: '该阅读对象累计阅读次数（含本次）。' },
                droppedTags: { type: 'array', required: true, items: { type: 'string' }, description: '被拒的标签（不在既有词表里）。' },
                relatedNotes: {
                    type: 'array',
                    required: true,
                    description: '可能相关的 vault 旧笔记候选（只读建议，未写入链接）。',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            basename: { type: 'string', required: true },
                            path: { type: 'string', required: true },
                        },
                    },
                },
            },
        },
        render: (args, value) => {
            const lines = [
                `深读笔记已存档：${subjectLabel(args.subject)} · ${value.id}`,
                `笔记：${value.notePath}（档案共 ${value.libraryCount} 条）`,
            ];
            if (value.droppedTags.length > 0) {
                lines.push(`（忽略了不在既有标签表里的：${value.droppedTags.join(', ')}——确实要新增请用 newTags）`);
            }
            if (value.relatedNotes.length > 0) {
                lines.push(`可能相关的旧笔记：${value.relatedNotes.map((n) => `[[${n.basename}]]`).join('、')}（你确认哪几篇，我用 read_link 挂上）`);
            }
            return [{ type: 'text', text: lines.join('\n') }];
        },
    },
    async execute(args) {
        const vocabulary = vocabularyTags();
        const policy = applyTagPolicy(args.tags, args.newTags, vocabulary, tagsOfObjectKey(objectKey(args.subject)), vocabulary.length === 0);
        const entry = buildEntry({
            kind: 'note',
            subject: args.subject,
            title: args.title,
            context: args.context,
            bodyMarkdown: args.bodyMarkdown,
            takeaway: args.takeaway,
            revisit: args.revisit,
            tags: policy.accepted,
        });
        const { notePath } = commitEntry(entry);
        const proposal = buildProposal(entry.subject, entry.tags, 'note');
        return {
            id: entry.id,
            kind: 'note',
            repo: entry.subject.repo,
            notePath,
            libraryCount: readEntries().length,
            readCount: proposal.readCount,
            droppedTags: [...policy.dropped],
            relatedNotes: proposal.relatedNotes.map((n) => ({ basename: n.basename, path: n.path })),
        };
    },
});
// ---------------------------------------------------------------------------
export const readExpandTool = defineTool({
    name: 'read_expand',
    description: `把一条已有的快记（capture）"升级"为深读笔记：原位补充正文（≥${MIN_NOTE_BODY} 字，按 code-reading 技能模板）` +
        '与 takeaway，kind 变 note，同一张卡片文件被重写（文件名不变），hub/MOC 刷新。' +
        '用于"先随手记一笔、之后想深挖这条"的场景；需要先查 id（可用 read_query）。已有正文的 note 不能再升级。',
    parameters: {
        id: {
            type: 'string',
            required: true,
            description: '要升级的快记条目 id（read_capture 返回、或 read_query 查得）。',
        },
        context: {
            type: 'string',
            description: '可选：为什么读到这 / 当时在解决什么问题。仅当原快记没有 context 时用于补上（给了就覆盖）。',
        },
        bodyMarkdown: {
            type: 'string',
            required: true,
            description: `升级正文（Markdown，中文，≥${MIN_NOTE_BODY} 字）：对象坐标 → 机制 → 提炼/比较 →（可选）存疑与回访。`,
        },
        takeaway: {
            type: 'array',
            items: { type: 'string' },
            description: '至少 1 条：自己提炼的可复用要点。',
        },
        revisit: REVISIT_PARAM,
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'string', required: true },
                kind: { type: 'string', const: 'note', required: true },
                repo: { type: 'string', required: true },
                noteFile: { type: 'string', required: true, description: '卡片文件名（不含 .md，升级后不变）。' },
                notePath: { type: 'string', required: true, description: '被重写的 Markdown 卡片绝对路径。' },
            },
        },
        render: (args, value) => [
            {
                type: 'text',
                text: `已把快记 ${args.id} 升级为深读笔记：${value.repo} · ${value.noteFile}` +
                    `\n笔记（同一文件重写）：${value.notePath}`,
            },
        ],
    },
    async execute(args) {
        const updated = expandEntry(args.id, {
            context: args.context,
            bodyMarkdown: args.bodyMarkdown,
            takeaway: args.takeaway ?? [],
            revisit: args.revisit,
        });
        return {
            id: updated.id,
            kind: 'note',
            repo: updated.subject.repo,
            noteFile: updated.noteFile ?? updated.id,
            notePath: noteFilePath(updated),
        };
    },
});
// ---------------------------------------------------------------------------
export const readQueryTool = defineTool({
    name: 'read_query',
    description: '检索 dsh-codevault 源码阅读档案（按仓库/路径/符号/标签/类型/起始日期过滤），结果以"阅读对象"为单位返回' +
        '（同一坐标的多条记录合并为一个对象，见 objects[].events）。' +
        '用于回顾"我读过 X 仓库的什么"、找回某个对象的笔记、确认某符号是否读过、取事件 id 供 read_expand 升级。',
    parameters: {
        filter: {
            type: 'object',
            additionalProperties: false,
            description: '过滤条件（全部可选，可组合）。repo 精确匹配，path/symbol/tag/kind 作用于对象内的事件。',
            properties: {
                repo: { type: 'string', description: '仓库标识，大小写不敏感精确匹配（如 deepseek-ai/deepseek-harness）。' },
                path: { type: 'string', description: '文件路径子串（大小写不敏感）。' },
                symbol: { type: 'string', description: '符号名子串（大小写不敏感）。' },
                tag: { type: 'string', description: '精确标签（自动小写）。' },
                kind: { type: 'string', enum: ['capture', 'note'], description: '只查含快记或含深读笔记的对象。' },
                since: { type: 'string', description: '起始日期（ISO，YYYY-MM-DD）：对象最近阅读晚于此日期才命中。' },
            },
        },
        limit: {
            type: 'integer',
            default: 50,
            description: '最多返回对象数（1–200），默认 50。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                total: { type: 'integer', required: true, description: '命中对象总数（未受 limit 截断）。' },
                objects: {
                    type: 'array',
                    required: true,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            noteFile: { type: 'string', required: true, description: '对象卡文件名（不含 .md，Obsidian 笔记名）。' },
                            title: { type: 'string', required: true, description: '对象卡标题（首个事件的 title 或坐标）。' },
                            repo: { type: 'string', required: true },
                            path: { type: 'string' },
                            symbol: { type: 'string' },
                            readCount: { type: 'integer', required: true, description: '该对象累计阅读次数。' },
                            firstReadAt: { type: 'string', required: true },
                            lastReadAt: { type: 'string', required: true },
                            tags: { type: 'array', required: true, items: { type: 'string' } },
                            events: {
                                type: 'array',
                                required: true,
                                description: '该对象的全部阅读事件（新→旧），含每个事件的 id（供 read_expand 引用）。',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        id: { type: 'string', required: true },
                                        kind: { type: 'string', enum: ['capture', 'note'], required: true },
                                        readAt: { type: 'string', required: true },
                                        note: { type: 'string' },
                                        takeaway: { type: 'array', required: true, items: { type: 'string' } },
                                        summary: { type: 'string', required: true, description: '一句话摘要（不返回正文全文）。' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        render: (_args, value) => [
            {
                type: 'text',
                text: value.total === 0
                    ? '档案里没有匹配的记录。'
                    : [
                        `命中 ${value.total} 个对象${value.objects.length < value.total ? `（显示前 ${value.objects.length} 个）` : ''}：`,
                        ...value.objects.map((o, i) => {
                            const loc = [o.path, o.symbol].filter(Boolean).join(' → ');
                            const coord = o.repo + (loc ? ` · ${loc}` : '');
                            const kinds = [...new Set(o.events.map((e) => e.kind))];
                            const tagNote = kinds.includes('note') ? ' · 含深读' : ' · 仅快记';
                            const head = `${i + 1}. ${o.title} · ${o.readCount} 次 · 最近 ${o.lastReadAt.slice(0, 10)}${tagNote} (${o.noteFile})`;
                            const evLines = o.events.slice(0, 3).map((e) => `   - ${e.readAt.slice(0, 10)} ${e.kind === 'note' ? '深读' : '快记'} (${e.id}) — ${e.summary}`);
                            return [head, `   ${coord}`, ...evLines].join('\n');
                        }),
                    ].join('\n'),
            },
        ],
    },
    async execute(args) {
        const filter = args.filter ?? {};
        const since = filter.since?.trim();
        if (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(since)) {
            throw new Error('since 需为 YYYY-MM-DD 格式的 ISO 日期');
        }
        const result = queryEntries({
            repo: filter.repo,
            path: filter.path,
            symbol: filter.symbol,
            tag: filter.tag,
            kind: filter.kind,
            since,
        }, args.limit ?? 50);
        return {
            total: result.total,
            objects: result.objects.map((o) => ({
                noteFile: o.noteFile,
                title: o.title,
                repo: o.repo,
                ...(o.path ? { path: o.path } : {}),
                ...(o.symbol ? { symbol: o.symbol } : {}),
                readCount: o.readCount,
                firstReadAt: o.firstReadAt,
                lastReadAt: o.lastReadAt,
                tags: [...o.tags],
                events: o.events.map((e) => ({
                    id: e.id,
                    kind: e.kind,
                    readAt: e.readAt,
                    ...(e.note ? { note: e.note } : {}),
                    takeaway: [...e.takeaway],
                    summary: e.summary,
                })),
            })),
        };
    },
});
// ---------------------------------------------------------------------------
export const readRecentTool = defineTool({
    name: 'read_recent',
    description: '查看 dsh-codevault 最近阅读快照（跨仓库的"阅读对象"，按最近一次阅读倒序，默认 8 个对象）。' +
        '用于"我最近读了什么 / 读到哪里了"类回顾。',
    parameters: {
        days: {
            type: 'integer',
            description: '可选：只看最近 N 天内有阅读的对象。省略则全部。',
        },
        limit: {
            type: 'integer',
            default: 8,
            description: '最多返回对象数（1–50），默认 8。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                total: { type: 'integer', required: true, description: '命中对象总数。' },
                objects: {
                    type: 'array',
                    required: true,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            noteFile: { type: 'string', required: true },
                            title: { type: 'string', required: true },
                            repo: { type: 'string', required: true },
                            path: { type: 'string' },
                            symbol: { type: 'string' },
                            readCount: { type: 'integer', required: true },
                            lastReadAt: { type: 'string', required: true },
                            summary: { type: 'string', required: true },
                        },
                    },
                },
            },
        },
        render: (_args, value) => [
            {
                type: 'text',
                text: value.total === 0
                    ? '档案里还没有阅读记录。'
                    : [
                        `最近 ${value.objects.length} 个对象${value.objects.length < value.total ? ` / 共 ${value.total} 个` : ''}：`,
                        ...value.objects.map((o, i) => {
                            const loc = [o.path, o.symbol].filter(Boolean).join(' → ');
                            return `${i + 1}. ${o.title} · ${o.lastReadAt.slice(0, 10)} · ${o.readCount} 次 (${o.noteFile})\n   ${loc ? o.repo + ' · ' + loc : o.repo}\n   ${o.summary}`;
                        }),
                    ].join('\n'),
            },
        ],
    },
    async execute(args) {
        const days = args.days;
        if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 3650)) {
            throw new Error('days 需为 1–3650 的整数');
        }
        const result = recentEntries(days, args.limit ?? 8);
        return {
            total: result.total,
            objects: result.objects.map((o) => ({
                noteFile: o.noteFile,
                title: o.title,
                repo: o.repo,
                ...(o.path ? { path: o.path } : {}),
                ...(o.symbol ? { symbol: o.symbol } : {}),
                readCount: o.readCount,
                lastReadAt: o.lastReadAt,
                summary: o.events[0] ? o.events[0].summary : '',
            })),
        };
    },
});
// ---------------------------------------------------------------------------
// Vault context tools (direction A: vault as readable context)
// ---------------------------------------------------------------------------
export const vaultSearchTool = defineTool({
    name: 'vault_search',
    description: '只读检索用户配置的 Obsidian vault（vaultDir）里的 Markdown 笔记：按正文关键词/标题/标签/子目录过滤。' +
        '用于把源码阅读卡片与用户已有笔记（论文、项目、其他主题卡）建立 [[链接]] 关联——' +
        '在读码记录前先搜 vault 找"相关已有知识"。需要先配置 vaultDir；未配置会报错。' +
        '默认 scope=user 只搜用户自己的笔记（自动排除插件自己写的档案卡，避免自我引用噪音）；' +
        '需要查档案卡时显式用 scope=archive 或 scope=all。',
    parameters: {
        query: {
            type: 'string',
            description: '可选：正文/文件名子串（大小写不敏感）。',
        },
        title: {
            type: 'string',
            description: '可选：front-matter title 或文件名包含的子串。',
        },
        tag: {
            type: 'string',
            description: '可选：精确标签（自动小写）。',
        },
        folder: {
            type: 'string',
            description: '可选：vault 相对子目录（如 "论文"），只搜该目录下。',
        },
        scope: {
            type: 'string',
            enum: ['user', 'archive', 'all'],
            default: 'user',
            description: "检索范围：'user'（默认）= 只搜用户自己的笔记；'archive' = 只搜插件自己写的档案卡；'all' = 两者都搜。",
        },
        limit: {
            type: 'integer',
            default: 20,
            description: '最多返回条数（1–50），默认 20。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                total: { type: 'integer', required: true, description: '命中条数（未受 limit 截断）。' },
                notes: {
                    type: 'array',
                    required: true,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            path: { type: 'string', required: true, description: 'vault 相对路径（供 vault_read 读取）。' },
                            basename: { type: 'string', required: true, description: 'Obsidian 笔记名（不带 .md，可作 [[wikilink]]）。' },
                            title: { type: 'string', required: true },
                            tags: { type: 'array', required: true, items: { type: 'string' } },
                            inArchive: { type: 'boolean', required: true, description: '是否插件自己写的档案卡（非用户笔记）。' },
                            snippet: { type: 'string', required: true, description: '匹配上下文片段（截断）。' },
                        },
                    },
                },
            },
        },
        render: (_args, value) => [
            {
                type: 'text',
                text: value.notes.length === 0
                    ? 'vault 里没有匹配的笔记。'
                    : [
                        `vault 命中 ${value.total} 条${value.notes.length < value.total ? `（显示前 ${value.notes.length} 条）` : ''}：`,
                        ...value.notes.map((n, i) => {
                            const mark = n.inArchive ? '（档案卡）' : '';
                            return `${i + 1}. [[${n.basename}]]${mark}（${n.path}）${n.tags.length > 0 ? ` #${n.tags.join(' #')}` : ''}\n   ${n.snippet}`;
                        }),
                    ].join('\n'),
            },
        ],
    },
    async execute(args) {
        const result = searchVault({
            query: args.query,
            title: args.title,
            tag: args.tag,
            folder: args.folder,
            scope: args.scope,
            limit: args.limit,
        });
        return {
            total: result.total,
            notes: result.notes.map((n) => ({
                path: n.path,
                basename: n.basename,
                title: n.title,
                tags: [...n.tags],
                inArchive: n.inArchive,
                snippet: n.snippet,
            })),
        };
    },
});
export const vaultReadTool = defineTool({
    name: 'vault_read',
    description: '只读读取用户配置的 Obsidian vault 里一篇笔记的内容（vault 相对路径，见 vault_search 返回的 path）。' +
        '内容默认截断到 8000 字符。用于引用已有笔记细节 / 判断某篇是否真的与当前读码相关。只读不改写。',
    parameters: {
        path: {
            type: 'string',
            required: true,
            description: 'vault 相对路径（如 源码阅读/xxx.md 或 论文/yyy.md）。',
        },
        maxChars: {
            type: 'integer',
            default: 8000,
            description: '最多返回字符数（1–50000），默认 8000。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                path: { type: 'string', required: true },
                content: { type: 'string', required: true, description: '笔记正文（可能截断并注明）。' },
            },
        },
        render: (_args, value) => [
            { type: 'text', text: `读 vault 笔记 ${value.path}：\n\n${value.content}` },
        ],
    },
    async execute(args) {
        const maxChars = Math.min(Math.max(1, Math.floor(args.maxChars ?? 8000) || 8000), 50000);
        const result = readVaultNote(args.path, maxChars);
        return { path: result.path, content: result.content };
    },
});
// ---------------------------------------------------------------------------
// Related-link discovery & persistence (direction A polish #3)
// ---------------------------------------------------------------------------
export const vaultSuggestTool = defineTool({
    name: 'vault_suggest',
    description: '按主题词/tag 在 Obsidian vault 里找"可能相关的用户笔记"候选并排序（只读，只看用户自己的笔记，不碰档案卡）。' +
        '用于深读/快记落盘后建议可关联的已有知识：先 vault_suggest，把候选列给用户确认，再用 read_link 补链。',
    parameters: {
        words: {
            type: 'array',
            required: true,
            items: { type: 'string' },
            description: '主题词/机制名/标签（如 ["LoRA", "微调"]），越多命中越准。',
        },
        limit: {
            type: 'integer',
            default: 10,
            description: '最多返回候选数（1–20），默认 10。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                total: { type: 'integer', required: true, description: '候选总数。' },
                suggestions: {
                    type: 'array',
                    required: true,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            path: { type: 'string', required: true },
                            basename: { type: 'string', required: true, description: '可作 [[wikilink]] 的笔记名。' },
                            title: { type: 'string', required: true },
                            tags: { type: 'array', required: true, items: { type: 'string' } },
                            matched: { type: 'integer', required: true, description: '命中的主题词个数（越多越相关）。' },
                            hits: { type: 'array', required: true, items: { type: 'string' }, description: '实际命中的词。' },
                            snippet: { type: 'string', required: true },
                        },
                    },
                },
            },
        },
        render: (_args, value) => [
            {
                type: 'text',
                text: value.suggestions.length === 0
                    ? 'vault 里没找到相关候选（可换更宽的主题词再试）。'
                    : [
                        `vault 候选 ${value.suggestions.length} 篇（共 ${value.total}）：`,
                        ...value.suggestions.map((s, i) => `${i + 1}. [[${s.basename}]]（${s.path}）· 命中 ${s.matched} 个词 #${s.tags.join(' #')}\n   ${s.snippet}`),
                        '',
                        '要补链的话告诉我哪几篇（如"关联第 1、3 篇"），我再调用 read_link。',
                    ].join('\n'),
            },
        ],
    },
    async execute(args) {
        const result = suggestVault({ words: args.words, limit: args.limit });
        return {
            total: result.total,
            suggestions: result.suggestions.map((s) => ({
                path: s.path,
                basename: s.basename,
                title: s.title,
                tags: [...s.tags],
                matched: s.matched,
                hits: [...s.hits],
                snippet: s.snippet,
            })),
        };
    },
});
export const readLinkTool = defineTool({
    name: 'read_link',
    description: '给档案里某条阅读事件补结构化外部链接（Obsidian 笔记名，如 ["ReAct、Plan-and-Solve、Reflection"]），' +
        '去重追加，正文不改；该事件所属对象卡的"关联 vault 笔记"小节随之更新。' +
        '用于"vault_suggest 找到候选 → 用户确认 → 补链"的最后一步。',
    parameters: {
        id: {
            type: 'string',
            required: true,
            description: '要补链的事件 id（read_query 可查）。',
        },
        links: {
            type: 'array',
            required: true,
            items: { type: 'string' },
            description: 'Obsidian 笔记名（不含 [[ ]]），如 "ReAct、Plan-and-Solve、Reflection"。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'string', required: true },
                kind: { type: 'string', enum: ['capture', 'note'], required: true },
                links: { type: 'array', required: true, items: { type: 'string' } },
                notePath: { type: 'string', required: true },
            },
        },
        render: (_args, value) => [
            {
                type: 'text',
                text: `已给事件 ${value.id} 补链：${value.links.map((l) => `[[${l}]]`).join(' ')}\n卡片：${value.notePath}`,
            },
        ],
    },
    async execute(args) {
        const updated = addLinks(args.id, args.links);
        return {
            id: updated.id,
            kind: updated.kind,
            links: [...(updated.links ?? [])],
            notePath: noteFilePath(updated),
        };
    },
});
// ---------------------------------------------------------------------------
// Version history over the append-only log: replay + undo
// ---------------------------------------------------------------------------
export const readHistoryTool = defineTool({
    name: 'read_history',
    description: '回放某个阅读对象的历史：把它那张对象卡"倒回"到指定时点（前 N 次阅读 / 某个日期之前），返回当时的卡片内容——用来回答"上次我理解成什么样"。' +
        '档案是追加式事件流 + 可重建视图，所以任意时点的卡片都能精确重放，不需要另存版本。' +
        '定位方式三选一：noteFile（卡片名）、id（该对象任一事件 id）、repo(+path/symbol) 坐标。',
    parameters: {
        noteFile: {
            type: 'string',
            description: '对象卡文件名（不含 .md），即 read_query / read_recent 返回的 objects[].noteFile。',
        },
        id: {
            type: 'string',
            description: '该对象任一事件的 id（read_query 可查）。',
        },
        repo: {
            type: 'string',
            description: '仓库标识；与 path/symbol 一起定位对象（repo 精确匹配，path/symbol 子串匹配）。',
        },
        path: { type: 'string', description: '可选：文件路径子串。' },
        symbol: { type: 'string', description: '可选：符号名子串。' },
        at: {
            type: 'string',
            description: '可选：只重放到该时点（YYYY-MM-DD 或 ISO 时间）；该时点之后的阅读不显示。',
        },
        index: {
            type: 'integer',
            description: '可选：只重放前 N 次阅读（1 起）。与 at 同时给时两个边界都生效。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                found: { type: 'boolean', required: true, description: '是否定位到该对象。' },
                noteFile: { type: 'string', required: true },
                title: { type: 'string', required: true },
                repo: { type: 'string' },
                path: { type: 'string' },
                symbol: { type: 'string' },
                totalEvents: { type: 'integer', required: true, description: '该对象当前的阅读总次数。' },
                shownEvents: { type: 'integer', required: true, description: '本次重放的阅读次数。' },
                asOf: { type: 'string', required: true, description: '重放到的时点（最后一次重放事件的 ISO 时间；未重放则为空串）。' },
                truncated: { type: 'boolean', required: true, description: 'markdown 是否因过长被截断。' },
                events: {
                    type: 'array',
                    required: true,
                    description: '重放到的事件（旧→新），每条带自己的 id/类型/时间/title/ref。',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            id: { type: 'string', required: true },
                            kind: { type: 'string', enum: ['capture', 'note'], required: true },
                            readAt: { type: 'string', required: true },
                            title: { type: 'string', required: true },
                            ref: { type: 'string' },
                        },
                    },
                },
                markdown: { type: 'string', required: true, description: '当时的卡片 Markdown（可能截断）。' },
            },
        },
        render: (_args, value) => [
            {
                type: 'text',
                text: !value.found
                    ? '没找到这个阅读对象：请给 noteFile（卡片名）、id（事件 id）或 repo(+path/symbol) 坐标之一。'
                    : value.shownEvents === 0
                        ? `${value.title}（${value.noteFile}）在给定时点还没有任何阅读记录。`
                        : [
                            `${value.title} · ${value.noteFile} —— 回放到第 ${value.shownEvents}/${value.totalEvents} 次阅读（${value.asOf.slice(0, 10)}）${value.truncated ? ' · 内容已截断' : ''}`,
                            '',
                            value.markdown,
                        ].join('\n'),
            },
        ],
    },
    async execute(args) {
        if (!args.noteFile?.trim() && !args.id?.trim() && !args.repo?.trim()) {
            throw new Error('请给 noteFile、id 或 repo(+path/symbol) 之一来定位对象');
        }
        if (args.index !== undefined && (!Number.isInteger(args.index) || args.index < 1)) {
            throw new Error('index 需为 ≥1 的整数（第几次阅读之后）');
        }
        const result = objectHistory({
            noteFile: args.noteFile?.trim(),
            id: args.id?.trim(),
            repo: args.repo?.trim(),
            path: args.path?.trim(),
            symbol: args.symbol?.trim(),
        }, { at: args.at?.trim(), index: args.index });
        const subject = result.subject;
        const clipped = clipMarkdown(result.markdown);
        return {
            found: result.found,
            noteFile: result.noteFile,
            title: result.title,
            ...(subject ? { repo: subject.repo } : {}),
            ...(subject?.path ? { path: subject.path } : {}),
            ...(subject?.symbol ? { symbol: subject.symbol } : {}),
            totalEvents: result.totalEvents,
            shownEvents: result.shownEvents,
            asOf: result.asOf,
            truncated: clipped.truncated,
            events: result.events.map((e) => ({
                id: e.id,
                kind: e.kind,
                readAt: e.readAt,
                title: e.title,
                ...(e.ref ? { ref: e.ref } : {}),
            })),
            markdown: clipped.text,
        };
    },
});
export const readDeleteTool = defineTool({
    name: 'read_delete',
    description: '删除档案里的一条阅读事件（记错了 / 写废了），随后自动重建该对象的卡片、hub 与 MOC；若这是该对象的最后一条事件，卡片文件一并移除。' +
        '事件流只追加，删除即物理移除、无法恢复——所以必须显式 confirm=true，且只在用户明确要求删除时调用。',
    parameters: {
        id: {
            type: 'string',
            required: true,
            description: '要删除的事件 id（read_query / read_recent 可查）。',
        },
        confirm: {
            type: 'boolean',
            required: true,
            description: '必须显式传 true，表示用户已确认删除（不可恢复）。',
        },
    },
    output: {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                deleted: { type: 'boolean', required: true },
                id: { type: 'string', required: true },
                title: { type: 'string', required: true, description: '被删除记录的标题。' },
                repo: { type: 'string', required: true },
                notePath: { type: 'string', required: true, description: '该对象的卡片路径（对象无事件时文件已移除）。' },
                remainingEvents: { type: 'integer', required: true, description: '该对象剩余阅读次数。' },
                cardRemoved: { type: 'boolean', required: true, description: '卡片文件是否已随最后一条事件移除。' },
                libraryCount: { type: 'integer', required: true, description: '删除后档案总条数。' },
            },
        },
        render: (_args, value) => [
            {
                type: 'text',
                text: [
                    `已删除 id=${value.id}（${value.title}）· ${value.repo}`,
                    value.cardRemoved
                        ? '该对象已无记录，卡片文件已移除：'
                        : `该对象还剩 ${value.remainingEvents} 次阅读，卡片已重建：`,
                    value.notePath,
                    `档案共 ${value.libraryCount} 条。`,
                ].join('\n'),
            },
        ],
    },
    async execute(args) {
        if (args.confirm !== true) {
            throw new Error('删除不可恢复：请先向用户确认，再以 confirm=true 调用');
        }
        const before = readEntries().find((e) => e.id === args.id);
        if (!before)
            throw new Error(`档案里没有 id=${args.id} 的记录`);
        const key = entryObjectKey(before);
        const cardPath = noteFilePath(before);
        const removed = deleteEntry(args.id);
        if (!removed)
            throw new Error(`删除失败：找不到 id=${args.id}`);
        const remaining = (groupByObject(readEntries()).get(key) ?? []).length;
        return {
            deleted: true,
            id: args.id,
            title: entryTitle(before),
            repo: before.subject.repo,
            notePath: cardPath,
            remainingEvents: remaining,
            cardRemoved: remaining === 0,
            libraryCount: readEntries().length,
        };
    },
});
export const TOOLS = [
    readCaptureTool,
    readNoteTool,
    readExpandTool,
    readQueryTool,
    readRecentTool,
    vaultSearchTool,
    vaultReadTool,
    vaultSuggestTool,
    readLinkTool,
    readHistoryTool,
    readDeleteTool,
];
// vaultRoot re-export keeps the symbol used if tools are imported alone.
void vaultRoot;
//# sourceMappingURL=tools.js.map