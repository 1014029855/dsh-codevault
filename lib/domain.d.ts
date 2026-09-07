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
export type EntryKind = 'capture' | 'note';
/** The thing that was read. `repo` is mandatory; everything else optional. */
export interface ReadingSubject {
    /** owner/name (e.g. deepseek-ai/deepseek-harness) or a local folder name. */
    readonly repo: string;
    /** Optional version / commit / branch the read happened against. */
    readonly ref?: string;
    /** Optional file path relative to the repo root. */
    readonly path?: string;
    /** Optional function/class/module/symbol that was read. */
    readonly symbol?: string;
}
/** One row of library.jsonl — one reading event. */
export interface ReadingEntry {
    readonly id: string;
    readonly kind: EntryKind;
    /** ISO 8601 instant the reading was recorded. */
    readonly readAt: string;
    readonly subject: ReadingSubject;
    /** Optional: why the user was reading this / the question being chased. */
    readonly context?: string;
    /** Human-readable content title (optional; falls back to subject-derived). */
    readonly title?: string;
    /** One-sentence take (required for capture; doubles as card summary). */
    readonly note?: string;
    /** Long-form deep-reading note body (kind === 'note', >= MIN_NOTE_BODY). */
    readonly bodyMarkdown?: string;
    /** Self-distilled reusable points (note). */
    readonly takeaway: readonly string[];
    /** Free-form topic words for Obsidian tag search (NOT used for stats). */
    readonly tags: readonly string[];
    /**
     * Structured external vault links added AFTER the event was written
     * (direction A polish #3: suggest -> user confirms -> read_link persists).
     * Kept separate from body text so links are dedupable and renderable into
     * the card's "关联 vault 笔记" section.
     */
    readonly links: readonly string[];
    /**
     * Card file name WITHOUT `.md`, fixed at first commit so the archive keeps
     * stable links. Legacy rows written before this field existed fall back to
     * their `id` (see noteFileName in store.ts).
     */
    readonly noteFile?: string;
    readonly updatedAt: string;
}
export declare const MIN_NOTE_BODY = 200;
export declare const MAX_TAGS = 12;
export declare const MAX_REPO_LEN = 200;
export declare const MAX_LINKS = 20;
/**
 * Validate & normalize external-link targets (Obsidian note names, no [[]]):
 * trim, drop accidental brackets, cap count/length, dedupe keeping order.
 */
export declare function normalizeLinks(raw: readonly unknown[] | undefined): string[];
/** Clean a repo identifier: trim, collapse inner whitespace. */
export declare function normalizeRepo(raw: string): string;
/** Validate a model/user supplied subject; returns a canonical copy. */
export declare function normalizeSubject(raw: ReadingSubject): ReadingSubject;
/**
 * Lenient tag normalization: trim -> lowercase -> collapse inner whitespace to
 * '-'. Tags are free topic words for Obsidian tag search, NOT a controlled
 * vocabulary and NOT used for statistics, so the check is deliberately loose.
 */
export declare function normalizeTags(raw: readonly unknown[] | undefined): string[];
/** Human-oriented title for one entry (used in card H1, hub & MOC lines). */
export declare function subjectTitle(s: ReadingSubject): string;
/**
 * Canonical grouping key of a reading OBJECT — the deepest coordinate given:
 * `symbol` (repo+path+symbol) > `path` (repo+path) > `repo`. Events that share
 * the same key are the same object and project onto ONE card (object card).
 * The key is derived ONLY from the deepest granularity actually provided, so
 * "same file re-read" and "same symbol re-read" each stay one card.
 */
export declare function objectKey(s: ReadingSubject): string;
/** Stable canonical key of an entry's object. */
export declare function entryObjectKey(e: ReadingEntry): string;
/** The canonical (normalized) subject that an object key points at. */
export declare function subjectOfKey(key: string): ReadingSubject;
/**
 * Display title of an entry: an explicit `title` when given (that is the
 * user-facing content summary), otherwise a coordinate-derived fallback so
 * card H1 / hub / MOC always have something readable.
 */
export declare function entryTitle(e: ReadingEntry): string;
/** Stable display label like "deepseek-ai/deepseek-harness · src/core/plugin.ts#apply". */
export declare function subjectLabel(s: ReadingSubject): string;
export declare function entryKindText(kind: EntryKind): string;
/**
 * Build a file-system & Obsidian-friendly file name from a display title:
 * keeps CJK/letters/digits/`._-`, collapses the rest to single `-`, trims
 * edge dashes, and caps length. Empty input falls back to `reading`.
 */
export declare function cardFileName(title: string): string;
/** Build a new entry object (validate + stamp id/time) WITHOUT writing anything. */
export declare function buildEntry(input: {
    kind: EntryKind;
    subject: ReadingSubject;
    context?: string;
    title?: string;
    note?: string;
    bodyMarkdown?: string;
    takeaway?: readonly string[];
    tags?: readonly unknown[];
    links?: readonly unknown[];
}): ReadingEntry;
/** Short lowercase alphanumeric id (8 chars from a uuid). */
export declare function randomId(): string;
/** Clip long free text for cheap model-facing summaries. */
export declare function clip(text: string, max?: number): string;
/** One-line summary of an entry for cards/hub/MOC. */
export declare function entrySummary(e: ReadingEntry): string;
//# sourceMappingURL=domain.d.ts.map