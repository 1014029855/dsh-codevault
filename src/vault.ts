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

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'

/** Vault root configured by the plugin Config (`vaultDir`). Empty = unset. */
let configuredVault: string | undefined
/**
 * Archive root (the plugin's own dataDir). When it lives INSIDE the vault,
 * notes under it are "the archive" (plugin-written cards/hub/MOC) and are
 * separated from the user's own notes in search results.
 */
let configuredArchive: string | undefined

/**
 * Apply the plugin Config's vaultDir (+ the archive dataDir for separation).
 * Either root may be empty to disable the respective feature.
 */
export function configureVaultRoot(vaultDir: string | undefined, archiveRoot?: string): void {
  configuredVault = vaultDir?.trim() ? resolve(vaultDir.trim()) : undefined
  configuredArchive = archiveRoot?.trim() ? resolve(archiveRoot.trim()) : undefined
}

export function vaultRoot(): string | undefined {
  return configuredVault
}

/** True when a vault-relative note path lives inside the plugin's own archive. */
export function isArchiveNote(relPath: string): boolean {
  if (!configuredVault || !configuredArchive) return false
  const full = resolve(configuredVault, relPath)
  const prefix = configuredArchive.endsWith(sep) ? configuredArchive : configuredArchive + sep
  return full === configuredArchive || full.startsWith(prefix)
}

/** Directories never scanned inside a vault. */
const IGNORED_DIRS = new Set(['.obsidian', '.trash', 'node_modules', '.git'])

/** Note file names Obsidian treats as notes. */
function isMarkdown(file: string): boolean {
  return extname(file).toLowerCase() === '.md'
}

function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith('.dsh')
}

/** Recursively collect .md paths under root (relative), sorted for determinism. */
function collectMarkdown(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (isIgnoredDir(name)) continue
    const full = join(dir, name)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(full)
    } catch {
      continue // broken symlink / permission race
    }
    if (stat.isDirectory()) collectMarkdown(root, full, out)
    else if (stat.isFile() && isMarkdown(name)) out.push(relative(root, full))
  }
}

/** All markdown note paths under the vault (relative). */
export function listNotes(): string[] {
  if (!configuredVault) return []
  if (!existsSync(configuredVault)) return []
  const out: string[] = []
  collectMarkdown(configuredVault, configuredVault, out)
  return out.sort()
}

/** Safely resolve a vault-relative path to absolute; throws when escaping. */
export function resolveVaultPath(relPath: string): string {
  if (!configuredVault) throw new Error('vaultDir 未配置：请先在 cordis.patch.yml 里给 dsh-codevault 设置 vaultDir')
  const target = resolve(configuredVault, relPath)
  const rootPrefix = configuredVault.endsWith(sep) ? configuredVault : configuredVault + sep
  if (target !== configuredVault && !target.startsWith(rootPrefix)) {
    throw new Error(`路径越界：${relPath} 不在 vault 目录 ${configuredVault} 内`)
  }
  return target
}

/** Parse Obsidian YAML front-matter (id/kind/title/tags/repo…) leniently. */
export function parseFrontMatter(text: string): { fm: Record<string, string>; body: string } {
  const fm: Record<string, string> = {}
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(text)
  if (!m) return { fm, body: text }
  const block = m[1]!
  for (const line of block.split(/\r?\n/u)) {
    const kv = /^([A-Za-z][\w]*):\s*(.*)$/u.exec(line)
    if (kv) fm[kv[1]!] = kv[2]!.trim().replace(/^"|"$/gu, '')
  }
  return { fm, body: text.slice(m[0].length) }
}

export interface VaultNoteHit {
  /** Path relative to the vault root (use with vault_read / wikilinks). */
  readonly path: string
  /** File name without .md (Obsidian note name). */
  readonly basename: string
  readonly title: string
  readonly tags: string[]
  /**
   * True when the note lives INSIDE dsh-codevault's own archive (its cards /
   * hub / MOC). Linking to archive cards is usually self-referencing noise;
   * prefer the user's own notes.
   */
  readonly inArchive: boolean
  /** One-line context around the first match (for search). */
  readonly snippet: string
}

