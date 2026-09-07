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
import { ReadingEntry } from './domain.js';
export declare const DATA_DIR_ENV = "DSCODEVAULT_DATA_DIR";
/** Apply the plugin Config's dataDir (empty/whitespace falls back to env/default). */
export declare function configureDataRoot(dataDir: string | undefined): void;
/** Resolve the plugin data root. Lazily evaluated so tests can set the env. */
export declare function dataRoot(): string;
export declare function ensureStore(): string;
/** Read every event row on disk (tolerant of missing/corrupt lines). */
export declare function readEntries(): ReadingEntry[];
/** All events grouped by objectKey (insertion order preserved per object). */
export declare function groupByObject(entries: readonly ReadingEntry[]): Map<string, ReadingEntry[]>;
/** Display title of an object card (anchor's title, else coordinate title). */
export declare function objectTitle(events: ReadingEntry[]): string;
/**
 * Persist one new event: append the library row, then rebuild the object card,
 * its repo hub, and the MOC.
 */
export declare function commitEntry(entry: ReadingEntry): {
    notePath: string;
    hubPath: string;
    mocPath: string;
};
/** File name (no .md) of an object card; frozen on first event, reused after. */
export declare function objectFileName(events: ReadingEntry[], allRows: readonly ReadingEntry[]): string;
/**
 * Promote one event (a quick capture) into a deep-reading note IN PLACE: the
 * same row gains bodyMarkdown/takeaway (+ context if missing), kind flips to
 * 'note'; the object card is rebuilt in the SAME file (never renamed). This is
 * the archive's "quick first, deepen later" revision path.
 */
export declare function expandEntry(id: string, patch: {
    context?: string;
    bodyMarkdown: string;
    takeaway: readonly string[];
}): ReadingEntry;
/**
 * Add structured external vault links to ONE event (dedupe, cap MAX_LINKS),
 * then rebuild that event's object card. Body text is untouched; links render
 * into the card's "关联 vault 笔记" section.
 */
export declare function addLinks(id: string, targets: readonly unknown[]): ReadingEntry;
/** Delete one event; rebuild its object card (or remove it) + hub + MOC. */
export declare function deleteEntry(id: string): boolean;
/** Path of one object's card file. */
export declare function objectCardPath(key: string): string;
/** Path of the card that a specific event row belongs to. */
export declare function noteFilePath(e: ReadingEntry): string;
/** Rebuild the card of one object from its events (atomic). */
export declare function writeObjectCard(key: string): string;
/** File-system & wikilink-safe slug of a repo identifier (keeps [a-z0-9._-]). */
export declare function hubSlug(repo: string): string;
export declare function hubPath(repo: string): string;
/** Rebuild the hub page of one repo: one line per object card (atomic). */
export declare function refreshHub(repo: string): string;
/** Rebuild MOC.md from current events (atomic). */
export declare function refreshMOC(): string;
/**
 * One-time migration of archives written as V1 event-cards (rows with their
 * own noteFile/title) into V2 object cards. Each object's events must share ONE
 * noteFile; the anchor's existing name wins, others are renamed/reconciled.
 * Safe to run on every load: objects that already share a name are skipped.
 * @returns how many objects were (re)conciled.
 */
export declare function migrateLegacyNoteFiles(): number;
export interface EntryFilter {
    readonly repo?: string;
    readonly path?: string;
    readonly symbol?: string;
    readonly tag?: string;
    readonly kind?: 'capture' | 'note';
    readonly since?: string;
}
export interface EventRef {
    readonly id: string;
    readonly kind: 'capture' | 'note';
    readonly readAt: string;
    readonly context?: string;
    readonly note?: string;
    readonly takeaway: readonly string[];
    readonly noteFile: string;
    /** Cheap one-line summary (never the full bodyMarkdown). */
    readonly summary: string;
}
export interface ObjectSummary {
    readonly noteFile: string;
    readonly title: string;
    readonly repo: string;
    readonly ref?: string;
    readonly path?: string;
    readonly symbol?: string;
    readonly readCount: number;
    readonly firstReadAt: string;
    readonly lastReadAt: string;
    readonly tags: readonly string[];
    readonly events: readonly EventRef[];
}
export interface QueryResult {
    readonly total: number;
    readonly objects: readonly ObjectSummary[];
}
/** Newest-first object view filtered across events; limit clamps 1..200. */
export declare function queryEntries(filter: EntryFilter, limit?: number): QueryResult;
/** Recent object snapshot across all repos (days optional). */
export declare function recentEntries(days?: number, limit?: number): QueryResult;
export interface ArchiveStats {
    readonly total: number;
    readonly objects: number;
    readonly repos: number;
    readonly captures: number;
    readonly notes: number;
}
export declare function archiveStats(): ArchiveStats;
//# sourceMappingURL=store.d.ts.map