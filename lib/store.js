/**
 * File-backed store for the dsh-codevault reading archive (V2 object cards).
 *
 * Model split (see DESIGN.md V2):
 *  - library.jsonl keeps APPEND-ONLY EVENTS (one ReadingEntry per read), the
 *    single source of truth for replay/stats/tests.
 *  - Obsidian VIEWS project events onto OBJECT cards: every event whose
 *    objectKey() is equal maps to ONE card `notes/<noteFile>.md`, whose body is
 *    a header + reading timeline + merged takeaways + same-repo links.
 *
 * Layout (default root = `~/.dsh/data/dsh-codevault`, overridable via the
 * DSCODEVAULT_DATA_DIR env var — used by smoke tests / CI):
 *
 *   <root>/library.jsonl   events (append-only, atomic)
 *   <root>/notes/<f>.md    one card per reading OBJECT (derived, rebuilt)
 *   <root>/hub/<slug>.md   per-repo hub: one line per object card
 *   <root>/MOC.md          overview: repo list / object counts / recent cards
 *
 * The object card name is frozen on the object's FIRST event and stored in
 * every row's `noteFile`; later events of the same object reuse the same card.
 * Cards / hubs / MOC are derived views and always rebuilt from library.jsonl,
 * so they never drift.
 *
 * Concurrency (V1 note still holds): all I/O synchronous, atomic tmp+rename;
 * cross-process writers: last writer wins (documented, accepted).
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, } from 'node:fs';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { MAX_LINKS, MIN_NOTE_BODY, cardFileName, clip, entryKindText, entryObjectKey, entryTitle, normalizeLinks, subjectLabel, subjectOfKey, } from './domain.js';
export const DATA_DIR_ENV = 'DSCODEVAULT_DATA_DIR';
/**
 * Module-level root set from the plugin Config (`dataDir`) once apply() runs.
 * Resolution priority: configured root > DSCODEVAULT_DATA_DIR env > default.
 */
let configuredRoot;
/** Apply the plugin Config's dataDir (empty/whitespace falls back to env/default). */
export function configureDataRoot(dataDir) {
    configuredRoot = dataDir?.trim() ? dataDir.trim() : undefined;
}
/** Resolve the plugin data root. Lazily evaluated so tests can set the env. */
export function dataRoot() {
    if (configuredRoot)
        return configuredRoot;
    const override = process.env[DATA_DIR_ENV];
    return override ? override : dshHomePath('data', 'dsh-codevault');
}
export function ensureStore() {
    const root = dataRoot();
    mkdirSync(join(root, 'notes'), { recursive: true });
    mkdirSync(join(root, 'hub'), { recursive: true });
    return root;
}
function libraryFile(root) {
    return join(root, 'library.jsonl');
}
/** Atomically replace `file` with `content` (same-dir temp + rename). */
function atomicWrite(file, content) {
    const tmp = `${file}.tmp-${randomUUID()}`;
    try {
        writeFileSync(tmp, content, 'utf8');
        renameSync(tmp, file);
    }
    finally {
        if (existsSync(tmp))
            rmSync(tmp, { force: true });
    }
}
/** Read every event row on disk (tolerant of missing/corrupt lines). */
export function readEntries() {
    const file = libraryFile(dataRoot());
    if (!existsSync(file))
        return [];
    const raw = readFileSync(file, 'utf8');
    const entries = [];
    for (const line of raw.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            const parsed = JSON.parse(trimmed);
            // Legacy rows (pre-links) get an empty links array at read time.
            if (!Array.isArray(parsed.links))
                entries.push({ ...parsed, links: [] });
            else
                entries.push(parsed);
        }
        catch (error) {
            console.warn('[dsh-codevault] skipping unparsable library line:', String(error));
        }
    }
    return entries;
}
// ---------------------------------------------------------------------------
// Object grouping
// ---------------------------------------------------------------------------
/** All events grouped by objectKey (insertion order preserved per object). */
export function groupByObject(entries) {
    const map = new Map();
    for (const e of entries) {
        const key = entryObjectKey(e);
        const arr = map.get(key) ?? [];
        arr.push(e);
        map.set(key, arr);
    }
    return map;
}
/** Earliest event of an object — the anchor whose title names the card. */
function anchorOf(events) {
    return [...events].sort((a, b) => a.readAt.localeCompare(b.readAt))[0] ?? events[0];
}
/** Display title of an object card (anchor's title, else coordinate title). */
export function objectTitle(events) {
    return entryTitle(anchorOf(events));
}
/** Newest event of an object (for summaries/labels). */
function newestOf(events) {
    return [...events].sort((a, b) => b.readAt.localeCompare(a.readAt))[0] ?? events[0];
}
// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
/**
 * Persist one new event: append the library row, then rebuild the object card,
 * its repo hub, and the MOC.
 */
