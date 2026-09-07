/**
 * Domain model + pure validation for dsh-codevault.
 *
 * This file holds NO I/O — every function is a pure function of its inputs,
 * which keeps it trivially testable in `smoke.mjs` without a cordis runtime.
 *
 * Deliberate design decisions (see DESIGN.md §1):
 *  - No 0-10 score, no "one-line impression", no rating statistics: this is a
 *    READING archive (what/where/when/understanding), not a music-review one.
 *  - The subject coordinate (repo -> path -> symbol) is the backbone.
 */
import { randomUUID } from 'node:crypto';
export const MIN_NOTE_BODY = 200;
export const MAX_TAGS = 12;
export const MAX_REPO_LEN = 200;
export const MAX_LINKS = 20;
/**
 * Validate & normalize external-link targets (Obsidian note names, no [[]]):
 * trim, drop accidental brackets, cap count/length, dedupe keeping order.
 */
export function normalizeLinks(raw) {
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        throw new Error('links 必须是字符串数组（可省略）');
    if (raw.length > MAX_LINKS)
        throw new Error(`links 最多 ${MAX_LINKS} 个`);
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        const link = String(item).trim().replace(/^\[\[|\]\]$/gu, '').trim();
        if (!link)
            continue;
        if ([...link].length > 200)
            throw new Error(`link "${item}" 过长（≤200 字符）`);
        if (!seen.has(link)) {
            seen.add(link);
            out.push(link);
        }
    }
    return out;
}
/** Clean a repo identifier: trim, collapse inner whitespace. */
export function normalizeRepo(raw) {
    const repo = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!repo)
        throw new Error('subject.repo 必填：仓库标识（owner/name 或本地目录名）不能为空');
    if (repo.length > MAX_REPO_LEN)
        throw new Error(`subject.repo 过长（≤${MAX_REPO_LEN} 字符）`);
    return repo;
}
function cleanOptional(raw, label, max) {
    const value = String(raw ?? '').trim();
    if (!value)
        return undefined;
    if (value.length > max)
        throw new Error(`${label} 过长（≤${max} 字符）`);
    return value;
}
/** Validate a model/user supplied subject; returns a canonical copy. */
export function normalizeSubject(raw) {
    const repo = normalizeRepo(raw.repo);
    const ref = cleanOptional(raw.ref, 'subject.ref', 200);
    const path = cleanOptional(raw.path, 'subject.path', 500);
    const symbol = cleanOptional(raw.symbol, 'subject.symbol', 200);
    return { repo, ...(ref ? { ref } : {}), ...(path ? { path } : {}), ...(symbol ? { symbol } : {}) };
}
/**
 * Lenient tag normalization: trim -> lowercase -> collapse inner whitespace to
 * '-'. Tags are free topic words for Obsidian tag search, NOT a controlled
 * vocabulary and NOT used for statistics, so the check is deliberately loose.
 */
export function normalizeTags(raw) {
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        throw new Error('tags 必须是字符串数组（可省略）');
    if (raw.length > MAX_TAGS)
        throw new Error(`tags 最多 ${MAX_TAGS} 个`);
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        const tag = String(item).trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
        const len = [...tag].length;
        if (len < 2 || len > 40) {
            throw new Error(`tag "${item}" 处理后需为 2–40 字符`);
        }
        if (!seen.has(tag)) {
            seen.add(tag);
            out.push(tag);
        }
    }
    return out;
}
/** Human-oriented title for one entry (used in card H1, hub & MOC lines). */
export function subjectTitle(s) {
    const file = s.path ? (s.path.split(/[\\/]/u).pop() ?? s.path) : undefined;
    const parts = [];
    if (file)
        parts.push(file);
    if (s.symbol)
        parts.push(s.symbol);
    return parts.length > 0 ? parts.join(' :: ') : s.repo;
}
/**
 * Canonical grouping key of a reading OBJECT — the deepest coordinate given:
 * `symbol` (repo+path+symbol) > `path` (repo+path) > `repo`. Events that share
 * the same key are the same object and project onto ONE card (object card).
 * The key is derived ONLY from the deepest granularity actually provided, so
 * "same file re-read" and "same symbol re-read" each stay one card.
 */