/** Clip text around the first case-insensitive keyword occurrence. */
function around(text: string, needle: string, radius = 60): string {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase())
  if (idx < 0) return clipText(text, 80)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + needle.length + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`
}

function clipText(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return [...t].length <= max ? t : `${[...t].slice(0, max).join('')}…`
}

export interface VaultSearchParams {
  /** Case-insensitive substring across note body + filename. */
  readonly query?: string
  /** Restrict to notes whose front-matter `title`/filename contains this. */
  readonly title?: string
  /** Exact front-matter tag (lowercase). */
  readonly tag?: string
  /** Subdirectory filter (vault-relative, e.g. "源码阅读"); empty = whole vault. */
  readonly folder?: string
  /**
   * Note scope: `'user'` (default) = the user's own notes only; `'archive'` =
   * only dsh-codevault's own cards; `'all'` = both. Archive separation needs
   * dataDir to sit inside the vault; otherwise every note counts as user's.
   */
  readonly scope?: 'user' | 'archive' | 'all'
  /** Max results (1–50). */
  readonly limit?: number
}

export interface VaultSearchResult {
  readonly total: number
  readonly notes: readonly VaultNoteHit[]
}

/** Search vault notes by body text / title / tag (cheap, deterministic). */
export function searchVault(params: VaultSearchParams): VaultSearchResult {
  const vault = configuredVault
  if (!vault) throw new Error('vaultDir 未配置：请先给插件设置 vaultDir（Obsidian vault 根目录）')
  const limit = Math.min(Math.max(1, Math.floor(params.limit ?? 20) || 20), 50)
  const needle = params.query?.trim()
  const titleNeedle = params.title?.trim().toLowerCase()
  const tagNeedle = params.tag?.trim().toLowerCase()
  const folderNeedle = params.folder?.trim()
  const scope = params.scope ?? 'user'
  const hits: VaultNoteHit[] = []
  for (const rel of listNotes()) {
    if (folderNeedle && !rel.startsWith(folderNeedle.replace(/\\/g, '/')) && !rel.startsWith(folderNeedle)) continue
    const inArchive = isArchiveNote(rel)
    if (scope === 'user' && inArchive) continue
    if (scope === 'archive' && !inArchive) continue
    const full = resolveVaultPath(rel)
    let text: string
    try {
      text = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    const { fm, body } = parseFrontMatter(text)
    const basename = rel.split(/[\\/]/u).pop()!.replace(/\.md$/u, '')
    const title = fm.title ?? basename
    const tags = (fm.tags ?? '').replace(/[\[\]"']/gu, '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    if (tagNeedle && !tags.includes(tagNeedle)) continue
    if (titleNeedle && !title.toLowerCase().includes(titleNeedle) && !basename.toLowerCase().includes(titleNeedle)) continue
    if (needle) {
      const haystack = `${title}\n${basename}\n${body}`.toLowerCase()
      if (!haystack.includes(needle.toLowerCase())) continue
      hits.push({
        path: rel,
        basename,
        title,
        tags,
        inArchive,
        snippet: around(body, needle),
      })
    } else {
      hits.push({ path: rel, basename, title, tags, inArchive, snippet: clipText(body, 100) })
    }
    if (hits.length >= limit) break
  }
  return { total: hits.length, notes: hits }
}

/** Read a vault note by relative path (clipped). Throws outside vault / missing. */
export function readVaultNote(relPath: string, maxChars = 8000): { path: string; content: string } {
  const rel = relPath.trim().replace(/^[/\\]+/u, '')
  const full = resolveVaultPath(rel)
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`vault 里没有这个笔记：${rel}`)
  const text = readFileSync(full, 'utf8')
  const chars = [...text]
  return {
    path: rel,
    content: chars.length <= maxChars ? text : `${chars.slice(0, maxChars).join('')}\n…（已截断，全文 ${chars.length} 字符）`,
  }
}

export interface SuggestParams {
  /** Keywords/tags to match against note title + body (case-insensitive). */
  readonly words: readonly string[]
  /** Max candidates (1–20). */
  readonly limit?: number
}

export interface SuggestHit {
  readonly path: string
  readonly basename: string
  readonly title: string
  readonly tags: string[]
  /** How many of the given words matched (higher = more relevant). */
  readonly matched: number
  /** Which of the words actually matched, in input order. */
  readonly hits: string[]
  readonly snippet: string
}

export interface SuggestResult {
  readonly total: number
  readonly suggestions: readonly SuggestHit[]
}

/**
 * Suggest user notes likely related to a reading (direction A polish #3).
 * Scans USER notes only (never the plugin archive), scores by how many of the
 * given words appear in title/front-matter/body, sorts desc, clips snippet.
 */
export function suggestVault(params: SuggestParams): SuggestResult {
  const vault = configuredVault
  if (!vault) throw new Error('vaultDir 未配置：请先给插件设置 vaultDir（Obsidian vault 根目录）')
  const words = (params.words ?? [])
    .map((w) => String(w).trim().toLowerCase())
    .filter((w) => w.length > 0)
  if (words.length === 0) throw new Error('words 至少给一个主题词/tag，用于找候选笔记')
  const limit = Math.min(Math.max(1, Math.floor(params.limit ?? 10) || 10), 20)
  const hits: SuggestHit[] = []
  for (const rel of listNotes()) {
    if (isArchiveNote(rel)) continue
    const full = resolveVaultPath(rel)
    let text: string
    try {
      text = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    const { fm, body } = parseFrontMatter(text)
    const basename = rel.split(/[\\/]/u).pop()!.replace(/\.md$/u, '')
    const title = fm.title ?? basename
    const tags = (fm.tags ?? '').replace(/[\[\]"']/gu, '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    const titleLower = `${title}\n${basename}`.toLowerCase()
    const bodyLower = body.toLowerCase()
    const tagsLower = tags.join('\n')
    const matchedWords = words.filter((w) => titleLower.includes(w) || bodyLower.includes(w) || tagsLower.includes(w))
    if (matchedWords.length === 0) continue
    hits.push({
      path: rel,
      basename,
      title,
      tags,
      matched: matchedWords.length,
      hits: matchedWords,
      snippet: clipText(body, 120),
    })
  }
  const sorted = hits.sort((a, b) => b.matched - a.matched || a.basename.localeCompare(b.basename))
  return { total: sorted.length, suggestions: sorted.slice(0, limit) }
}