export function commitEntry(entry) {
    const root = ensureStore();
    const rows = readEntries();
    const key = entryObjectKey(entry);
    const siblings = rows.filter((e) => entryObjectKey(e) === key);
    const noteFile = objectFileName([...siblings, entry], rows);
    const stored = { ...entry, noteFile };
    atomicWrite(libraryFile(root), [...rows, stored].map((e) => JSON.stringify(e)).join('\n') + '\n');
    const notePath = writeObjectCard(key);
    const hubPath = refreshHub(stored.subject.repo);
    const mocPath = refreshMOC();
    return { notePath, hubPath, mocPath };
}
/** File name (no .md) of an object card; frozen on first event, reused after. */
export function objectFileName(events, allRows) {
    const existing = events.find((e) => e.noteFile);
    if (existing?.noteFile)
        return existing.noteFile;
    const used = new Set(allRows.map((e) => e.noteFile).filter((f) => Boolean(f)));
    const base = cardFileName(objectTitle(events));
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) {
        candidate = `${base}-${i}`;
        i += 1;
    }
    return candidate;
}
/**
 * Promote one event (a quick capture) into a deep-reading note IN PLACE: the
 * same row gains bodyMarkdown/takeaway (+ context if missing), kind flips to
 * 'note'; the object card is rebuilt in the SAME file (never renamed). This is
 * the archive's "quick first, deepen later" revision path.
 */
export function expandEntry(id, patch) {
    const root = ensureStore();
    const file = libraryFile(root);
    if (!existsSync(file))
        throw new Error('档案为空，找不到要升级的记录');
    const rows = readEntries();
    const target = rows.find((e) => e.id === id);
    if (!target)
        throw new Error(`档案里没有 id=${id} 的记录`);
    if (target.bodyMarkdown)
        throw new Error(`id=${id} 已经是深读笔记（有正文），如需改写请删后重建`);
    const body = patch.bodyMarkdown.trim();
    if ([...body].length < MIN_NOTE_BODY) {
        throw new Error(`bodyMarkdown 需至少 ${MIN_NOTE_BODY} 字（当前 ${[...body].length}）——请按阅读框架写足再升级`);
    }
    const takeaway = patch.takeaway.map((t) => String(t).trim()).filter((t) => t.length > 0);
    if (takeaway.length === 0)
        throw new Error('升级为深读笔记至少要有 1 条 takeaway');
    const context = patch.context?.trim() || target.context;
    const updated = {
        ...target,
        kind: 'note',
        ...(context ? { context } : {}),
        bodyMarkdown: body,
        takeaway,
        updatedAt: new Date().toISOString(),
    };
    atomicWrite(file, rows.map((e) => (e.id === id ? updated : e)).map((e) => JSON.stringify(e)).join('\n') + '\n');
    writeObjectCard(entryObjectKey(updated));
    refreshHub(updated.subject.repo);
    refreshMOC();
    return updated;
}
/**
 * Add structured external vault links to ONE event (dedupe, cap MAX_LINKS),
 * then rebuild that event's object card. Body text is untouched; links render
 * into the card's "关联 vault 笔记" section.
 */
