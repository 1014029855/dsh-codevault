/**
 * dsh-codevault — plugin entry (host half).
 *
 * Registers, on one context:
 *   1. the "code-reading" skill (framework the model loads for reading notes)
 *   2. read_* tools             (capture / note / expand / query / recent)
 *   3. vault_* tools            (search / read — read-only Obsidian-vault context)
 *   4. the /codevault command    (usage + vault guidance + model-free snapshot)
 *
 * Config (cordis standard, see DESIGN.md §4):
 *   dataDir — archive root where records are written.
 *             Priority: config > DSCODEVAULT_DATA_DIR env > `~/.dsh/data/dsh-codevault`.
 *   vaultDir — (optional) root of an Obsidian vault the model may READ (search
 *             + read notes) so cards can link to related knowledge. Read-only,
 *             path-confined; leave empty to disable.
 * Configure via profile `cordis.patch.yml` (or home layer):
 *   - id: dsh-codevault
 *     config:
 *       dataDir:  'D:/reading-vault'
 *       vaultDir: 'C:/Users/me/Documents/Obsidian Vault'
 *
 * inject list waits until the tools, commands and skills registries exist,
 * then apply() registers everything; cordis auto-disposes all of it when this
 * plugin unloads.
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { registerCodevaultCommand } from './commands.js'
import { CODE_READING_SKILL } from './skill.js'
import { configureDataRoot, dataRoot, ensureStore, migrateLegacyNoteFiles } from './store.js'
import { TOOLS } from './tools.js'
import { configureVaultRoot, vaultRoot } from './vault.js'

export const name = 'dsh-codevault'

export const inject = ['tools', 'commands', 'skills']

export interface Config {
  /**
   * Archive data root. Empty → DSCODEVAULT_DATA_DIR env var → default
   * `~/.dsh/data/dsh-codevault`. Point this at an Obsidian vault (or a
   * subfolder of one) to browse the archive there; see `/codevault vault`.
   */
  dataDir?: string
  /**
   * Optional Obsidian vault root the model may READ (search + read notes) for
   * related-knowledge linking. Read-only & path-confined; leave empty to
   * disable. Can equal `dataDir`'s vault or be the broader vault containing it.
   */
  vaultDir?: string
}

export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().description('源码阅读档案数据根目录（可指向 Obsidian vault 或子目录）。留空则用 DSCODEVAULT_DATA_DIR 环境变量，再退回 ~/.dsh/data/dsh-codevault。').default(''),
  vaultDir: Schema.string().description('可选：Obsidian vault 根目录，模型可只读检索/读取其中的笔记，用于把阅读卡片与已有知识关联。留空则禁用。').default(''),
})

export function apply(ctx: Context, config: Config): void {
  // Config first: it decides where everything below is persisted.
  configureDataRoot(config.dataDir)
  const root = dataRoot()
  // Vault access is read-only; archive root feeds in-archive separation.
  configureVaultRoot(config.vaultDir, root)
  ensureStore()
  // One-time migration of pre-title archives (idempotent; 0 when nothing to do).
  const migrated = migrateLegacyNoteFiles()
  for (const tool of TOOLS) {
    ctx.tools.register(tool)
  }
  ctx.skills.register(CODE_READING_SKILL)
  registerCodevaultCommand(ctx)
  console.log(
    `[${name}] loaded: skill=code-reading tools=${TOOLS.map((t) => t.name).join(',')} command=/codevault dataDir=${root}` +
      (vaultRoot() ? ` vaultDir=${vaultRoot()}` : ' (vault 检索未启用)') +
      (migrated > 0 ? ` migratedCards=${migrated}` : ''),
  )
}
