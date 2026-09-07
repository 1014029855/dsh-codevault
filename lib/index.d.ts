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
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-codevault";
export declare const inject: string[];
export interface Config {
    /**
     * Archive data root. Empty → DSCODEVAULT_DATA_DIR env var → default
     * `~/.dsh/data/dsh-codevault`. Point this at an Obsidian vault (or a
     * subfolder of one) to browse the archive there; see `/codevault vault`.
     */
    dataDir?: string;
    /**
     * Optional Obsidian vault root the model may READ (search + read notes) for
     * related-knowledge linking. Read-only & path-confined; leave empty to
     * disable. Can equal `dataDir`'s vault or be the broader vault containing it.
     */
    vaultDir?: string;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map