export function addLinks(id, targets) {
    const root = ensureStore();
    const file = libraryFile(root);
    if (!existsSync(file))
        throw new Error('档案为空，找不到要补链的记录');
    const rows = readEntries();
    const target = rows.find((e) => e.id === id);
    if (!target)
        throw new Error(`档案里没有 id=${id} 的记录`);
    const fresh = normalizeLinks(targets);
    if (fresh.length === 0)
        throw new Error('links 至少给一个要关联的笔记名');
    const merged = [...new Set([...(target.links ?? []), ...fresh])];
    if (merged.length > MAX_LINKS)
        throw new Error(`links 最多 ${MAX_LINKS} 个（当前追加后会到 ${merged.length}）`);
    const updated = { ...target, links: merged, updatedAt: new Date().toISOString() };
    atomicWrite(file, rows.map((e) => (e.id === id ? updated : e)).map((e) => JSON.stringify(e)).join('\n') + '\n');
    writeObjectCard(entryObjectKey(updated));
    refreshHub(updated.subject.repo);
    refreshMOC();
    return updated;
}
/** Delete one event; rebuild its object card (or remove it) + hub + MOC. */
export function deleteEntry(id) {
    const root = dataRoot();
    const file = libraryFile(root);
    if (!existsSync(file))
        return false;
    const before = readEntries();
    const removed = before.find((e) => e.id === id);
    if (!removed)
        return false;
    const after = before.filter((e) => e.id !== id);
    atomicWrite(file, after.map((e) => JSON.stringify(e)).join('\n') + (after.length > 0 ? '\n' : ''));
    const key = entryObjectKey(removed);
    const survivors = after.filter((e) => entryObjectKey(e) === key);
    const noteFile = removed.noteFile;
    if (survivors.length > 0) {
        writeObjectCard(key);
    }
    else if (noteFile) {
        const card = join(root, 'notes', `${noteFile}.md`);
        if (existsSync(card))
            rmSync(card, { force: true });
    }
    refreshHub(removed.subject.repo);
    refreshMOC();
    return true;
}
// ---------------------------------------------------------------------------
// Object card projection (notes/<noteFile>.md)
// ---------------------------------------------------------------------------
/** Path of one object's card file. */
export function objectCardPath(key) {
    const rows = groupByObject(readEntries()).get(key) ?? [];
    const name = rows.length > 0 ? (rows.find((e) => e.noteFile)?.noteFile ?? objectFileName(rows, readEntries())) : undefined;
    return name ? join(dataRoot(), 'notes', `${name}.md`) : join(dataRoot(), 'notes', 'unresolved.md');
}
/** Path of the card that a specific event row belongs to. */
export function noteFilePath(e) {
    return join(dataRoot(), 'notes', `${e.noteFile ?? e.id}.md`);
}
function yamlLine(value) {
    if (value === undefined)
        return '';
    return JSON.stringify(Array.isArray(value) ? [...value] : value);
}
/** Rebuild the card of one object from its events (atomic). */
export function writeObjectCard(key) {
    const root = ensureStore();
    const events = groupByObject(readEntries()).get(key);
    if (!events || events.length === 0)
        return join(root, 'notes', 'gone.md');
    const anchor = anchorOf(events);
    const newest = newestOf(events);
    const noteFile = anchor.noteFile ?? objectFileName(events, readEntries());
    const subject = subjectOfKey(key);
    const tags = [...new Set(events.flatMap((e) => e.tags))];
    const timelines = [...events].sort((a, b) => b.readAt.localeCompare(a.readAt));
    const fm = [
        '---',
        `kind: ${yamlLine('object')}`,
        `noteFile: ${yamlLine(noteFile)}`,
        `readCount: ${events.length}`,
        `firstReadAt: ${yamlLine(anchor.readAt)}`,
        `lastReadAt: ${yamlLine(newest.readAt)}`,
        `title: ${yamlLine(entryTitle(anchor))}`,
        `repo: ${yamlLine(subject.repo)}`,
        ...(subject.path ? [`path: ${yamlLine(subject.path)}`] : []),
        ...(subject.symbol ? [`symbol: ${yamlLine(subject.symbol)}`] : []),
        `tags: ${yamlLine(tags.length > 0 ? tags : undefined) ?? '[]'}`,
        '---',
    ].join('\n');
    const body = [];
    body.push(`# ${entryTitle(anchor)}`);
    body.push('');
    body.push(`> 阅读对象 · ${subjectLabel(subject)}`);
    body.push(`> 读过 ${events.length} 次 · ${anchor.readAt.slice(0, 10)} ~ ${newest.readAt.slice(0, 10)}`);
    body.push('');
    body.push('## 阅读时间线（新 → 旧）');
    body.push('');
    for (const e of timelines) {
        body.push(`### ${e.readAt.slice(0, 10)} ${entryKindText(e.kind)} · id ${e.id}`);
        if (e.context)
            body.push(`> **为什么读到这**：${e.context}`);
        body.push('');
        if (e.kind === 'capture') {
            body.push(e.note ?? '');
        }
        else {
            body.push(e.bodyMarkdown ?? '');
        }
        if (e.takeaway.length > 0) {
            body.push('');
            body.push(`**本条提炼**（${e.readAt.slice(0, 10)}）：`);
            for (const t of e.takeaway)
                body.push(`- ${t}`);
        }
        body.push('');
    }
    const merged = [...new Set(events.flatMap((e) => e.takeaway))];
    if (merged.length > 0) {
        body.push('## 全部提炼要点（去重合并）');
        body.push('');
        for (const t of merged)
            body.push(`- ${t}`);
        body.push('');
    }
    // "关联 vault 笔记" section: structured links + external wikilinks the model
    // wrote in bodies. Archive-internal refs use notes/ or hub/ prefixes.
    const externalLinks = collectExternalLinks(events);
    const linked = [...new Set([...events.flatMap((e) => e.links ?? []), ...externalLinks].map((l) => l.replace(/\[\[|\]\]/gu, '').trim()).filter(Boolean))];
    if (linked.length > 0) {
        body.push('## 关联 vault 笔记');
        body.push('');
        for (const link of linked)
            body.push(`- [[${link}]]`);
        body.push('');
    }
    const related = relatedObjectsSection(key);
    if (related.length > 0) {
        body.push('## 同仓其他对象');
        body.push('');
        body.push(related);
        body.push('');
    }
    const file = join(root, 'notes', `${noteFile}.md`);
    atomicWrite(file, `${fm}\n\n${body.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`);
    return file;
}
/** Links to OTHER object cards in the same repo (not self). */
function relatedObjectsSection(selfKey) {
    const rows = readEntries();
    const self = rows.find((e) => entryObjectKey(e) === selfKey);
    if (!self)
        return '';
    const byObj = groupByObject(rows.filter((e) => e.subject.repo === self.subject.repo));
    const lines = [];
    for (const [key, events] of byObj) {
        if (key === selfKey)
            continue;
        const a = anchorOf(events);
        const nf = a.noteFile;
        if (!nf)
            continue;
        const newest = newestOf(events);
        lines.push(`- [[notes/${nf}|${entryTitle(a)}]] ${events.length} 次 · 最近 ${newest.readAt.slice(0, 10)}`);
    }
    return [...lines].sort().join('\n');
}
/**
 * Collect wikilinks the model wrote into event notes/bodies that point OUTSIDE
 * the plugin archive. Archive-internal refs are written as `[[notes/…]]` /
 * `[[hub/…]]`, so any other `[[Name]]` (or `[[path/Name]]`) is an external
 * link worth surfacing. Deduped, preserving first-seen order.
 */
