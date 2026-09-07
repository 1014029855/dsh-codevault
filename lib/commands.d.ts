/**
 * /codevault — deterministic, model-free session command.
 *
 * A slash-command handler runs WITHOUT the model: it must be pure code.
 * That is why /codevault only prints usage, plain-text snapshots and vault
 * guidance; every content-creating action (capture / note) flows through the
 * chat so the model can shape it against the code-reading skill.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { CommandResult } from '@deepseek-ai/dsh-commands';
export declare const READ_COMMAND_NAME = "codevault";
/** Pure handler core, exported so smoke.mjs can test it without a cordis ctx. */
export declare function codevaultCommandHandler(rawInput: string): CommandResult;
export declare function registerCodevaultCommand(ctx: Context): void;
//# sourceMappingURL=commands.d.ts.map