export function objectKey(s) {
    const repo = normalizeRepo(s.repo);
    const path = s.path?.trim();
    const symbol = s.symbol?.trim();
    if (symbol)
        return `S\u0000${repo}\u0000${path ?? ''}\u0000${symbol}`;
    if (path)
        return `P\u0000${repo}\u0000${path}`;
    return `R\u0000${repo}`;
}
/** Stable canonical key of an entry's object. */
export function entryObjectKey(e) {
    return objectKey(e.subject);
}
/** The canonical (normalized) subject that an object key points at. */
export function subjectOfKey(key) {
    const parts = key.split('\u0000');
    const kind = parts[0];
    const repo = parts[1] ?? '';
    if (kind === 'S')
        return { repo, ...(parts[2] ? { path: parts[2] } : {}), ...(parts[3] ? { symbol: parts[3] } : {}) };
    if (kind === 'P')
        return { repo, ...(parts[2] ? { path: parts[2] } : {}) };
    return { repo };
}
/**
 * Display title of an entry: an explicit `title` when given (that is the
 * user-facing content summary), otherwise a coordinate-derived fallback so
 * card H1 / hub / MOC always have something readable.
 */
export function entryTitle(e) {
    return e.title ? e.title : subjectTitle(e.subject);
}
/** Stable display label like "deepseek-ai/deepseek-harness · src/core/plugin.ts#apply". */
export function subjectLabel(s) {
    const tail = [];
    if (s.path)
        tail.push(s.path);
    if (s.symbol)
        tail[tail.length - 1] = `${tail[tail.length - 1]} → ${s.symbol}`;
    return tail.length > 0 ? `${s.repo} · ${tail.join(' · ')}` : s.repo;
}
export function entryKindText(kind) {
    return kind === 'note' ? '深读笔记' : '快记';
}
/**
 * Build a file-system & Obsidian-friendly file name from a display title:
 * keeps CJK/letters/digits/`._-`, collapses the rest to single `-`, trims
 * edge dashes, and caps length. Empty input falls back to `reading`.
 */
export function cardFileName(title) {
    const cleaned = [...title.trim()]
        .map((ch) => (/[\p{L}\p{N}._-]/u.test(ch) ? ch : '-'))
        .join('')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72)
        .replace(/-+$/g, '');
    return cleaned || 'reading';
}
/** Build a new entry object (validate + stamp id/time) WITHOUT writing anything. */
export function buildEntry(input) {
    const subject = normalizeSubject(input.subject);
    const context = cleanOptional(input.context, 'context', 2000);
    const title = cleanOptional(input.title, 'title', 120);
    const now = new Date().toISOString();
    let note;
    let bodyMarkdown;
    if (input.kind === 'capture') {
        const n = String(input.note ?? '').trim();
        if (!n)
            throw new Error('capture 的 note 必填：写清这次读到了什么机制/关键点在哪/它为什么这样设计');
        if ([...n].length > 2000)
            throw new Error('capture 的 note 过长（≤2000 字符）——写 2–4 句要点即可，长篇请用深读笔记');
        note = n;
    }
    else {
        const body = String(input.bodyMarkdown ?? '').trim();
        if ([...body].length < MIN_NOTE_BODY) {
            throw new Error(`bodyMarkdown 需至少 ${MIN_NOTE_BODY} 字（当前 ${[...body].length}）——请按阅读框架把坐标与机制写足再存档`);
        }
        if (!context) {
            throw new Error('深读笔记的 context 必填：先写清"为什么读到这 / 当时在解决什么问题"');
        }
        bodyMarkdown = body;
    }
    const takeaway = (input.takeaway ?? [])
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0);
    if (input.kind === 'note' && takeaway.length === 0) {
        throw new Error('深读笔记至少要有 1 条 takeaway（可复用的提炼要点）');
    }
    return {
        id: randomId(),
        kind: input.kind,
        readAt: now,
        subject,
        ...(context ? { context } : {}),
        ...(title ? { title } : {}),
        ...(note ? { note } : {}),
        ...(bodyMarkdown ? { bodyMarkdown } : {}),
        takeaway,
        tags: normalizeTags(input.tags),
        links: normalizeLinks(input.links),
        updatedAt: now,
    };
}
/** Short lowercase alphanumeric id (8 chars from a uuid). */
export function randomId() {
    return randomUUID().replace(/-/g, '').slice(0, 8).toLowerCase();
}
/** Clip long free text for cheap model-facing summaries. */
export function clip(text, max = 120) {
    if ([...text].length <= max)
        return text;
    return `${[...text].slice(0, max).join('')}…`;
}
/** One-line summary of an entry for cards/hub/MOC. */
export function entrySummary(e) {
    if (e.kind === 'capture')
        return e.note ?? '';
    const t = e.takeaway[0];
    if (t)
        return t;
    return clip(e.bodyMarkdown ?? '', 120);
}
//# sourceMappingURL=domain.js.map