function collectExternalLinks(events) {
    const out = [];
    const seen = new Set();
    const PLACEHOLDERS = new Set(['链接', '链接名', '笔记名', '…']);
    for (const e of events) {
        const text = [e.note, e.context, e.bodyMarkdown, ...e.takeaway].filter((s) => Boolean(s)).join('\n');
        for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gu)) {
            // A body may already contain the literal [[Name]]; strip stray brackets.
            const target = m[1].replace(/\[\[|\]\]/gu, '').trim();
            if (!target)
                continue;
            if (target.startsWith('notes/') || target.startsWith('hub/'))
                continue;
            if (PLACEHOLDERS.has(target))
                continue;
            if (seen.has(target))
                continue;
            seen.add(target);
            out.push(target);
        }
    }
    return out;
}
// ---------------------------------------------------------------------------
// Repo hub (hub/<slug>.md) & MOC
// ---------------------------------------------------------------------------
/** File-system & wikilink-safe slug of a repo identifier (keeps [a-z0-9._-]). */
export function hubSlug(repo) {
    const cleaned = repo
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (cleaned.length >= 3)
        return cleaned;
    // All-CJK or otherwise unslugifiable repo: keep it unique via a short hash.
    return `repo-${createHash('sha1').update(repo).digest('hex').slice(0, 8)}`;
}
export function hubPath(repo) {
    return join(dataRoot(), 'hub', `${hubSlug(repo)}.md`);
}
/** Rebuild the hub page of one repo: one line per object card (atomic). */
export function refreshHub(repo) {
    const root = ensureStore();
    const byObj = groupByObject(readEntries().filter((e) => e.subject.repo === repo));
    const file = join(root, 'hub', `${hubSlug(repo)}.md`);
    if (byObj.size === 0) {
        if (existsSync(file))
            rmSync(file, { force: true });
        return file;
    }
    const objects = [...byObj.entries()]
        .map(([key, events]) => ({ key, events, anchor: anchorOf(events), newest: newestOf(events) }))
        .sort((a, b) => b.newest.readAt.localeCompare(a.newest.readAt));
    const totalEvents = objects.reduce((n, o) => n + o.events.length, 0);
    const lines = [
        `# ${repo} · 源码阅读对象`,
        '',
        `共 ${objects.length} 个对象 · ${totalEvents} 次阅读 · 最近 ${objects[0].newest.readAt.slice(0, 10)}`,
        '',
        '## 对象（新 → 旧）',
        '',
    ];
    for (const o of objects) {
        if (!o.anchor.noteFile)
            continue;
        lines.push(`- [[notes/${o.anchor.noteFile}|${entryTitle(o.anchor)}]] ${o.events.length} 次 · 最近 ${o.newest.readAt.slice(0, 10)} · ${entryKindText(o.newest.kind)}`);
    }
    atomicWrite(file, lines.join('\n') + '\n');
    return file;
}
/** Per-repo aggregate over current events. */
function aggregateRepos() {
    const byRepo = new Map();
    for (const e of readEntries()) {
        const arr = byRepo.get(e.subject.repo) ?? [];
        arr.push(e);
        byRepo.set(e.subject.repo, arr);
    }
    return [...byRepo.entries()]
        .map(([repo, events]) => ({
        repo,
        objects: groupByObject(events).size,
        events: events.length,
        latest: newestOf(events).readAt,
    }))
        .sort((a, b) => b.latest.localeCompare(a.latest));
}
/** Rebuild MOC.md from current events (atomic). */
export function refreshMOC() {
    const root = ensureStore();
    const rows = readEntries();
    const file = join(root, 'MOC.md');
    if (rows.length === 0) {
        const placeholder = [
            `# 源码阅读档案 · MOC`,
            '',
            '> 数据根：' + root,
            '> 还没有阅读记录。说"把刚才读到的记一下"，或用 `/codevault` 查看用法。',
            '',
        ].join('\n');
        atomicWrite(file, placeholder);
        return file;
    }
    const repos = aggregateRepos();
    const objects = [...groupByObject(rows).entries()]
        .map(([key, events]) => ({ key, events, anchor: anchorOf(events), newest: newestOf(events) }))
        .sort((a, b) => b.newest.readAt.localeCompare(a.newest.readAt));
    const lines = [
        `# 源码阅读档案 · MOC`,
        '',
        `共 ${rows.length} 次阅读 · ${objects.length} 个对象 · 数据根：${root}`,
        '',
        '## 仓库',
        '',
    ];
    for (const r of repos) {
        lines.push(`- [[hub/${hubSlug(r.repo)}|${r.repo}]] — ${r.objects} 个对象 / ${r.events} 次阅读 · 最近 ${r.latest.slice(0, 10)}`);
    }
    lines.push('', '## 最近阅读对象', '');
    for (const o of objects.slice(0, 12)) {
        if (!o.anchor.noteFile)
            continue;
        lines.push(`- [[notes/${o.anchor.noteFile}|${entryTitle(o.anchor)}]] ${o.events.length} 次 · 最近 ${o.newest.readAt.slice(0, 10)}`);
    }
    atomicWrite(file, lines.join('\n') + '\n');
    return file;
}
// ---------------------------------------------------------------------------
// Migration: V1 event-cards -> V2 object cards (idempotent)
// ---------------------------------------------------------------------------
/**
 * One-time migration of archives written as V1 event-cards (rows with their
 * own noteFile/title) into V2 object cards. Each object's events must share ONE
 * noteFile; the anchor's existing name wins, others are renamed/reconciled.
 * Safe to run on every load: objects that already share a name are skipped.
 * @returns how many objects were (re)conciled.
 */
