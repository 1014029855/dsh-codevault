/**
 * Read-only Obsidian-vault access layer (V3 "vault as context", direction A).
 *
 * The plugin records into `dataDir` (its own archive), but may ALSO be pointed
 * at the root of an Obsidian vault (`vaultDir`). When configured, the model can
 * search/read the user's vault notes (including notes OUTSIDE the archive) so
 * a reading card can link to related knowledge the user already owns.
 *
 * Safety & boundary (deliberate):
 *  - READ-ONLY: no writes, no network. The archive itself remains the only
 *    thing the plugin ever mutates.
 *  - Path confinement: every resolved target must live under `vaultDir`;
 *    `..`/absolute escape attempts are rejected.
 *  - Ignore dirs: `.obsidian`, `.trash`, `node_modules`, `.git`, `.dsh*`.
 *  - Tools return clipped content; the full file body is never dumped wholesale.
 */
/**
 * Apply the plugin Config's vaultDir (+ the archive dataDir for separation).
 * Either root may be empty to disable the respective feature.
 */
export declare function configureVaultRoot(vaultDir: string | undefined, archiveRoot?: string): void;
export declare function vaultRoot(): string | undefined;
/** True when a vault-relative note path lives inside the plugin's own archive. */
export declare function isArchiveNote(relPath: string): boolean;
/** All markdown note paths under the vault (relative). */
export declare function listNotes(): string[];
/** Safely resolve a vault-relative path to absolute; throws when escaping. */
export declare function resolveVaultPath(relPath: string): string;
/** Parse Obsidian YAML front-matter (id/kind/title/tags/repo…) leniently. */
export declare function parseFrontMatter(text: string): {
    fm: Record<string, string>;
    body: string;
};
export interface VaultNoteHit {
    /** Path relative to the vault root (use with vault_read / wikilinks). */
    readonly path: string;
    /** File name without .md (Obsidian note name). */
    readonly basename: string;
    readonly title: string;
    readonly tags: string[];
    /**
     * True when the note lives INSIDE dsh-codevault's own archive (its cards /
     * hub / MOC). Linking to archive cards is usually self-referencing noise;
     * prefer the user's own notes.
     */
    readonly inArchive: boolean;
    /** One-line context around the first match (for search). */
    readonly snippet: string;
}
export interface VaultSearchParams {
    /** Case-insensitive substring across note body + filename. */
    readonly query?: string;
    /** Restrict to notes whose front-matter `title`/filename contains this. */
    readonly title?: string;
    /** Exact front-matter tag (lowercase). */
    readonly tag?: string;
    /** Subdirectory filter (vault-relative, e.g. "源码阅读"); empty = whole vault. */
    readonly folder?: string;
    /**
     * Note scope: `'user'` (default) = the user's own notes only; `'archive'` =
     * only dsh-codevault's own cards; `'all'` = both. Archive separation needs
     * dataDir to sit inside the vault; otherwise every note counts as user's.
     */
    readonly scope?: 'user' | 'archive' | 'all';
    /** Max results (1–50). */
    readonly limit?: number;
}
export interface VaultSearchResult {
    readonly total: number;
    readonly notes: readonly VaultNoteHit[];
}
/** Search vault notes by body text / title / tag (cheap, deterministic). */
export declare function searchVault(params: VaultSearchParams): VaultSearchResult;
/** Read a vault note by relative path (clipped). Throws outside vault / missing. */
export declare function readVaultNote(relPath: string, maxChars?: number): {
    path: string;
    content: string;
};
export interface SuggestParams {
    /** Keywords/tags to match against note title + body (case-insensitive). */
    readonly words: readonly string[];
    /** Max candidates (1–20). */
    readonly limit?: number;
}
export interface SuggestHit {
    readonly path: string;
    readonly basename: string;
    readonly title: string;
    readonly tags: string[];
    /** How many of the given words matched (higher = more relevant). */
    readonly matched: number;
    /** Which of the words actually matched, in input order. */
    readonly hits: string[];
    readonly snippet: string;
}
export interface SuggestResult {
    readonly total: number;
    readonly suggestions: readonly SuggestHit[];
}
/**
 * Suggest user notes likely related to a reading (direction A polish #3).
 * Scans USER notes only (never the plugin archive), scores by how many of the
 * given words appear in title/front-matter/body, sorts desc, clips snippet.
 */
export declare function suggestVault(params: SuggestParams): SuggestResult;
//# sourceMappingURL=vault.d.ts.map