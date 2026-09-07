/**
 * The code-reading framework — dsh-codevault's core value.
 *
 * Registered via `ctx.skills.register()`. The model loads this body when the
 * user reads source code and wants to record it (or revisit the archive) and
 * should then write against this template and call the plugin's tools with the
 * conventions below. Content is Chinese by design (V1).
 */
import type { SkillRegistration } from '@deepseek-ai/dsh-skill';
export declare const SKILL_NAME = "code-reading";
export declare const CODE_READING_SKILL: SkillRegistration;
//# sourceMappingURL=skill.d.ts.map