export function migrateLegacyNoteFiles() {
    const root = ensureStore();
    const rows = readEntries();
    if (rows.length === 0)
        return 0;
    const byObj = groupByObject(rows);
    let reconciled = 0;
    // Decide one noteFile per object.
    const decision = new Map();
    const used = new Set(rows.map((e) => e.noteFile).filter((f) => Boolean(f)));
    for (const [key, events] of byObj) {
        const anchor = anchorOf(events);
        const names = new Set(events.map((e) => e.noteFile).filter((f) => Boolean(f)));
        if (names.size <= 1 && anchor.noteFile)
            continue; // already consistent
        const existingName = events.find((e) => e.noteFile && e.noteFile !== anchor.id)?.noteFile;
        let name = existingName ?? anchor.noteFile;
        if (!name || name === anchor.id || [...used].includes(name)) {
            const base = cardFileName(objectTitle(events));
            name = base;
            let i = 2;
            while (used.has(name)) {
                name = `${base}-${i}`;
                i += 1;
            }
        }
        used.add(name);
        decision.set(key, name);
        reconciled += 1;
    }
    if (reconciled === 0) {
        // Even with no rename needed, V1 cards must be re-projected into the V2
        // object-card layout (timeline + merged takeaways) on first load.
        for (const key of byObj.keys())
            writeObjectCard(key);
        for (const repo of new Set(rows.map((e) => e.subject.repo)))
            refreshHub(repo);
        refreshMOC();
        return 0;
    }
    // Rename old per-event cards into the object card name.
    const notesDir = join(root, 'notes');
    const next = rows.map((e) => {
        const key = entryObjectKey(e);
        const target = decision.get(key);
        if (!target || e.noteFile === target)
            return e;
        const old = join(notesDir, `${e.noteFile ?? e.id}.md`);
        const fresh = join(notesDir, `${target}.md`);
        if (existsSync(old) && !existsSync(fresh))
            renameSync(old, fresh);
        else if (existsSync(old) && existsSync(fresh) && old !== fresh)
            rmSync(old, { force: true });
        return { ...e, noteFile: target };
    });
    atomicWrite(libraryFile(root), next.map((e) => JSON.stringify(e)).join('\n') + '\n');
    for (const key of byObj.keys())
        writeObjectCard(key);
    for (const repo of new Set(next.map((e) => e.subject.repo)))
        refreshHub(repo);
    refreshMOC();
    return reconciled;
}
function summarizeEvent(e) {
    return {
        id: e.id,
        kind: e.kind,
        readAt: e.readAt,
        ...(e.context ? { context: e.context } : {}),
        ...(e.note ? { note: e.note } : {}),
        takeaway: e.takeaway,
        noteFile: e.noteFile ?? e.id,
        summary: clip(e.kind === 'capture' ? (e.note ?? '') : (e.takeaway[0] ?? e.note ?? ''), 160),
    };
}
function summarizeObject(events) {
    const anchor = anchorOf(events);
    const newest = newestOf(events);
    const subject = subjectOfKey(entryObjectKey(anchor));
    return {
        noteFile: anchor.noteFile ?? anchor.id,
        title: entryTitle(anchor),
        repo: subject.repo,
        ...(subject.path ? { path: subject.path } : {}),
        ...(subject.symbol ? { symbol: subject.symbol } : {}),
        readCount: events.length,
        firstReadAt: anchor.readAt,
        lastReadAt: newest.readAt,
        tags: [...new Set(events.flatMap((e) => e.tags))],
        events: [...events].sort((a, b) => b.readAt.localeCompare(a.readAt)).map(summarizeEvent),
    };
}
function objectMatches(events, f) {
    const subject = subjectOfKey(entryObjectKey(events[0]));
    if (f.repo && subject.repo.toLowerCase() !== f.repo.trim().toLowerCase())
        return false;
    if (f.path && !(subject.path ?? '').toLowerCase().includes(f.path.trim().toLowerCase()))
        return false;
    if (f.symbol && !(subject.symbol ?? '').toLowerCase().includes(f.symbol.trim().toLowerCase()))
        return false;
    if (f.tag && !events.some((e) => e.tags.includes(f.tag.trim().toLowerCase())))
        return false;
    if (f.kind && !events.some((e) => e.kind === f.kind))
        return false;
    if (f.since) {
        const latest = newestOf(events).readAt.slice(0, 10);
        if (latest < f.since)
            return false;
    }
    return true;
}
/** Newest-first object view filtered across events; limit clamps 1..200. */
export function queryEntries(filter, limit = 50) {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
    const hits = [...groupByObject(readEntries()).values()]
        .filter((events) => objectMatches(events, filter))
        .sort((a, b) => newestOf(b).readAt.localeCompare(newestOf(a).readAt));
    return { total: hits.length, objects: hits.slice(0, safeLimit).map(summarizeObject) };
}
/** Recent object snapshot across all repos (days optional). */
export function recentEntries(days, limit = 8) {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 8), 50);
    const cutoff = days !== undefined ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
    const hits = [...groupByObject(readEntries()).values()]
        .filter((events) => (cutoff ? newestOf(events).readAt >= cutoff : true))
        .sort((a, b) => newestOf(b).readAt.localeCompare(newestOf(a).readAt));
    return { total: hits.length, objects: hits.slice(0, safeLimit).map(summarizeObject) };
}
export function archiveStats() {
    const rows = readEntries();
    return {
        total: rows.length,
        objects: groupByObject(rows).size,
        repos: aggregateRepos().length,
        captures: rows.filter((e) => e.kind === 'capture').length,
        notes: rows.filter((e) => e.kind === 'note').length,
    };
}
//# sourceMappingURL=store.js.map